import type { Response } from 'express';
import { sendCompatResponse } from '../../services/compat/responseMapper';

/** PHP-style JSON responses (no `{ success: true }` wrapper) — routed through `responseMapper`. */
export function compatJson(res: Response, body: unknown, status = 200): void {
  sendCompatResponse(res, body, status);
}
