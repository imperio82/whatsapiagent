import { TemplatesController } from "@modules/templates/interface/templates.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new TemplatesController();

export const GET = withRequestContext(async () => ok(await controller.listTemplates()));

export const POST = withRequestContext(async (req) => {
  try {
    const body = await req.json();
    return created(await controller.createTemplate(body));
  } catch (err) {
    return failure(err);
  }
});
