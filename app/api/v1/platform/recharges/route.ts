import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** Recargas pendientes de confirmar, las últimas resueltas y las formas de pago que ven los negocios. */
export const GET = withPlatformOwner(async () => ok(await controller.recharges()));

/** { instructions }: cambia el texto con las formas de pago. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setPaymentInstructions(await req.json())));
