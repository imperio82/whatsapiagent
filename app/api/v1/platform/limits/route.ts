import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** Cupo y tope de cada negocio en el mes (?month=YYYY-MM) y las métricas del documento de límites de uso. */
export const GET = withPlatformOwner(async (req) => ok(await controller.limits(new URL(req.url).searchParams.get("month"))));

/** { enforcement: "registro" | "activo" }: solo anotar o aplicar los límites al llegar al tope. */
export const PUT = withPlatformOwner(async (req) => ok(await controller.setEnforcement(await req.json())));
