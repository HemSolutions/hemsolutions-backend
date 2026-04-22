export declare function getCache(key: string): Promise<string | null>;
export declare function setCache(key: string, value: string, ttlSec: number): Promise<void>;
export declare function invalidatePattern(pattern: string): Promise<void>;
