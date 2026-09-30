import { ClientsController } from "@modules/clients/interface/clients.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientsController();

export const GET = withRequestContext(async (req) => {
  const url = new URL(req.url);
  return ok(await controller.listClients(url.searchParams));
});

export const POST = withRequestContext(async (req) => {
  try {
    const body = await req.json();
    return created(await controller.createClient(body));
  } catch (err) {
    return failure(err);
  }
});
