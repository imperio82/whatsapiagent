-- Ajustes de la voz de ElevenLabs por negocio (velocidad, estabilidad, parecido, estilo)
ALTER TABLE "agent_voices" ADD COLUMN "elevenLabsTuning" JSONB;
