import { prisma } from '../../prisma/client';

/** Persisted compat data without schema migrations — stored in AdminSettings.value (Json). */

export const KEYS = {
  reminders: 'compat_reminders_v1',
  payments: 'compat_payments_v1',
  receipts: 'compat_receipts_v1',
  settingsBundle: 'compat_settings_bundle_v1',
  reklamation: 'compat_reklamation_v1',
  customerPrices: 'compat_customer_prices_v1',
  smsLog: 'compat_sms_log_v1',
} as const;

export async function readJsonStore<T>(key: string): Promise<T | null> {
  const row = await prisma.adminSettings.findUnique({ where: { key } });
  if (!row) return null;
  return row.value as T;
}

export async function writeJsonStore(key: string, value: object): Promise<void> {
  await prisma.adminSettings.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function mutateJsonStore<T extends object>(
  key: string,
  defaultFactory: () => T,
  mutator: (current: T) => T
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.adminSettings.findUnique({ where: { key } });
    const current = (row?.value as T | null) ?? defaultFactory();
    const next = mutator(current);
    await tx.adminSettings.upsert({
      where: { key },
      create: { key, value: next as object },
      update: { value: next as object },
    });
    return next;
  });
}
