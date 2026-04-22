"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEYS = void 0;
exports.readJsonStore = readJsonStore;
exports.writeJsonStore = writeJsonStore;
exports.mutateJsonStore = mutateJsonStore;
const client_1 = require("../../prisma/client");
/** Persisted compat data without schema migrations — stored in AdminSettings.value (Json). */
exports.KEYS = {
    reminders: 'compat_reminders_v1',
    payments: 'compat_payments_v1',
    receipts: 'compat_receipts_v1',
    settingsBundle: 'compat_settings_bundle_v1',
    reklamation: 'compat_reklamation_v1',
    customerPrices: 'compat_customer_prices_v1',
    smsLog: 'compat_sms_log_v1',
};
async function readJsonStore(key) {
    const row = await client_1.prisma.adminSettings.findUnique({ where: { key } });
    if (!row)
        return null;
    return row.value;
}
async function writeJsonStore(key, value) {
    await client_1.prisma.adminSettings.upsert({
        where: { key },
        create: { key, value },
        update: { value },
    });
}
async function mutateJsonStore(key, defaultFactory, mutator) {
    return client_1.prisma.$transaction(async (tx) => {
        const row = await tx.adminSettings.findUnique({ where: { key } });
        const current = row?.value ?? defaultFactory();
        const next = mutator(current);
        await tx.adminSettings.upsert({
            where: { key },
            create: { key, value: next },
            update: { value: next },
        });
        return next;
    });
}
//# sourceMappingURL=appCompatJsonStore.js.map