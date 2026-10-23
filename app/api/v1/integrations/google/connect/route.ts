import { IntegrationsController } from "@modules/integrations/interface/integrations.controller";
import { failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new IntegrationsController();

/** ?scope=business conecta la cuenta del negocio; ?scope=user, el calendario propio. */
export const GET = withRequestContext(async (req) => {
  try {
    return await controller.startGoogle(req);
  } catch (err) {
    return failure(err);
  }
});
