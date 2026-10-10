-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "aiPausedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ai_usage_logs" ADD COLUMN     "intent" TEXT,
ADD COLUMN     "trace" JSONB;

