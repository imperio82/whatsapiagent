import { ProductsController } from "@modules/products/interface/products.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ProductsController();

export const GET = withRequestContext(async (req) => {
  try {
    return ok(await controller.get(new URL(req.url).pathname.split("/").pop()!));
  } catch (err) {
    return failure(err);
  }
});

export const PATCH = withRequestContext(async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop()!;
    const body = await req.json();
    const product = await controller.update(id, body);
    return ok(product);
  } catch (err) {
    return failure(err);
  }
});

export const DELETE = withRequestContext(async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.pathname.split("/").pop()!;
    await controller.remove(id);
    return noContent();
  } catch (err) {
    return failure(err);
  }
});
