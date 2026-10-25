import { SimulatorController } from "@modules/simulator/interface/simulator.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new SimulatorController();

export const GET = withRequestContext(async () => {
  try {
    return ok(await controller.status());
  } catch (err) {
    return failure(err);
  }
});
