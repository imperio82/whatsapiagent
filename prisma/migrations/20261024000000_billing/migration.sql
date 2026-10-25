-- Planes, pagos y créditos de IA por negocio
CREATE TYPE "PlanTier" AS ENUM ('EMPRENDE', 'PRO', 'NEGOCIO');
CREATE TYPE "BillingKind" AS ENUM ('PAYMENT', 'CREDIT');

ALTER TABLE "tenants" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'EMPRENDE';
ALTER TABLE "tenants" ADD COLUMN "paidUntil" TIMESTAMP(3);

CREATE TABLE "billing_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "BillingKind" NOT NULL,
    "amountCop" INTEGER,
    "months" INTEGER,
    "creditMicroUsd" INTEGER,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_entries_tenantId_createdAt_idx" ON "billing_entries"("tenantId", "createdAt");

ALTER TABLE "billing_entries" ADD CONSTRAINT "billing_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
