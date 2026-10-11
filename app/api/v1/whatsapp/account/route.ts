import { z } from "zod";
import type { WhatsappAccount } from "@prisma/client";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { InfrastructureError, ValidationError } from "@shared/domain/errors";
import { encryptSecret } from "@shared/infrastructure/crypto/secret-box";
import { prisma } from "@shared/infrastructure/prisma/client";
import { ok, failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";
import {
  getWhatsAppProvider,
  isMeta,
  isTwilio,
} from "@modules/whatsapp/infrastructure/provider-factory";
import { verifyMetaCredentials } from "@modules/whatsapp/infrastructure/meta/meta-cloud-provider";

/**
 * Configuración de la cuenta de mensajería del tenant.
 *
 * GET: devuelve la cuenta sin secretos (para pintar el formulario y el estado).
 * PATCH: guarda credenciales de Twilio (por defecto) o de Meta (`provider: "meta"`).
 * Los tokens se guardan cifrados (AES-256-GCM) y nunca vuelven al frontend.
 */

const twilioSchema = z.object({
  provider: z.literal("twilio").optional(),
  twilioAccountSid: z.string().trim().min(10, "Account SID inválido"),
  twilioAuthToken: z.string().trim().min(10, "Auth Token inválido"),
  displayPhoneNumber: z.string().trim().min(8, "Número de WhatsApp inválido"),
});

const metaSchema = z.object({
  provider: z.literal("meta"),
  phoneNumberId: z.string().trim().regex(/^\d{5,}$/, "Phone Number ID inválido"),
  businessAccountId: z
    .string()
    .trim()
    .regex(/^\d{5,}$/, "WhatsApp Business Account ID inválido")
    .optional()
    .or(z.literal("")),
  accessToken: z.string().trim().min(20, "Token de acceso inválido"),
});

interface AccountDTO {
  provider: string;
  displayPhoneNumber: string | null;
  twilioAccountSid: string | null;
  hasAuthToken: boolean;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  hasAccessToken: boolean;
  verified: boolean;
}

function toDTO(account: WhatsappAccount): AccountDTO {
  return {
    provider: account.provider,
    displayPhoneNumber: account.displayPhoneNumber,
    twilioAccountSid: account.twilioAccountSid,
    hasAuthToken: Boolean(account.twilioAuthTokenEnc),
    phoneNumberId: account.phoneNumberId,
    businessAccountId: account.businessAccountId,
    hasAccessToken: Boolean(account.accessTokenEnc),
    verified: account.verified,
  };
}

export const GET = withRequestContext(async () => {
  const { tenantId } = TenantContext.require();
  const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
  return ok(account ? toDTO(account) : null);
});

export const PATCH = withRequestContext(async (req) => {
  try {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const body = (await req.json()) as { provider?: string };

    const account =
      body.provider === "meta"
        ? await saveMeta(tenantId, metaSchema.parse(body))
        : await saveTwilio(tenantId, twilioSchema.parse(body));

    // Refrescamos el estado cacheado del provider activo.
    const provider = getWhatsAppProvider();
    if (isTwilio(provider) || isMeta(provider)) {
      await provider.refreshState(tenantId);
    }

    return ok(toDTO(account));
  } catch (err) {
    return failure(err);
  }
});

async function saveTwilio(
  tenantId: string,
  input: z.infer<typeof twilioSchema>,
): Promise<WhatsappAccount> {
  const data = {
    provider: "twilio",
    displayPhoneNumber: input.displayPhoneNumber.replace(/[^\d]/g, ""),
    twilioAccountSid: input.twilioAccountSid,
    twilioAuthTokenEnc: encryptSecret(input.twilioAuthToken),
    verified: true,
  };
  return prisma.whatsappAccount.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}

async function saveMeta(
  tenantId: string,
  input: z.infer<typeof metaSchema>,
): Promise<WhatsappAccount> {
  // Probamos las credenciales contra el Graph API antes de guardarlas:
  // así el estado "conectado" significa que Meta las aceptó.
  let info;
  try {
    info = await verifyMetaCredentials(input.phoneNumberId, input.accessToken);
  } catch (err) {
    if (err instanceof InfrastructureError) throw new ValidationError(err.message);
    throw err;
  }

  const data = {
    provider: "meta",
    displayPhoneNumber: info.displayPhoneNumber,
    phoneNumberId: input.phoneNumberId,
    businessAccountId: input.businessAccountId || null,
    accessTokenEnc: encryptSecret(input.accessToken),
    verified: true,
  };
  return prisma.whatsappAccount.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });
}
