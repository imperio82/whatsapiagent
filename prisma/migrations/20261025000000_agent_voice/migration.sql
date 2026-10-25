-- Voz del agente: transcribir notas de voz y responder con voz
CREATE TYPE "VoiceProvider" AS ENUM ('GEMINI', 'ELEVENLABS');
CREATE TYPE "VoiceReplyMode" AS ENUM ('MIRROR', 'RULES', 'ALWAYS');

CREATE TABLE "agent_voices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transcribeInbound" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" "VoiceProvider" NOT NULL DEFAULT 'GEMINI',
    "voiceId" TEXT NOT NULL DEFAULT 'Kore',
    "voiceName" TEXT,
    "style" TEXT,
    "mode" "VoiceReplyMode" NOT NULL DEFAULT 'MIRROR',
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxSeconds" INTEGER NOT NULL DEFAULT 40,
    "textForData" BOOLEAN NOT NULL DEFAULT true,
    "alsoSendText" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_voices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_voices_tenantId_key" ON "agent_voices"("tenantId");
ALTER TABLE "agent_voices" ADD CONSTRAINT "agent_voices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "cloned_voices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "providerVoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloned_voices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "cloned_voices_providerVoiceId_key" ON "cloned_voices"("providerVoiceId");
CREATE INDEX "cloned_voices_tenantId_idx" ON "cloned_voices"("tenantId");
ALTER TABLE "cloned_voices" ADD CONSTRAINT "cloned_voices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "voice_clips" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "mimeType" TEXT NOT NULL,
    "seconds" DOUBLE PRECISION,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_clips_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "voice_clips_tenantId_createdAt_idx" ON "voice_clips"("tenantId", "createdAt");
ALTER TABLE "voice_clips" ADD CONSTRAINT "voice_clips_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
