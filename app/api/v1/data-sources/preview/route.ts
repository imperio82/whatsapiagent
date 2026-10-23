import { DataImportController } from "@modules/data-import/interface/data-import.controller";
import { failure, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new DataImportController();

/** Lee una hoja de Google o una base externa y propone el mapeo, sin guardar nada. */
export const POST = withRequestContext(async (req) => {
  try {
    return ok(await controller.previewSource(await req.json()));
  } catch (err) {
    return failure(err);
  }
});
