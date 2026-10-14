import { ListingsController } from "@modules/listings/interface/listings.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ListingsController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.list(new URL(req.url).searchParams));
  } catch (err) {
    return failure(err);
  }
});

export const POST = withRequestContext(async (req) => {
  try {
    return created(await controller.create(await req.json()));
  } catch (err) {
    return failure(err);
  }
});
