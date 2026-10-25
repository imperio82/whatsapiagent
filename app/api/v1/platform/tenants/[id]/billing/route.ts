import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { created, ok } from "@shared/interface/http/response";

const controller = new PlatformController();

const tenantIdOf = (req: Request): string => new URL(req.url).pathname.split("/").at(-2)!;

export const GET = withPlatformOwner(async (req) => ok(await controller.entries(tenantIdOf(req))));

export const POST = withPlatformOwner(async (req, owner) =>
  created(await controller.addEntry(tenantIdOf(req), owner.userId, await req.json())),
);
