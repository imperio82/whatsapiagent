-- Avisos al cliente que esperan a que vuelva a escribir (fuera de la ventana de 24 horas de WhatsApp)
CREATE TABLE "pending_notices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_notices_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_notices_tenantId_clientId_sentAt_idx" ON "pending_notices"("tenantId", "clientId", "sentAt");

ALTER TABLE "pending_notices" ADD CONSTRAINT "pending_notices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pending_notices" ADD CONSTRAINT "pending_notices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
