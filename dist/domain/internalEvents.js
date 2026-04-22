"use strict";
/**
 * In-process domain events (sync). No external broker.
 * Controllers must not emit; domain services emit after successful mutations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeDomainEvents = subscribeDomainEvents;
exports.emitDomainEvent = emitDomainEvent;
const handlers = [];
function subscribeDomainEvents(handler) {
    handlers.push(handler);
}
async function emitDomainEvent(event) {
    for (const h of handlers) {
        await h(event);
    }
}
//# sourceMappingURL=internalEvents.js.map