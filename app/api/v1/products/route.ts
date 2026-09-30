import { ProductsController } from "@modules/products/interface/products.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ProductsController();

export const GET = withRequestContext(async (req) => {
  const url = new URL(req.url);
  const page = await controller.list(url.searchParams);
  return ok(page);
});

export const POST = withRequestContext(async (req) => {
  try {
    const body = await req.json();
    const product = await controller.create(body);
    return created(product);
  } catch (err) {
    return failure(err);
  }
});
