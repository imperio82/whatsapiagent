import { GreetingsController } from "@modules/greetings/interface/greetings.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new GreetingsController();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async (r) => {
    try {
      const body = await r.json().catch(() => ({}));
      return ok(await controller.send(id, body));
    } catch (err) {
      return failure(err);
    }
  })(req);
}
