import { UsersController } from "@modules/users/interface/users.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const GET = withRequestContext(async () => {
  const controller = new UsersController();
  return ok(await controller.listMembers());
});
