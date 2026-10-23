import { DataImportController } from "@modules/data-import/interface/data-import.controller";
import { created, failure } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new DataImportController();

export const POST = withRequestContext(async (req) => {
  try {
    return created(await controller.importFile(req));
  } catch (err) {
    return failure(err);
  }
});
