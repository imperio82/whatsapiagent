import { MatchingController } from "@modules/matching/interface/matching.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new MatchingController();

/** Revisa todo el inventario disponible contra los compradores que esperan algo. */
export const POST = withRequestContext(async () => {
  try {
    return ok(await controller.runAll());
  } catch (err) {
    return failure(err);
  }
});
