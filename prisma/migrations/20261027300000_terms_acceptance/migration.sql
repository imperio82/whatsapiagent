-- Constancia de aceptación de los términos del servicio y la política de datos
ALTER TABLE "tenants" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "termsVersion" TEXT;
ALTER TABLE "tenants" ADD COLUMN "termsAcceptedById" TEXT;
ALTER TABLE "tenants" ADD COLUMN "termsAcceptedIp" TEXT;
