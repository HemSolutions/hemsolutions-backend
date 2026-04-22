"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.createBulkNotifications = createBulkNotifications;
const client_1 = require("../prisma/client");
const logger_1 = require("../utils/logger");
async function createNotification(input) {
    try {
        await client_1.prisma.notification.create({
            data: {
                userId: input.userId,
                type: input.type,
                title: input.title,
                message: input.message,
                data: (input.data ?? {}),
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create notification', error);
    }
}
async function createBulkNotifications(userIds, input) {
    try {
        const dataJson = (input.data ?? {});
        await client_1.prisma.notification.createMany({
            data: userIds.map((userId) => ({
                userId,
                type: input.type,
                title: input.title,
                message: input.message,
                data: dataJson,
            })),
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to create bulk notifications', error);
    }
}
//# sourceMappingURL=notificationService.js.map