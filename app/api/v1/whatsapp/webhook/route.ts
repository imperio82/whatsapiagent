import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@shared/infrastructure/prisma/client";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { MetaCloudProvider } from "@modules/whatsapp/infrastructure/meta/meta-cloud-provider";
import { ensureWhatsAppWired } from "@modules/whatsapp/infrastructure/provider-bootstrap";
import type { InboundMessage } from "@modules/whatsapp/domain/ports/whatsapp-provider";

/**
 * Webhook de WhatsApp Cloud API (Meta).
 *
 * GET: handshake de verificación inicial. Meta envía hub.mode/challenge/verify_token.
 * POST: eventos de mensajes. Firmados con HMAC-SHA256 en `x-hub-signature-256`.
 *
 * Solo aplica si WHATSAPP_PROVIDER=meta. En dev con Baileys este endpoint no se usa.
 */

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(raw, signature)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(raw) as MetaWebhookPayload;
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const messages = extractInboundMessages(payload);
  if (messages.length === 0) return NextResponse.json({ ok: true });

  // Aseguramos que los handlers de inbound (ingest + IA) estén registrados
  // y obtenemos el provider Meta para despachar via pushInbound. Así el
  // pipeline es idéntico al de Baileys: un solo punto de entrada que
  // ejecuta TODOS los handlers registrados (no solo el ingest).
  ensureWhatsAppWired();
  const provider = getWhatsAppProvider();
  if (!(provider instanceof MetaCloudProvider)) {
    console.warn(
      "[whatsapp webhook] WHATSAPP_PROVIDER no está en 'meta'. Ignorando webhook.",
    );
    return NextResponse.json({ ok: true });
  }

  for (const m of messages) {
    try {
      const tenantId = await resolveTenantByPhoneNumberId(m.phoneNumberId);
      if (!tenantId) continue;
      await provider.pushInbound({
        tenantId,
        from: m.from,
        toPhoneNumber: m.toPhoneNumber,
        providerMessageId: m.providerMessageId,
        type: m.type,
        text: m.text,
        contactName: m.contactName,
        timestamp: m.timestamp,
      });
    } catch (err) {
      console.error("[whatsapp webhook] error procesando mensaje", err);
    }
  }

  return NextResponse.json({ ok: true });
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<string | null> {
  const account = await prisma.whatsappAccount.findFirst({
    where: { phoneNumberId, verified: true },
  });
  return account?.tenantId ?? null;
}

interface ExtractedInbound extends Omit<InboundMessage, "tenantId"> {
  phoneNumberId: string;
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: { caption?: string; id?: string };
        }>;
      };
    }>;
  }>;
}

function extractInboundMessages(payload: MetaWebhookPayload): ExtractedInbound[] {
  const out: ExtractedInbound[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue;
      const phoneNumberId = v.metadata?.phone_number_id ?? "";
      const toPhoneNumber = v.metadata?.display_phone_number ?? "";
      const contactName = v.contacts?.[0]?.profile?.name;

      for (const m of v.messages) {
        if (!m.from || !m.id) continue;
        const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
        const type = (m.type ?? "text") as InboundMessage["type"];
        out.push({
          phoneNumberId,
          from: m.from,
          toPhoneNumber,
          providerMessageId: m.id,
          type,
          text: m.text?.body ?? m.image?.caption ?? "",
          contactName,
          timestamp: ts,
        });
      }
    }
  }
  return out;
}
