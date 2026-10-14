import { AppointmentsController } from "@modules/appointments/interface/appointments.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AppointmentsController();

export const GET = withRequestContext(async () => {
  try {
    return ok(await controller.list());
  } catch (err) {
    return failure(err);
  }
});
