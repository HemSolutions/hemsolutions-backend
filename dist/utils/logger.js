"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const config_1 = require("../config");
exports.logger = {
    info(message, meta) {
        if (config_1.config.server.isProduction)
            return;
        if (meta)
            console.log(message, meta);
        else
            console.log(message);
    },
    warn(message, meta) {
        console.warn(message, meta ?? '');
    },
    error(message, err) {
        console.error(message, err instanceof Error ? err.stack ?? err.message : err);
    },
};
//# sourceMappingURL=logger.js.map