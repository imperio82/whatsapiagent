import { IntegrationsController } from "@modules/integrations/interface/integrations.controller";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new IntegrationsController();

export const GET = withRequestContext((req) => controller.finishGoogle(req));
