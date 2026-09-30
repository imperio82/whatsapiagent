-- Extiende whatsapp_accounts para soportar Twilio como proveedor de mensajería.
-- Los campos específicos de Meta pasan a ser opcionales (solo requeridos cuando
-- provider = 'meta'); se agregan provider + credenciales de Twilio.

-- AlterTable
ALTER TABLE "whatsapp_accounts" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'meta';
ALTER TABLE "whatsapp_accounts" ADD COLUMN "twilioAccountSid" TEXT;
ALTER TABLE "whatsapp_accounts" ADD COLUMN "twilioAuthTokenEnc" TEXT;

ALTER TABLE "whatsapp_accounts" ALTER COLUMN "phoneNumberId" DROP NOT NULL;
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "businessAccountId" DROP NOT NULL;
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "accessTokenEnc" DROP NOT NULL;
ALTER TABLE "whatsapp_accounts" ALTER COLUMN "webhookVerifyToken" DROP NOT NULL;
