import { IntegrationsController } from "@modules/integrations/interface/integrations.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new IntegrationsController();

/** Agenda de una conexión: ?scope=business (la del negocio) o ?scope=user (la propia). */
export const PATCH = withRequestContext(async (req) => {
  try {
    return ok(await controller.updateSettings(req, await req.json()));
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async (req) => {
  try {
    await controller.disconnect(req);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
