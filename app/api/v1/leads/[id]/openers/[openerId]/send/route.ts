import { LeadsController } from "@modules/leads/interface/leads.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new LeadsController();

export const POST = withRequestContext(async (req) => {
  try {
    // /api/v1/leads/[id]/openers/[openerId]/send
    const parts = new URL(req.url).pathname.split("/");
    const openerId = parts[parts.length - 2]!;
    const leadId = parts[parts.length - 4]!;
    return ok(await controller.sendOpenerByLead(leadId, openerId));
  } catch (err) {
    return failure(err);
  }
});
