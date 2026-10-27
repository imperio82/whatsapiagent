import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** Lo que se regala en la prueba gratis y los límites que da. */
export const GET = withPlatformOwner(async () => ok(await controller.trial()));

/** { valueUsd: 3 }: dólares a precio de venta que se regalan en la prueba. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setTrial(await req.json())));
