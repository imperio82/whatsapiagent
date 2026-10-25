import { SimulatorController } from "@modules/simulator/interface/simulator.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new SimulatorController();

export const GET = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    return ok(await controller.trace(id));
  } catch (err) {
    return failure(err);
  }
});
