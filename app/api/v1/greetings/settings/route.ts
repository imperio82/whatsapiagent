import { GreetingsController } from "@modules/greetings/interface/greetings.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new GreetingsController();

export const GET = withRequestContext(async () => {
  try {
    return ok(await controller.settings());
  } catch (err) {
    return failure(err);
  }
});

export const PATCH = withRequestContext(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    return ok(await controller.updateSettings(body));
  } catch (err) {
    return failure(err);
  }
});
