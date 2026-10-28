import { AppointmentsController } from "@modules/appointments/interface/appointments.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new AppointmentsController();

/** { scheduledAt, instructions? }: el aviso de confirmación que redacta el agente, para revisarlo antes de enviar. */
export const POST = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    return ok(await controller.draftNotice(id, await req.json()));
  } catch (err) {
    return failure(err);
  }
});
