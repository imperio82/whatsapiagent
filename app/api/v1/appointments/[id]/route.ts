import { AppointmentsController } from "@modules/appointments/interface/appointments.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AppointmentsController();

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop()!;
    return ok(await controller.update(id, await req.json()));
  } catch (err) {
    return failure(err);
  }
});
