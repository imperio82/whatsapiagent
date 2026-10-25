import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** Costos de un negocio: últimos 6 meses hasta ?month=YYYY-MM, con detalle por modelo y por chat. */
export const GET = withPlatformOwner(async (req) => {
  const url = new URL(req.url);
  return ok(await controller.costs(url.pathname.split("/").at(-2)!, url.searchParams.get("month")));
});
