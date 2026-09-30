import { ClientsController } from "@modules/clients/interface/clients.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientsController();

export const GET = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  return ok(await controller.getClient(id));
});

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-1)!;
    const body = await req.json();
    return ok(await controller.updateClient(id, body));
  } catch (err) {
    return failure(err);
  }
});
