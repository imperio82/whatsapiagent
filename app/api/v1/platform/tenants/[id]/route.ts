import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

export const PATCH = withPlatformOwner(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-1)!;
  await controller.updateTenant(id, await req.json());
  return ok({ id });
});
