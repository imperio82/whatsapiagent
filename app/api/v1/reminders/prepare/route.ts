import { RemindersController } from "@modules/reminders/interface/reminders.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new RemindersController();

export const POST = withRequestContext(async () => {
  try {
    return ok(await controller.prepare());
  } catch (err) {
    return failure(err);
  }
});
