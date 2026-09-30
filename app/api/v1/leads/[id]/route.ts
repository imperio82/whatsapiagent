import { LeadsController } from "@modules/leads/interface/leads.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new LeadsController();

export const PATCH = withRequestContext(async (req) => {
  try {
    const id = new URL(req.url).pathname.split("/").at(-1)!;
    const body = await req.json();
    return ok(await controller.updateLead(id, body));
  } catch (err) {
    return failure(err);
  }
});
