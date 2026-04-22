import type { Request, Response } from 'express';
import { compatJson } from './compatHttp';
import { KEYS, readJsonStore } from '../../services/compat/appCompatJsonStore';
import { enqueueAndAwait } from '../../services/jobs/jobQueue';
import {
  readLatestSmsEntryForResponse,
} from '../../services/compat/compatSmsJobRunner';

type SmsLogEntry = {
  id: string;
  to: string;
  message: string;
  status: 'sent' | 'failed' | 'simulated';
  provider: string;
  external_id?: string;
  error?: string;
  target_user_id?: string;
  created_at: string;
};

type SmsStore = { messages: SmsLogEntry[] };

function defaultStore(): SmsStore {
  return { messages: [] };
}

function formatE164Swedish(raw: string): string {
  let n = raw.replace(/\s+/g, '');
  if (n.startsWith('0')) {
    return '+46' + n.slice(1);
  }
  if (!n.startsWith('+')) {
    return '+' + n;
  }
  return n;
}

/**
 * SMS via env provider when configured; otherwise simulated (still logged + in-app notification).
 * GET returns persisted log (newest first).
 */
export async function handleSmsService(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
      const store = (await readJsonStore<SmsStore>(KEYS.smsLog)) ?? defaultStore();
      const sorted = [...store.messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      compatJson(res, { messages: sorted.slice(0, limit), total: store.messages.length });
      return;
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const rawTo = String(body.to ?? body.phone ?? '').trim();
      const message = String(body.message ?? body.body ?? '').trim();
      const targetUserId = body.user_id != null ? String(body.user_id) : undefined;

      if (!rawTo || !message) {
        compatJson(res, { error: 'to (or phone) and message (or body) required' }, 400);
        return;
      }

      const to = formatE164Swedish(rawTo);
      try {
        await enqueueAndAwait(
          {
            type: 'SEND_SMS',
            payload: { to, message, targetUserId, rawTo },
          },
          15_000
        );
      } catch {
        compatJson(res, { error: 'SMS processing timeout' }, 504);
        return;
      }

      const entry =
        (await readLatestSmsEntryForResponse(to, message)) ??
        ({
          id: '',
          to,
          message,
          status: 'simulated',
          provider: 'unknown',
          created_at: new Date().toISOString(),
        } as SmsLogEntry);

      compatJson(res, {
        id: entry.id,
        to: entry.to,
        status: entry.status,
        provider: entry.provider,
        external_id: entry.external_id ?? null,
        error: entry.error ?? null,
        created_at: entry.created_at,
        simulated: entry.status === 'simulated' ? 1 : 0,
      });
      return;
    }

    compatJson(res, { error: 'Method not allowed' }, 405);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('compat sms-service:', e);
    }
    compatJson(res, { error: 'Server error' }, 500);
  }
}
