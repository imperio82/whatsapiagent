import { GreetingsController } from "@modules/greetings/interface/greetings.controller";
import { failure, noContent } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new GreetingsController();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withRequestContext(async () => {
    try {
      await controller.dismiss(id);
      return noContent();
    } catch (err) {
      return failure(err);
    }
  })(req);
}
