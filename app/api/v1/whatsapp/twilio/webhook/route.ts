import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { decryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { prisma } from "@shared/infrastructure/prisma/client";
import { getWhatsAppProvider, isTwilio } from "@modules/whatsapp/infrastructure/provider-factory";
import { ensureWhatsAppWired } from "@modules/whatsapp/infrastructure/provider-bootstrap";
import type { InboundMessage } from "@modules/whatsapp/domain/ports/whatsapp-provider";

/**
 * Webhook de WhatsApp vía Twilio.
 *
 * Twilio hace POST con `application/x-www-form-urlencoded` cuando llega un
 * mensaje al número del negocio. Resolvemos el tenant por el número destino
 * (`To`) contra WhatsappAccount(provider="twilio") y despachamos al pipeline
 * común (ingest + IA) vía pushInbound — idéntico a Meta/Baileys.
 *
 * Solo aplica si WHATSAPP_PROVIDER=twilio.
 *
 * Firma: Twilio firma con HMAC-SHA1 (header `X-Twilio-Signature`). Se valida
 * solo si TWILIO_VALIDATE_SIGNATURE=true (en sandbox suele desactivarse).
 */

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const get = (k: string): string => params.get(k) ?? "";

  const fromRaw = get("From"); // whatsapp:+50212345678
  const toRaw = get("To"); // whatsapp:+14155238886
  const body = get("Body");
  const messageSid = get("MessageSid") || get("SmsSid");

  if (!fromRaw || !toRaw || !messageSid) {
    return emptyTwiml();
  }

  const fromDigits = fromRaw.replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");
  const toDigits = toRaw.replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");

  // Resolver tenant por el número del negocio (To). displayPhoneNumber se
  // guarda normalizado a solo dígitos al configurar la cuenta.
  const account = await prisma.whatsappAccount.findFirst({
    where: { provider: "twilio", verified: true, displayPhoneNumber: toDigits },
  });
  if (!account) {
    // No hay tenant para este número: ignoramos en silencio (200).
    return emptyTwiml();
  }

  if (process.env.TWILIO_VALIDATE_SIGNATURE === "true") {
    const signature = req.headers.get("x-twilio-signature");
    const url = buildPublicUrl(req);
    if (!validateSignature(
        account.twilioAuthTokenEnc ? decryptSecret(account.twilioAuthTokenEnc) : "",
        url,
        params,
        signature,
      )) {
      return new NextResponse("invalid signature", { status: 401 });
    }
  }

  ensureWhatsAppWired();
  const provider = getWhatsAppProvider();
  if (!isTwilio(provider)) {
    console.warn(
      "[twilio webhook] WHATSAPP_PROVIDER no está en 'twilio'. Ignorando webhook.",
    );
    return emptyTwiml();
  }

  const numMedia = Number(get("NumMedia") || "0");
  const type: InboundMessage["type"] = numMedia > 0 ? "image" : "text";
  const mediaUrl = numMedia > 0 ? get("MediaUrl0") || undefined : undefined;

  try {
    await provider.pushInbound({
      tenantId: account.tenantId,
      from: fromDigits,
      toPhoneNumber: toDigits,
      providerMessageId: messageSid,
      type,
      text: body,
      mediaUrl,
      contactName: get("ProfileName") || undefined,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("[twilio webhook] error procesando mensaje", err);
  }

  return emptyTwiml();
}

/** Respuesta TwiML vacía: Twilio espera 200 + XML, sin auto-respuesta. */
function emptyTwiml(): Response {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Reconstruye la URL pública exacta que Twilio usó para firmar. */
function buildPublicUrl(req: Request): string {
  const override = process.env.TWILIO_WEBHOOK_URL;
  if (override) return override;
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}${url.pathname}`;
}

/**
 * Valida la firma de Twilio: HMAC-SHA1(authToken) sobre la URL concatenada
 * con los parámetros POST ordenados alfabéticamente (clave+valor), en base64.
 */
function validateSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  signature: string | null,
): boolean {
  if (!authToken || !signature) return false;
  const sortedKeys = [...new Set([...params.keys()])].sort();
  let data = url;
  for (const k of sortedKeys) data += k + (params.get(k) ?? "");
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
