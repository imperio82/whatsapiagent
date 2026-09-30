import { z } from "zod";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import { ok, failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { TwilioProvider } from "@modules/whatsapp/infrastructure/twilio/twilio-provider";

/**
 * Configuración de la cuenta de mensajería del tenant.
 *
 * GET: devuelve la cuenta sin secretos (para pintar el formulario y el estado).
 * PATCH: guarda credenciales de Twilio (provider="twilio").
 */

const twilioSchema = z.object({
  twilioAccountSid: z.string().trim().min(10, "Account SID inválido"),
  twilioAuthToken: z.string().trim().min(10, "Auth Token inválido"),
  displayPhoneNumber: z.string().trim().min(8, "Número de WhatsApp inválido"),
});

interface AccountDTO {
  provider: string;
  displayPhoneNumber: string | null;
  twilioAccountSid: string | null;
  hasAuthToken: boolean;
  verified: boolean;
}

export const GET = withRequestContext(async () => {
  const { tenantId } = TenantContext.require();
  const account = await prisma.whatsappAccount.findUnique({ where: { tenantId } });
  const dto: AccountDTO | null = account
    ? {
        provider: account.provider,
        displayPhoneNumber: account.displayPhoneNumber,
        twilioAccountSid: account.twilioAccountSid,
        hasAuthToken: Boolean(account.twilioAuthTokenEnc),
        verified: account.verified,
      }
    : null;
  return ok(dto);
});

export const PATCH = withRequestContext(async (req) => {
  try {
    authorize("tenant.settings");
    const { tenantId } = TenantContext.require();
    const input = twilioSchema.parse(await req.json());
    const displayDigits = input.displayPhoneNumber.replace(/[^\d]/g, "");

    const account = await prisma.whatsappAccount.upsert({
      where: { tenantId },
      create: {
        tenantId,
        provider: "twilio",
        displayPhoneNumber: displayDigits,
        twilioAccountSid: input.twilioAccountSid,
        twilioAuthTokenEnc: input.twilioAuthToken,
        verified: true,
      },
      update: {
        provider: "twilio",
        displayPhoneNumber: displayDigits,
        twilioAccountSid: input.twilioAccountSid,
        twilioAuthTokenEnc: input.twilioAuthToken,
        verified: true,
      },
    });

    // Refrescamos el estado cacheado del provider activo si es Twilio.
    const provider = getWhatsAppProvider();
    if (provider instanceof TwilioProvider) await provider.refreshState(tenantId);

    const dto: AccountDTO = {
      provider: account.provider,
      displayPhoneNumber: account.displayPhoneNumber,
      twilioAccountSid: account.twilioAccountSid,
      hasAuthToken: Boolean(account.twilioAuthTokenEnc),
      verified: account.verified,
    };
    return ok(dto);
  } catch (err) {
    return failure(err);
  }
});
