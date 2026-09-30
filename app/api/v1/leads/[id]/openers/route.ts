import { LeadsController } from "@modules/leads/interface/leads.controller";
import { created, failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new LeadsController();

function leadIdFromUrl(url: string): string {
  // /api/v1/leads/[id]/openers
  const parts = new URL(url).pathname.split("/");
  return parts[parts.length - 2]!;
}

export const GET = withRequestContext(async (req) => {
  const id = leadIdFromUrl(req.url);
  return ok(await controller.listLeadOpeners(id));
});

export const POST = withRequestContext(async (req) => {
  try {
    const id = leadIdFromUrl(req.url);
    const body = await req.json().catch(() => ({}));
    return created(await controller.generateOpeners(id, body));
  } catch (err) {
    return failure(err);
  }
});
