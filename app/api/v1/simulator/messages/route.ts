import { SimulatorController } from "@modules/simulator/interface/simulator.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new SimulatorController();

/** Mensaje de un cliente de prueba: entra por el mismo flujo que uno de WhatsApp. */
export const POST = withRequestContext(async (req) => {
  try {
    return ok(await controller.send(await req.json()));
  } catch (err) {
    return failure(err);
  }
});
