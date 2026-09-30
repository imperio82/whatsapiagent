import { ListRolesUseCase } from "@modules/roles/application/list-roles.use-case";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const GET = withRequestContext(async () => {
  const data = await new ListRolesUseCase().execute();
  return ok(data);
});
