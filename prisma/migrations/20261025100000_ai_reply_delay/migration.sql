-- Tiempo de espera del agente antes de responder, configurable por negocio
ALTER TABLE "tenants" ADD COLUMN "aiReplyDelaySec" INTEGER;
