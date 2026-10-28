-- Mensaje de traspaso a una persona y política de ofertas, configurables por negocio
ALTER TABLE "tenants" ADD COLUMN "aiHandoffMessage" TEXT;
ALTER TABLE "tenants" ADD COLUMN "aiOfferPolicy" JSONB;
