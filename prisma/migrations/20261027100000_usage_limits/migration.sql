-- Tokens servidos desde la caché del proveedor, para descontarlos del costo
ALTER TABLE "ai_usage_logs" ADD COLUMN "cachedTokensIn" INTEGER NOT NULL DEFAULT 0;

-- Estado del cupo de cada negocio por mes: cuándo llegó al tope (inicio de la gracia) y clientes en espera
CREATE TABLE "usage_months" (
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "capReachedAt" TIMESTAMP(3),
    "waitMessages" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_months_pkey" PRIMARY KEY ("tenantId","month")
);

-- Recargas de saldo que pide el dueño del negocio
CREATE TYPE "RechargeStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

CREATE TABLE "recharges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amountCop" INTEGER NOT NULL,
    "clients" INTEGER NOT NULL,
    "creditMicroUsd" INTEGER NOT NULL,
    "status" "RechargeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "resolvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "recharges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recharges_tenantId_createdAt_idx" ON "recharges"("tenantId", "createdAt");
CREATE INDEX "recharges_status_idx" ON "recharges"("status");

ALTER TABLE "recharges" ADD CONSTRAINT "recharges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
