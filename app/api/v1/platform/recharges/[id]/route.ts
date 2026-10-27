import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** { action: "confirm" | "cancel", note? }: confirma el pago (suma clientes y saldo) o cancela la recarga. */
export const PATCH = withPlatformOwner(async (req, owner) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  return ok(await controller.resolveRecharge(id, owner.userId, await req.json()));
});
