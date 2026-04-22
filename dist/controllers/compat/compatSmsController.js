"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSmsService = handleSmsService;
const compatHttp_1 = require("./compatHttp");
const appCompatJsonStore_1 = require("../../services/compat/appCompatJsonStore");
const jobQueue_1 = require("../../services/jobs/jobQueue");
const compatSmsJobRunner_1 = require("../../services/compat/compatSmsJobRunner");
function defaultStore() {
    return { messages: [] };
}
function formatE164Swedish(raw) {
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
async function handleSmsService(req, res) {
    try {
        if (req.method === 'GET') {
            const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10) || 50));
            const store = (await (0, appCompatJsonStore_1.readJsonStore)(appCompatJsonStore_1.KEYS.smsLog)) ?? defaultStore();
            const sorted = [...store.messages].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
            (0, compatHttp_1.compatJson)(res, { messages: sorted.slice(0, limit), total: store.messages.length });
            return;
        }
        if (req.method === 'POST') {
            const body = (req.body ?? {});
            const rawTo = String(body.to ?? body.phone ?? '').trim();
            const message = String(body.message ?? body.body ?? '').trim();
            const targetUserId = body.user_id != null ? String(body.user_id) : undefined;
            if (!rawTo || !message) {
                (0, compatHttp_1.compatJson)(res, { error: 'to (or phone) and message (or body) required' }, 400);
                return;
            }
            const to = formatE164Swedish(rawTo);
            try {
                await (0, jobQueue_1.enqueueAndAwait)({
                    type: 'SEND_SMS',
                    payload: { to, message, targetUserId, rawTo },
                }, 15_000);
            }
            catch {
                (0, compatHttp_1.compatJson)(res, { error: 'SMS processing timeout' }, 504);
                return;
            }
            const entry = (await (0, compatSmsJobRunner_1.readLatestSmsEntryForResponse)(to, message)) ??
                {
                    id: '',
                    to,
                    message,
                    status: 'simulated',
                    provider: 'unknown',
                    created_at: new Date().toISOString(),
                };
            (0, compatHttp_1.compatJson)(res, {
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
        (0, compatHttp_1.compatJson)(res, { error: 'Method not allowed' }, 405);
    }
    catch (e) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('compat sms-service:', e);
        }
        (0, compatHttp_1.compatJson)(res, { error: 'Server error' }, 500);
    }
}
//# sourceMappingURL=compatSmsController.js.map