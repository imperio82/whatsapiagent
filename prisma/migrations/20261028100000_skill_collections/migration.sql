-- Habilidades que usan una colección: cuál y qué pueden hacer en ella (consultar, modificar o crear filas)
ALTER TABLE "ai_rules" ADD COLUMN "collectionId" TEXT;
ALTER TABLE "ai_rules" ADD COLUMN "collectionAccess" TEXT;

ALTER TABLE "ai_rules" ADD CONSTRAINT "ai_rules_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
