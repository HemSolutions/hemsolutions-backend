import { randomUUID } from 'crypto';
import { NotificationType } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { KEYS, mutateJsonStore, readJsonStore } from './appCompatJsonStore';
import { createNotification } from '../notificationService';
import type { SmsJobPayload } from '../jobs/jobTypes';
import { logger } from '../../utils/logger';

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

async function sendViaConfiguredProvider(
  to: string,
  message: string
): Promise<{ ok: boolean; provider: string; externalId?: string; error?: string }> {
  const url = process.env.SMS_API_URL?.trim();
  const user = process.env.SMS_API_USER?.trim();
  const pass = process.env.SMS_API_PASS?.trim();
  const from = process.env.SMS_FROM?.trim() || 'HemSolutions';

  if (!url || !user || !pass) {
    return { ok: true, provider: 'simulated' };
  }

  try {
    const body = new URLSearchParams();
    body.set('from', from);
    body.set('to', to);
    body.set('message', message);
    const auth = Buffer.from(`${user}:${pass}`).toString('base64');
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const text = await r.text();
    if (!r.ok) {
      return { ok: false, provider: 'http', error: text || r.statusText };
    }
    let externalId: string | undefined;
    try {
      const j = JSON.parse(text) as { id?: string };
      externalId = j.id;
    } catch {
      /* ignore */
    }
    return { ok: true, provider: 'http', externalId };
  } catch (e) {
    return { ok: false, provider: 'http', error: e instanceof Error ? e.message : 'fetch error' };
  }
}

/** SMS side-effects executed only from the job worker (not from HTTP controllers). */
export async function processCompatSmsSend(payload: SmsJobPayload): Promise<void> {
  const { to, message, targetUserId, rawTo } = payload;
  const send = await sendViaConfiguredProvider(to, message);
  if (send.provider === 'simulated') {
    logger.warn('SMS provider not configured, simulated SMS delivery', { to });
  }
  const now = new Date().toISOString();
  const entry: SmsLogEntry = {
    id: randomUUID(),
    to,
    message,
    status: send.ok ? (send.provider === 'simulated' ? 'simulated' : 'sent') : 'failed',
    provider: send.provider,
    external_id: send.externalId,
    error: send.error,
    target_user_id: targetUserId,
    created_at: now,
  };

  await mutateJsonStore<SmsStore>(KEYS.smsLog, defaultStore, (cur) => ({
    messages: [...cur.messages, entry],
  }));

  const notifyUserId =
    targetUserId ??
    (
      await prisma.user.findFirst({
        where: { phone: { contains: rawTo.replace(/^\+46/, '0') } },
        select: { id: true },
      })
    )?.id;

  if (notifyUserId) {
    await createNotification({
      userId: notifyUserId,
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title: send.ok ? 'SMS' : 'SMS misslyckades',
      message: send.ok ? `Till ${to}: ${message.slice(0, 200)}` : (send.error ?? 'Fel'),
      data: {
        channel: 'sms',
        sms_id: entry.id,
        status: entry.status,
        provider: entry.provider,
        external_id: entry.external_id,
      },
    });
  }
}

export async function readLatestSmsEntryForResponse(
  to: string,
  message: string
): Promise<SmsLogEntry | null> {
  const store = (await readJsonStore<SmsStore>(KEYS.smsLog)) ?? defaultStore();
  const hit = [...store.messages].reverse().find((m) => m.to === to && m.message === message);
  return hit ?? null;
}
