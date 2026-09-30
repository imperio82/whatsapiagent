-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "aiAgentName" TEXT,
ADD COLUMN     "aiAutoReply" BOOLEAN NOT NULL DEFAULT false;
