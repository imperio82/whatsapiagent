import { ClientDetailsController } from "@modules/clients/interface/client-details.controller";
import { created, failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientDetailsController();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async (r) => {
    try {
      const body = await r.json().catch(() => ({}));
      return created(await controller.addDate(id, body));
    } catch (err) {
      return failure(err);
    }
  })(req);
}
