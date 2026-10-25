import { VoiceController } from "@modules/voice/interface/voice.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new VoiceController();

/** Genera una frase de prueba con la voz elegida, para escucharla antes de guardarla. */
export const POST = withRequestContext(async (req) => ok(await controller.preview(await req.json())));
