import { OrdersController } from "@modules/orders/interface/orders.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new OrdersController();

export const GET = withRequestContext(async (req) => {
  const url = new URL(req.url);
  return ok(await controller.list(url.searchParams));
});
