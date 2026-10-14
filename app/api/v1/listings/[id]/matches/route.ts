import { MatchingController } from "@modules/matching/interface/matching.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new MatchingController();

export const POST = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    return ok(await controller.runForListing(id));
  } catch (err) {
    return failure(err);
  }
});
