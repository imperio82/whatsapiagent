import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();

/** { columns: [{ from?, name }] }: la nueva lista de campos, en orden; las filas conservan sus datos. */
export const PUT = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-2)!;
  return ok(await controller.updateColumns(id, await req.json()));
});
