import { BillingController } from "@modules/billing/interface/billing.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new BillingController();

export const GET = withRequestContext(async () => ok(await controller.myUsage()));
