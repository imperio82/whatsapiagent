-- Coincidencias: qué tipos de bien exigen la misma ciudad y qué ciudades cuentan como cercanas (null: valores por defecto)
ALTER TABLE "tenants" ADD COLUMN "matchRules" JSONB;
