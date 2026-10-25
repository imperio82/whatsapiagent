import { VoiceController } from "@modules/voice/interface/voice.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new VoiceController();

export const DELETE = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  await controller.deleteClone(id);
  return ok({ id });
});
