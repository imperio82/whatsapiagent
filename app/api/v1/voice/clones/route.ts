import { VoiceController } from "@modules/voice/interface/voice.controller";
import { created } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new VoiceController();

/** Multipart: name, consent=true y de 1 a 5 archivos de audio en "files". */
export const POST = withRequestContext(async (req) => created(await controller.clone(await req.formData())));
