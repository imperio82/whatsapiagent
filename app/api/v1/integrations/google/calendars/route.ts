import { IntegrationsController } from "@modules/integrations/interface/integrations.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new IntegrationsController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.listCalendars(req));
  } catch (err) {
    return failure(err);
  }
});
