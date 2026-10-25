import { RemindersController } from "@modules/reminders/interface/reminders.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new RemindersController();

export const GET = withRequestContext(async (req) => {
  try {
    const params = new URL(req.url).searchParams;
    return ok(await controller.list(params.get("status"), params.get("kind")));
  } catch (err) {
    return failure(err);
  }
});

export const POST = withRequestContext(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    return ok(await controller.create(body));
  } catch (err) {
    return failure(err);
  }
});
