-- CreateEnum
CREATE TYPE "AgentProfile" AS ENUM ('RETAIL', 'BROKERAGE');

-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('BUYER', 'SELLER');

-- CreateEnum
CREATE TYPE "LeadTemperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "AiRuleCategory" AS ENUM ('POLICY', 'QUALIFICATION', 'HANDOFF', 'TONE');

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('VEHICLE', 'PROPERTY', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingOperation" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('PENDING_REVIEW', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "agentProfile" "AgentProfile" NOT NULL DEFAULT 'RETAIL',
ADD COLUMN     "aiRulesSeededAt" TIMESTAMP(3),
ADD COLUMN     "listingSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ownerNotifyPhone" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "leadType" "LeadType" NOT NULL DEFAULT 'BUYER',
ADD COLUMN     "listingId" TEXT,
ADD COLUMN     "offerCop" BIGINT,
ADD COLUMN     "qualification" JSONB,
ADD COLUMN     "temperature" "LeadTemperature";

-- CreateTable
CREATE TABLE "ai_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" "AiRuleCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "systemKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ListingKind" NOT NULL,
    "operation" "ListingOperation" NOT NULL DEFAULT 'SALE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceCop" BIGINT NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT,
    "attributes" JSONB,
    "photos" TEXT[],
    "status" "ListingStatus" NOT NULL DEFAULT 'AVAILABLE',
    "ownerName" TEXT,
    "ownerPhone" TEXT,
    "exactAddress" TEXT,
    "privateNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT,
    "listingId" TEXT,
    "requestedSlot" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_rules_tenantId_isActive_idx" ON "ai_rules"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ai_rules_tenantId_systemKey_key" ON "ai_rules"("tenantId", "systemKey");

-- CreateIndex
CREATE INDEX "listings_tenantId_status_idx" ON "listings"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listings_tenantId_code_key" ON "listings"("tenantId", "code");

-- CreateIndex
CREATE INDEX "appointments_tenantId_status_idx" ON "appointments"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_rules" ADD CONSTRAINT "ai_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

