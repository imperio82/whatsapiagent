import { GreetingsController } from "@modules/greetings/interface/greetings.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new GreetingsController();

export const POST = withRequestContext(async () => {
  try {
    return ok(await controller.prepare());
  } catch (err) {
    return failure(err);
  }
});
