import { ClientDetailsController } from "@modules/clients/interface/client-details.controller";
import { failure, noContent } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ClientDetailsController();

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; relationId: string }> }) {
  const { id, relationId } = await params;
  return withRequestContext(async () => {
    try {
      await controller.deleteRelation(id, relationId);
      return noContent();
    } catch (err) {
      return failure(err);
    }
  })(req);
}
