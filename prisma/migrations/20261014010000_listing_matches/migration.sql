-- CreateEnum
CREATE TYPE "MatchAlertMode" AS ENUM ('APPROVAL', 'AUTO');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'SENT', 'DISMISSED', 'FAILED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "matchAlertMode" "MatchAlertMode" NOT NULL DEFAULT 'APPROVAL';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "budgetMaxCop" BIGINT,
ADD COLUMN     "searchCity" TEXT,
ADD COLUMN     "searchKind" "ListingKind",
ADD COLUMN     "searchOperation" "ListingOperation";

-- CreateTable
CREATE TABLE "listing_matches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "decidedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_matches_tenantId_status_idx" ON "listing_matches"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "listing_matches_listingId_leadId_key" ON "listing_matches"("listingId", "leadId");

-- AddForeignKey
ALTER TABLE "listing_matches" ADD CONSTRAINT "listing_matches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_matches" ADD CONSTRAINT "listing_matches_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_matches" ADD CONSTRAINT "listing_matches_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
