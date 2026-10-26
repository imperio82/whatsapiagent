-- Recordatorios: citas, seguimiento y recordatorios libres (las felicitaciones siguen en "greetings")
CREATE TYPE "ReminderKind" AS ENUM ('APPOINTMENT', 'FOLLOW_UP', 'CUSTOM');

ALTER TABLE "tenants" ADD COLUMN "appointmentReminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenants" ADD COLUMN "appointmentReminderHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "tenants" ADD COLUMN "appointmentReminderMode" "MatchAlertMode" NOT NULL DEFAULT 'APPROVAL';
ALTER TABLE "tenants" ADD COLUMN "followUpEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenants" ADD COLUMN "followUpHours" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "tenants" ADD COLUMN "followUpMode" "MatchAlertMode" NOT NULL DEFAULT 'APPROVAL';
ALTER TABLE "tenants" ADD COLUMN "reminderTemplates" JSONB;

CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "note" TEXT,
    "autoSend" BOOLEAN NOT NULL DEFAULT false,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "appointmentId" TEXT,
    "appointmentAt" TIMESTAMP(3),
    "conversationId" TEXT,
    "sourceAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "decidedBy" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reminders_appointmentId_appointmentAt_key" ON "reminders"("appointmentId", "appointmentAt");
CREATE UNIQUE INDEX "reminders_conversationId_sourceAt_key" ON "reminders"("conversationId", "sourceAt");
CREATE INDEX "reminders_tenantId_status_dueAt_idx" ON "reminders"("tenantId", "status", "dueAt");
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
