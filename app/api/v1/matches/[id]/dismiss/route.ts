import { MatchingController } from "@modules/matching/interface/matching.controller";
import { failure, noContent } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new MatchingController();

export const POST = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    await controller.dismiss(id);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
