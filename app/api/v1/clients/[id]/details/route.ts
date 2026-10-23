import { ClientDetailsController } from "@modules/clients/interface/client-details.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientDetailsController();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async () => {
    try {
      return ok(await controller.get(id));
    } catch (err) {
      return failure(err);
    }
  })(req);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async (r) => {
    try {
      const body = await r.json().catch(() => ({}));
      return ok(await controller.update(id, body));
    } catch (err) {
      return failure(err);
    }
  })(req);
}
