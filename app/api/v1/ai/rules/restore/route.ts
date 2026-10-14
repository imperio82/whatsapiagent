import { AiRulesController } from "@modules/ai/interface/ai-rules.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AiRulesController();

export const POST = withRequestContext(async () => {
  try {
    return ok(await controller.restore());
  } catch (err) {
    return failure(err);
  }
});
