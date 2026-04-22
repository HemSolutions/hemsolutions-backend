"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const bridge = __importStar(require("../../controllers/compat/appCompatBridgeController"));
const bookingsCompatController_1 = require("../../controllers/compat/bookingsCompatController");
const customersCompatController_1 = require("../../controllers/compat/customersCompatController");
const invoicesCompatController_1 = require("../../controllers/compat/invoicesCompatController");
const workersCompatController_1 = require("../../controllers/compat/workersCompatController");
const compatReklamationController_1 = require("../../controllers/compat/compatReklamationController");
const compatCustomerPricesController_1 = require("../../controllers/compat/compatCustomerPricesController");
const compatPdfController_1 = require("../../controllers/compat/compatPdfController");
const compatSmsController_1 = require("../../controllers/compat/compatSmsController");
const router = (0, express_1.Router)();
/** App legacy (authenticate only) — must be registered before admin-only compat block */
router.all('/messages', auth_1.authenticate, bridge.handleMessages);
router.all('/payments', auth_1.authenticate, bridge.handlePayments);
router.all('/receipts', auth_1.authenticate, bridge.handleReceipts);
router.all('/settings', auth_1.authenticate, bridge.handleSettings);
router.all('/reklamation', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN'), compatReklamationController_1.handleReklamation);
router.all('/customer-prices', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN'), compatCustomerPricesController_1.handleCustomerPrices);
router.all('/articles', auth_1.authenticate, bridge.handleArticles);
router.all('/reminders', auth_1.authenticate, bridge.handleReminders);
router.all('/sms-service', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN'), compatSmsController_1.handleSmsService);
router.all('/pdf/:resource', auth_1.authenticate, compatPdfController_1.handleCompatPdf);
router.all('/admin/:segment', auth_1.authenticate, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN'), bridge.handleAdminSegment);
router.use(auth_1.authenticate, (0, auth_1.requireRole)('ADMIN', 'SUPER_ADMIN'));
router.all('/customers', customersCompatController_1.handleCustomers);
router.all('/bookings', bookingsCompatController_1.handleBookings);
router.all('/invoices', invoicesCompatController_1.handleInvoices);
router.all('/workers', workersCompatController_1.handleWorkers);
exports.default = router;
//# sourceMappingURL=index.js.map