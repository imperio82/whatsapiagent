import { GreetingsController } from "@modules/greetings/interface/greetings.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new GreetingsController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.list(new URL(req.url).searchParams.get("status")));
  } catch (err) {
    return failure(err);
  }
});
