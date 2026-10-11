import {
  getWhatsAppProvider,
  isBaileys,
} from "@modules/whatsapp/infrastructure/provider-factory";
import { TenantContext } from "@shared/application/tenant-context";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const GET = withRequestContext(async () => {
  const { tenantId } = TenantContext.require();
  const provider = getWhatsAppProvider();
  // Meta y Twilio guardan el estado en un cache en memoria que se vacía al
  // reiniciar el servidor; start() lo recalcula desde la base (es barato).
  if (!isBaileys(provider)) await provider.start(tenantId);
  const state = provider.getState(tenantId);
  return ok({ provider: provider.kind, state });
});
