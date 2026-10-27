import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** El modelo de Gemini con el que se generan las notas de voz de todos los negocios, y lo que cuesta cada uno. */
export const GET = withPlatformOwner(async () => ok(await controller.voiceModel()));

/** { model: "gemini-3.8-flash-tts" } lo cambia después de una prueba; { model: null } vuelve al .env. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setVoiceModel(await req.json())));
