import { ClientDetailsController } from "@modules/clients/interface/client-details.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientDetailsController();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; dateId: string }> }) {
  const { id, dateId } = await params;
  return withRequestContext(async (r) => {
    try {
      const body = await r.json().catch(() => ({}));
      return ok(await controller.updateDate(id, dateId, body));
    } catch (err) {
      return failure(err);
    }
  })(req);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; dateId: string }> }) {
  const { id, dateId } = await params;
  return withRequestContext(async () => {
    try {
      await controller.deleteDate(id, dateId);
      return noContent();
    } catch (err) {
      return failure(err);
    }
  })(req);
}
