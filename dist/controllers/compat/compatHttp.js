"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compatJson = compatJson;
const responseMapper_1 = require("../../services/compat/responseMapper");
/** PHP-style JSON responses (no `{ success: true }` wrapper) — routed through `responseMapper`. */
function compatJson(res, body, status = 200) {
    (0, responseMapper_1.sendCompatResponse)(res, body, status);
}
//# sourceMappingURL=compatHttp.js.map