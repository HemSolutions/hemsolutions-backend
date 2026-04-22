"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReminderFromBody = createReminderFromBody;
exports.transitionReminder = transitionReminder;
exports.deleteReminderRecord = deleteReminderRecord;
const crypto_1 = require("crypto");
const client_1 = require("../prisma/client");
const appCompatJsonStore_1 = require("../services/compat/appCompatJsonStore");
/** Allowed transitions (strict state machine). */
const TRANSITIONS = {
    pending: ['sent', 'overdue', 'cancelled'],
    sent: ['overdue', 'cancelled'],
    overdue: ['cancelled'],
    cancelled: [],
};
function coerceState(raw) {
    const s = String(raw ?? '').toLowerCase();
    if (s === 'pending' || s === 'sent' || s === 'overdue' || s === 'cancelled')
        return s;
    return 'pending';
}
/** Normalize legacy two-state rows from JSON store. */
function normalizeStoredState(raw) {
    const s = raw.toLowerCase();
    if (s === 'sent' || s === 'pending' || s === 'overdue' || s === 'cancelled')
        return s;
    return 'pending';
}
/**
 * Create a reminder row. New rows default to `pending` unless body.status is a valid explicit initial state.
 */
async function createReminderFromBody(body) {
    const invoiceId = String(body.invoice_id ?? '');
    const inv = await client_1.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) {
        throw new Error('Invoice not found');
    }
    let initial = 'pending';
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
    const rec = {
        id: (0, crypto_1.randomUUID)(),
        invoiceId,
        status: initial,
        reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : 1,
        feeAmount: body.fee_amount != null ? Number(body.fee_amount) : 0,
        message: body.message != null ? String(body.message) : '',
        createdAt: now,
        updatedAt: now,
    };
    await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reminders, () => ({ records: [] }), (cur) => ({
        records: [...cur.records, rec],
    }));
    return rec;
}
/**
 * Apply a state transition and optional field patches. All status changes must satisfy the state machine.
 */
async function transitionReminder(id, body) {
    const before = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reminders)) ?? { records: [] };
    const current = before.records.find((r) => r.id === id);
    if (!current) {
        throw new Error('Reminder not found');
    }
    const from = normalizeStoredState(current.status);
    const target = body.status != null ? coerceState(body.status) : undefined;
    if (target === undefined) {
        await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reminders, () => ({ records: [] }), (cur) => ({
            records: cur.records.map((r) => {
                if (r.id !== id)
                    return r;
                return {
                    ...r,
                    message: body.message != null ? String(body.message) : r.message,
                    feeAmount: body.fee_amount != null ? Number(body.fee_amount) : r.feeAmount,
                    reminderLevel: body.reminder_level != null ? Number(body.reminder_level) : r.reminderLevel,
                    updatedAt: new Date().toISOString(),
                };
            }),
        }));
    }
    else if (target === from) {
        await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reminders, () => ({ records: [] }), (cur) => ({
            records: cur.records.map((r) => {
                if (r.id !== id)
                    return r;
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
    else {
        const allowed = TRANSITIONS[from];
        if (!allowed.includes(target)) {
            throw new Error(`Illegal reminder transition: ${from} → ${target}`);
        }
        await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reminders, () => ({ records: [] }), (cur) => ({
            records: cur.records.map((r) => {
                if (r.id !== id)
                    return r;
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
    const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.reminders)) ?? { records: [] };
    const updated = store.records.find((r) => r.id === id);
    if (!updated) {
        throw new Error('Reminder not found');
    }
    return updated;
}
async function deleteReminderRecord(id) {
    await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.reminders, () => ({ records: [] }), (cur) => ({
        records: cur.records.filter((r) => r.id !== id),
    }));
}
//# sourceMappingURL=reminderDomainService.js.map