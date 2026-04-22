-- Message threads: optional conversation key; cascade messages when booking is removed.
ALTER TABLE "messages" ADD COLUMN "conversationId" TEXT;

CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_bookingId_fkey";

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
