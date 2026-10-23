import { IntegrationsController } from "@modules/integrations/interface/integrations.controller";
import { failure, noContent } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new IntegrationsController();

/** Credenciales propias del proyecto de Google del negocio (Client ID y Secret). */
export const PUT = withRequestContext(async (req) => {
  try {
    await controller.saveApp(await req.json());
    return noContent();
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async () => {
  try {
    await controller.deleteApp();
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
