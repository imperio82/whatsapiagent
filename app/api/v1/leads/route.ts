import { LeadsController } from "@modules/leads/interface/leads.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new LeadsController();

export const GET = withRequestContext(async () => ok(await controller.listLeads()));

export const POST = withRequestContext(async (req) => {
  try {
    const body = await req.json();
    return created(await controller.createLead(body));
  } catch (err) {
    return failure(err);
  }
});
