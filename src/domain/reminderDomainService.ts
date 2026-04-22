import { randomUUID } from 'crypto';
import { prisma } from '../prisma/client';
import { KEYS, mutateJsonStore, readJsonStore } from '../services/compat/appCompatJsonStore';

export type ReminderState = 'pending' | 'sent' | 'overdue' | 'cancelled';

export type CompatReminderRecord = {
  id: string;
  invoiceId: string;
  status: ReminderState;
  reminderLevel?: number;
  feeAmount?: number;
  message?: string;
  createdAt: string;
  updatedAt?: string;
};

type ReminderStore = { records: CompatReminderRecord[] };

/** Allowed transitions (strict state machine). */
const TRANSITIONS: Record<ReminderState, ReminderState[]> = {
  pending: ['sent', 'overdue', 'cancelled'],
  sent: ['overdue', 'cancelled'],
  overdue: ['cancelled'],
  cancelled: [],
};

function coerceState(raw: unknown): ReminderState {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'pending' || s === 'sent' || s === 'overdue' || s === 'cancelled') return s;
  return 'pending';
}

/** Normalize legacy two-state rows from JSON store. */
function normalizeStoredState(raw: string): ReminderState {
  const s = raw.toLowerCase();
  if (s === 'sent' || s === 'pending' || s === 'overdue' || s === 'cancelled') return s as ReminderState;
  return 'pending';
}

/**
 * Create a reminder row. New rows default to `pending` unless body.status is a valid explicit initial state.
 */
export async function createReminderFromBody(body: Record<string, unknown>): Promise<CompatReminderRecord> {
  const invoiceId = String(body.invoice_id ?? '');
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) {
    throw new Error('Invoice not found');
  }

  let initial: ReminderState = 'pending';
  if (body.status != null) {
    const want = coerceState(body.status);
    if (want !== 'pending') {
      if (!TRANSITIONS.pending.includes(want)) {
        throw new Error('Invalid initial reminder status');
      }
      initial = want;
    }
  }

  const now = new Date().toISOString();
  const rec: CompatReminderRecord = {
    id: randomUUID(),
    invoiceId,
    status: initial,
    reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : 1,
    feeAmount: body.fee_amount != null ? Number(body.fee_amount) : 0,
    message: body.message != null ? String(body.message) : '',
    createdAt: now,
    updatedAt: now,
  };

  await mutateJsonStore<ReminderStore>(KEYS.reminders, () => ({ records: [] }), (cur) => ({
    records: [...cur.records, rec],
  }));

  return rec;
}

/**
 * Apply a state transition and optional field patches. All status changes must satisfy the state machine.
 */
export async function transitionReminder(id: string, body: Record<string, unknown>): Promise<CompatReminderRecord> {
  const before = (await readJsonStore<ReminderStore>(KEYS.reminders)) ?? { records: [] };
  const current = before.records.find((r) => r.id === id);
  if (!current) {
    throw new Error('Reminder not found');
  }

  const from = normalizeStoredState(current.status);
  const target =
    body.status != null ? coerceState(body.status) : (undefined as ReminderState | undefined);

  if (target === undefined) {
    await mutateJsonStore<ReminderStore>(KEYS.reminders, () => ({ records: [] }), (cur) => ({
      records: cur.records.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          message: body.message != null ? String(body.message) : r.message,
          feeAmount: body.fee_amount != null ? Number(body.fee_amount) : r.feeAmount,
          reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : r.reminderLevel,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  } else if (target === from) {
    await mutateJsonStore<ReminderStore>(KEYS.reminders, () => ({ records: [] }), (cur) => ({
      records: cur.records.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          status: target,
          message: body.message != null ? String(body.message) : r.message,
          feeAmount: body.fee_amount != null ? Number(body.fee_amount) : r.feeAmount,
          reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : r.reminderLevel,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  } else {
    const allowed = TRANSITIONS[from];
    if (!allowed.includes(target)) {
      throw new Error(`Illegal reminder transition: ${from} → ${target}`);
    }
    await mutateJsonStore<ReminderStore>(KEYS.reminders, () => ({ records: [] }), (cur) => ({
      records: cur.records.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          status: target,
          message: body.message != null ? String(body.message) : r.message,
          feeAmount: body.fee_amount != null ? Number(body.fee_amount) : r.feeAmount,
          reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : r.reminderLevel,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }

  const store = (await readJsonStore<ReminderStore>(KEYS.reminders)) ?? { records: [] };
  const updated = store.records.find((r) => r.id === id);
  if (!updated) {
    throw new Error('Reminder not found');
  }
  return updated;
}

export async function deleteReminderRecord(id: string): Promise<void> {
  await mutateJsonStore<ReminderStore>(KEYS.reminders, () => ({ records: [] }), (cur) => ({
    records: cur.records.filter((r) => r.id !== id),
  }));
}
