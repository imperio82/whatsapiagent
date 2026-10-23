import { DataImportController } from "@modules/data-import/interface/data-import.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new DataImportController();

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  return withRequestContext(async () => {
    try {
      return ok(await controller.sync(id));
    } catch (err) {
      return failure(err);
    }
  })(req);
}
