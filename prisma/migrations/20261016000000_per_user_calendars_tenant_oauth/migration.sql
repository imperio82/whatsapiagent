-- DropIndex
DROP INDEX "integrations_tenantId_provider_key";

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "calendarIntegrationId" TEXT;

-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "ownerKey" TEXT NOT NULL DEFAULT 'business',
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "integration_apps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_apps_tenantId_provider_key" ON "integration_apps"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "integrations_tenantId_provider_idx" ON "integrations"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenantId_provider_ownerKey_key" ON "integrations"("tenantId", "provider", "ownerKey");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_calendarIntegrationId_fkey" FOREIGN KEY ("calendarIntegrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_apps" ADD CONSTRAINT "integration_apps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

