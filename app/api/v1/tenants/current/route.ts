import { TenantsController } from "@modules/tenants/interface/tenants.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new TenantsController();

export const GET = withRequestContext(async () => {
  const data = await controller.getCurrentTenant();
  return ok(data);
});

export const PATCH = withRequestContext(async (req) => {
  try {
    const body = await req.json();
    const data = await controller.updateCurrentTenant(body);
    return ok(data);
  } catch (err) {
    return failure(err);
  }
});
