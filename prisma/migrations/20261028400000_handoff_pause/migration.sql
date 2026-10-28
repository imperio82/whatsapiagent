-- Al pasar a un asesor: seguir respondiendo hasta que un asesor escriba (false, por defecto) o pausar la IA 2 horas
ALTER TABLE "tenants" ADD COLUMN "aiPauseOnHandoff" BOOLEAN NOT NULL DEFAULT false;
