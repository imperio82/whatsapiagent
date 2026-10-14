import { AiRulesController } from "@modules/ai/interface/ai-rules.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AiRulesController();

export const GET = withRequestContext(async () => {
  try {
    return ok(await controller.list());
  } catch (err) {
    return failure(err);
  }
});

export const POST = withRequestContext(async (req) => {
  try {
    return created(await controller.create(await req.json()));
  } catch (err) {
    return failure(err);
  }
});
