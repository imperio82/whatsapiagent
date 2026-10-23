-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('FILE', 'GOOGLE_SHEET', 'POSTGRES', 'MYSQL');

-- CreateEnum
CREATE TYPE "ImportTarget" AS ENUM ('PRODUCTS', 'LISTINGS', 'CLIENTS');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('OK', 'PARTIAL', 'ERROR');

-- CreateEnum
CREATE TYPE "ClientDateKind" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'CUSTOM');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "calendarEventUrl" TEXT,
ADD COLUMN     "calendarProvider" TEXT,
ADD COLUMN     "durationMin" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "greetingsOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "greetingMode" "MatchAlertMode" NOT NULL DEFAULT 'APPROVAL',
ADD COLUMN     "greetingTemplates" JSONB;

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "accountEmail" TEXT,
    "scopes" TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "settings" JSONB,
    "lastError" TEXT,
    "connectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "target" "ImportTarget" NOT NULL,
    "config" JSONB NOT NULL,
    "secretEnc" TEXT,
    "mapping" JSONB NOT NULL,
    "syncEveryMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastStatus" "SyncStatus",
    "lastResult" JSONB,
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_dates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ClientDateKind" NOT NULL,
    "label" TEXT,
    "personName" TEXT,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "message" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_relations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "relatedClientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "greetings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientDateId" TEXT NOT NULL,
    "occursOn" DATE NOT NULL,
    "message" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "decidedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "greetings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_provider_key" ON "integrations"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "data_sources_tenantId_idx" ON "data_sources"("tenantId");

-- CreateIndex
CREATE INDEX "client_dates_tenantId_month_day_idx" ON "client_dates"("tenantId", "month", "day");

-- CreateIndex
CREATE INDEX "client_dates_clientId_idx" ON "client_dates"("clientId");

-- CreateIndex
CREATE INDEX "client_relations_tenantId_idx" ON "client_relations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "client_relations_clientId_relatedClientId_key" ON "client_relations"("clientId", "relatedClientId");

-- CreateIndex
CREATE INDEX "greetings_tenantId_status_idx" ON "greetings"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "greetings_clientDateId_occursOn_key" ON "greetings"("clientDateId", "occursOn");

-- CreateIndex
CREATE UNIQUE INDEX "listings_tenantId_externalId_key" ON "listings"("tenantId", "externalId");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dates" ADD CONSTRAINT "client_dates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_dates" ADD CONSTRAINT "client_dates_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_relations" ADD CONSTRAINT "client_relations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_relations" ADD CONSTRAINT "client_relations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_relations" ADD CONSTRAINT "client_relations_relatedClientId_fkey" FOREIGN KEY ("relatedClientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greetings" ADD CONSTRAINT "greetings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greetings" ADD CONSTRAINT "greetings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "greetings" ADD CONSTRAINT "greetings_clientDateId_fkey" FOREIGN KEY ("clientDateId") REFERENCES "client_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

