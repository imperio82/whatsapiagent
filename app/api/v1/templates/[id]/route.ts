import { TemplatesController } from "@modules/templates/interface/templates.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new TemplatesController();

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-1)!;
    const body = await req.json();
    return ok(await controller.updateTemplate(id, body));
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-1)!;
    await controller.deleteTemplate(id);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
