import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** El modelo con el que responde el agente en todos los negocios, y lo que costaría cada opción. */
export const GET = withPlatformOwner(async () => ok(await controller.agentModel()));

/** { model: "gemini-2.5-flash-lite" } lo cambia después de una prueba; { model: null } vuelve al .env. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setAgentModel(await req.json())));
