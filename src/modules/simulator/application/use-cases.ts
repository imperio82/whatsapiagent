import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { NotFoundError, ValidationError } from "@shared/domain/errors";
import { simulatedJid } from "@shared/domain/wa-jid";
import { prisma } from "@shared/infrastructure/prisma/client";
import { resolveAdvisor } from "@modules/ai/application/advisor-assistant.use-case";
import { simulateInbound } from "@modules/whatsapp/infrastructure/provider-bootstrap";
import { tenantReplyDelayMs } from "@modules/whatsapp/infrastructure/reply-debouncer";
import { aiBudgetExhausted } from "@modules/billing/application/usage";
import type { TraceStep } from "@modules/ai/infrastructure/graph/sales-graph";

/**
 * Simulador del agente: el panel escribe como si fuera un cliente por WhatsApp. El mensaje entra
 * por el pipeline real, así que el agente usa todo lo conectado (catálogo o inventario, pedidos,
 * leads, citas, calendario y avisos al dueño). Solo la respuesta se queda en el panel.
 */

export const simulatorMessageSchema = z.object({
  /** Teléfono del cliente de prueba, solo dígitos con indicativo (ej: 573001234567). */
  phone: z.string().regex(/^\d{8,15}$/, "El teléfono debe tener entre 8 y 15 dígitos, con indicativo"),
  name: z.string().trim().max(80).optional(),
  text: z.string().trim().max(2000).default(""),
  /** Nota de voz grabada en el panel (WAV en base64): entra como una nota de voz de WhatsApp y se transcribe */
  audio: z
    .object({
      data: z.string().min(1).max(4_000_000, "La nota de voz es muy larga: graba menos de un minuto"),
      mimeType: z.literal("audio/wav"),
    })
    .optional(),
}).refine((m) => m.text.length > 0 || !!m.audio, { message: "Escribe un mensaje o graba una nota de voz", path: ["text"] });
export type SimulatorMessageInput = z.infer<typeof simulatorMessageSchema>;

export interface SimulatorStatusDto {
  /** Hay clave de OpenAI o Gemini en el servidor. */
  aiConfigured: boolean;
  /** El negocio tiene activadas las respuestas automáticas. */
  aiAutoReply: boolean;
  /** Se gastó el presupuesto de IA del mes: el agente no responde hasta que se recargue. */
  aiBudgetExhausted: boolean;
  /** Espera antes de responder, para agrupar mensajes seguidos (la del negocio o AI_REPLY_DELAY_MS). */
  replyDelayMs: number;
}

export interface SimulatorTurnDto {
  id: string;
  createdAt: string;
  intent: string | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  toolCalls: number;
  costMicroUsd: number;
  trace: TraceStep[];
}

export class GetSimulatorStatusUseCase {
  async execute(): Promise<SimulatorStatusDto> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, plan: true, aiAutoReply: true } });
    if (!tenant) throw new NotFoundError("Negocio no encontrado");
    return {
      aiConfigured: !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
      aiAutoReply: tenant.aiAutoReply,
      aiBudgetExhausted: await aiBudgetExhausted(tenant),
      replyDelayMs: await tenantReplyDelayMs(tenantId),
    };
  }
}

export class SendSimulatedMessageUseCase {
  async execute(input: SimulatorMessageInput): Promise<{ conversationId: string }> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const from = simulatedJid(input.phone);

    // El número de un asesor activaría su asistente, no la atención al cliente
    if (await resolveAdvisor(tenantId, from)) {
      throw new ValidationError("Ese número es de un asesor del equipo. Usa otro para simular a un cliente.");
    }

    await simulateInbound({
      tenantId,
      from,
      toPhoneNumber: "simulador",
      providerMessageId: `sim-${randomUUID()}`,
      ...(input.audio
        ? { type: "audio" as const, text: "", media: { data: Buffer.from(input.audio.data, "base64"), mimeType: input.audio.mimeType } }
        : { type: "text" as const, text: input.text }),
      contactName: input.name || undefined,
      timestamp: new Date(),
    });

    const conversation = await prisma.conversation.findUnique({
      where: { tenantId_waChatId: { tenantId, waChatId: from } },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundError("No se pudo crear la conversación de prueba");
    return { conversationId: conversation.id };
  }
}

/** Lo que hizo el agente en cada respuesta: a quién lo envió el router, herramientas y verificación. */
export class GetSimulatorTraceUseCase {
  async execute(conversationId: string): Promise<SimulatorTurnDto[]> {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const rows = await prisma.aiUsageLog.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      intent: r.intent,
      model: r.model,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      toolCalls: r.toolCalls,
      costMicroUsd: r.costMicroUsd,
      trace: Array.isArray(r.trace) ? (r.trace as unknown as TraceStep[]) : [],
    }));
  }
}
