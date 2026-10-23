import { MatchingController } from "@modules/matching/interface/matching.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new MatchingController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.list(new URL(req.url).searchParams.get("status")));
  } catch (err) {
    return failure(err);
  }
});
