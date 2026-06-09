-- AlterEnum
-- Notification types for "the team has seen your message" and "your conversation
-- was resolved". Separate migration because the contact_thread migration was
-- already applied; IF NOT EXISTS keeps it safe on databases that have them.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTACT_SEEN';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTACT_RESOLVED';
