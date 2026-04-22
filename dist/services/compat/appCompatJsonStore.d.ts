/** Persisted compat data without schema migrations — stored in AdminSettings.value (Json). */
export declare const KEYS: {
    readonly reminders: "compat_reminders_v1";
    readonly payments: "compat_payments_v1";
    readonly receipts: "compat_receipts_v1";
    readonly settingsBundle: "compat_settings_bundle_v1";
    readonly reklamation: "compat_reklamation_v1";
    readonly customerPrices: "compat_customer_prices_v1";
    readonly smsLog: "compat_sms_log_v1";
};
export declare function readJsonStore<T>(key: string): Promise<T | null>;
export declare function writeJsonStore(key: string, value: object): Promise<void>;
export declare function mutateJsonStore<T extends object>(key: string, defaultFactory: () => T, mutator: (current: T) => T): Promise<T>;
