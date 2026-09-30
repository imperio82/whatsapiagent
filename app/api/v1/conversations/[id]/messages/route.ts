import { ConversationsController } from "@modules/conversations/interface/conversations.controller";
import { created, failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ConversationsController();

export const POST = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-2)!;
    const body = await req.json();
    const result = await controller.send(id, body);
    return created(result);
  } catch (err) {
    return failure(err);
  }
});
