import { AiRulesController } from "@modules/ai/interface/ai-rules.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AiRulesController();

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop()!;
    return ok(await controller.update(id, await req.json()));
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop()!;
    await controller.remove(id);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
