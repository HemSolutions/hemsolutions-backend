"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminRefreshApp = registerAdminRefreshApp;
exports.triggerAdminDashboardRefresh = triggerAdminDashboardRefresh;
const adminSocketService_1 = require("./adminSocketService");
let registeredApp;
function registerAdminRefreshApp(app) {
    registeredApp = app;
}
function triggerAdminDashboardRefresh() {
    if (!registeredApp)
        return;
    (0, adminSocketService_1.emitAdminDashboardRefresh)(registeredApp);
}
//# sourceMappingURL=adminRefreshBridge.js.map