import type { Response } from 'express';
/** PHP-style JSON responses (no `{ success: true }` wrapper) — routed through `responseMapper`. */
export declare function compatJson(res: Response, body: unknown, status?: number): void;
//# sourceMappingURL=compatHttp.d.ts.map