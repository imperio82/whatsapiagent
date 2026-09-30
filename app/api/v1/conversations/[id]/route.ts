import { ConversationsController } from "@modules/conversations/interface/conversations.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ConversationsController();

export const GET = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  const data = await controller.get(id, true);
  return ok(data);
});
