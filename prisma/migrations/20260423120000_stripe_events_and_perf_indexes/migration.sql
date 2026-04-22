CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bookings_workerId_status_scheduledDate_idx"
  ON "bookings" ("workerId", "status", "scheduledDate");

CREATE INDEX IF NOT EXISTS "invoices_userId_status_idx"
  ON "invoices" ("userId", "status");

CREATE INDEX IF NOT EXISTS "messages_bookingId_createdAt_idx"
  ON "messages" ("bookingId", "createdAt");
