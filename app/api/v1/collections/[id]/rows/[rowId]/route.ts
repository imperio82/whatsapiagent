import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();
/** /api/v1/collections/{id}/rows/{rowId} */
const idsOf = (req: Request) => {
  const parts = new URL(req.url).pathname.split("/");
  return { id: parts.at(-3)!, rowId: parts.at(-1)! };
};

/** { values: { columna: valor } }: cambia solo las columnas que vienen. */
export const PATCH = withRequestContext(async (req) => {
  const { id, rowId } = idsOf(req);
  return ok(await controller.updateRow(id, rowId, await req.json()));
});

export const DELETE = withRequestContext(async (req) => {
  const { id, rowId } = idsOf(req);
  await controller.removeRow(id, rowId);
  return noContent();
});
