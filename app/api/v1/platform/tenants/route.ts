import { PlatformController } from "@modules/platform/interface/platform.controller";
import { withPlatformOwner } from "@modules/platform/interface/platform-access";
import { ok } from "@shared/interface/http/response";

const controller = new PlatformController();

/** ?month=YYYY-MM; sin mes, el mes en curso. */
export const GET = withPlatformOwner(async (req) =>
  ok(await controller.overview(new URL(req.url).searchParams.get("month"))),
);
