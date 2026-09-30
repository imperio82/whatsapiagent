import { ConversationsController } from "@modules/conversations/interface/conversations.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ConversationsController();

export const GET = withRequestContext(async (req) => {
  const url = new URL(req.url);
  const data = await controller.list(url.searchParams);
  return ok(data);
});
