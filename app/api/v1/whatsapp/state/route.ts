import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { TenantContext } from "@shared/application/tenant-context";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const GET = withRequestContext(async () => {
  const { tenantId } = TenantContext.require();
  const provider = getWhatsAppProvider();
  const state = provider.getState(tenantId);
  return ok({ provider: provider.kind, state });
});
