-- Permisos del agente por área (lectura, actualización, escritura)
ALTER TABLE "tenants" ADD COLUMN "aiPermissions" JSONB;
