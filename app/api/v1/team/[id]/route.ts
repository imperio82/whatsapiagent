import { UsersController } from "@modules/users/interface/users.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new UsersController();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async (r) => {
    try {
      const body = await r.json().catch(() => ({}));
      await controller.updateMemberPhone(id, body);
      return ok({ updated: true });
    } catch (err) {
      return failure(err);
    }
  })(req);
}
