import { ListingsController } from "@modules/listings/interface/listings.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ListingsController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.get(new URL(req.url).pathname.split("/").pop()!));
  } catch (err) {
    return failure(err);
  }
});

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop()!;
    return ok(await controller.update(id, await req.json()));
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").pop()!;
    await controller.archive(id);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
