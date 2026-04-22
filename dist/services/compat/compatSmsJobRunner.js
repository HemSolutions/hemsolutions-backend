"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCompatSmsSend = processCompatSmsSend;
exports.readLatestSmsEntryForResponse = readLatestSmsEntryForResponse;
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const client_2 = require("../../prisma/client");
const appCompatJsonStore_1 = require("./appCompatJsonStore");
const notificationService_1 = require("../notificationService");
const logger_1 = require("../../utils/logger");
function defaultStore() {
    return { messages: [] };
}
async function sendViaConfiguredProvider(to, message) {
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
        let externalId;
        try {
            const j = JSON.parse(text);
            externalId = j.id;
        }
        catch {
            /* ignore */
        }
        return { ok: true, provider: 'http', externalId };
    }
    catch (e) {
        return { ok: false, provider: 'http', error: e instanceof Error ? e.message : 'fetch error' };
    }
}
/** SMS side-effects executed only from the job worker (not from HTTP controllers). */
async function processCompatSmsSend(payload) {
    const { to, message, targetUserId, rawTo } = payload;
    const send = await sendViaConfiguredProvider(to, message);
    if (send.provider === 'simulated') {
        logger_1.logger.warn('SMS provider not configured, simulated SMS delivery', { to });
    }
    const now = new Date().toISOString();
    const entry = {
        id: (0, crypto_1.randomUUID)(),
        to,
        message,
        status: send.ok ? (send.provider === 'simulated' ? 'simulated' : 'sent') : 'failed',
        provider: send.provider,
        external_id: send.externalId,
        error: send.error,
        target_user_id: targetUserId,
        created_at: now,
    };
    await (0, appCompatJsonStore_1.mutateJsonStore)(appCompatJsonStore_1.KEYS.smsLog, defaultStore, (cur) => ({
        messages: [...cur.messages, entry],
    }));
    const notifyUserId = targetUserId ??
        (await client_2.prisma.user.findFirst({
            where: { phone: { contains: rawTo.replace(/^\+46/, '0') } },
            select: { id: true },
        }))?.id;
    if (notifyUserId) {
        await (0, notificationService_1.createNotification)({
            userId: notifyUserId,
            type: client_1.NotificationType.SYSTEM_ANNOUNCEMENT,
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
async function readLatestSmsEntryForResponse(to, message) {
    const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.smsLog)) ?? defaultStore();
    const hit = [...store.messages].reverse().find((m) => m.to === to && m.message === message);
    return hit ?? null;
}
//# sourceMappingURL=compatSmsJobRunner.js.map