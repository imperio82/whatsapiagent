-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "deliveryInfo" TEXT,
ADD COLUMN     "faq" TEXT,
ADD COLUMN     "orderSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentInfo" TEXT;

-- AlterTable
ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'COP';

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "currency" SET DEFAULT 'COP';

