import { DataImportController } from "@modules/data-import/interface/data-import.controller";
import { failure, noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new DataImportController();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  return withRequestContext(async (r) => {
    try {
      return ok(await controller.update(id, await r.json()));
    } catch (err) {
      return failure(err);
    }
  })(req);
}

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  return withRequestContext(async () => {
    try {
      await controller.remove(id);
      return noContent();
    } catch (err) {
      return failure(err);
    }
  })(req);
}
