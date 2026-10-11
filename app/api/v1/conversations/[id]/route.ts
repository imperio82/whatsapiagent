import { ConversationsController } from "@modules/conversations/interface/conversations.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new ConversationsController();

export const GET = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  const data = await controller.get(id, true);
  return ok(data);
});

/** Acciones sobre la conversación: atender, reactivar la IA, archivar o desarchivar. */
export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-1)!;
    const data = await controller.action(id, await req.json());
    return ok(data);
  } catch (err) {
    return failure(err);
  }
});
