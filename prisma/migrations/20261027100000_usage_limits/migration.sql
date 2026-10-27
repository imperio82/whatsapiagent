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
