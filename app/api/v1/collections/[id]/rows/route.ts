import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();
/** /api/v1/collections/{id}/rows */
const idOf = (req: Request) => new URL(req.url).pathname.split("/").at(-2)!;

/** { values: { columna: valor } }: agrega una fila con las columnas de la tabla. */
export const POST = withRequestContext(async (req) => ok(await controller.addRow(idOf(req), await req.json())));
