import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** Si ElevenLabs está activo y de dónde sale la clave (nunca se devuelve la clave). */
export const GET = withPlatformOwner(async () => ok(await controller.elevenLabs()));

/** { apiKey } la prueba y la guarda cifrada; { removeKey: true } la borra; { enabled } prende o apaga. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setElevenLabs(await req.json())));
