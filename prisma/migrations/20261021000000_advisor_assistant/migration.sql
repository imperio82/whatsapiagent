-- Asistente del asesor por WhatsApp
ALTER TABLE "tenants" ADD COLUMN "advisorAssistant" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "memberships" ADD COLUMN "whatsappPhone" TEXT;

CREATE UNIQUE INDEX "memberships_tenantId_whatsappPhone_key" ON "memberships"("tenantId", "whatsappPhone");
