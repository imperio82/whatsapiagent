-- Registro de uso de IA por turno (tokens + costo estimado) para visibilidad
-- de consumo por conversación y por tenant.

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_logs_tenantId_createdAt_idx" ON "ai_usage_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_conversationId_idx" ON "ai_usage_logs"("conversationId");
