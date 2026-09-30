import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const POST = withRequestContext(async () => {
  authorize("tenant.settings");
  const { tenantId } = TenantContext.require();
  const provider = getWhatsAppProvider();
  await provider.start(tenantId);
  return ok({ provider: provider.kind, state: provider.getState(tenantId) });
});

export const DELETE = withRequestContext(async () => {
  authorize("tenant.settings");
  const { tenantId } = TenantContext.require();
  const provider = getWhatsAppProvider();
  await provider.stop(tenantId);
  return ok({ provider: provider.kind, state: provider.getState(tenantId) });
});
