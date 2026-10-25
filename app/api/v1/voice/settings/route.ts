import { VoiceController } from "@modules/voice/interface/voice.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new VoiceController();

export const GET = withRequestContext(async () => ok(await controller.settings()));

export const PUT = withRequestContext(async (req) => ok(await controller.update(await req.json())));
