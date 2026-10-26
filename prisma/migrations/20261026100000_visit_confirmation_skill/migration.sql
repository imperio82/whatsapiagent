-- Habilidad por defecto "Avisar al cliente cuando se confirma la cita" para los negocios de
-- intermediación que ya tenían sus reglas cargadas (a los nuevos se les crea al cargar las reglas).
INSERT INTO "ai_rules" ("id", "tenantId", "category", "title", "content", "isActive", "position", "systemKey", "createdAt", "updatedAt")
SELECT
  'vc' || md5(random()::text || clock_timestamp()::text || t."id"),
  t."id",
  'POLICY'::"AiRuleCategory",
  'Avisar al cliente cuando se confirma la cita',
  'Cuando una visita o prueba de manejo quede confirmada o cambie de hora, el cliente recibe un mensaje con el bien, el día y la hora. Si la confirma un asesor desde el panel o por WhatsApp, el aviso sale solo; no lo repitas.',
  true,
  6,
  'brokerage.visit-confirmation',
  NOW(),
  NOW()
FROM "tenants" t
WHERE t."agentProfile" = 'BROKERAGE' AND t."aiRulesSeededAt" IS NOT NULL
ON CONFLICT ("tenantId", "systemKey") DO NOTHING;
