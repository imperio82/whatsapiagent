import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { noContent, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();
const idOf = (req: Request) => new URL(req.url).pathname.split("/").pop()!;

/** Filas de la tabla, de a 50: ?q=palabras&page=1 */
export const GET = withRequestContext(async (req) => ok(await controller.rows(idOf(req), new URL(req.url).searchParams)));

/** { name?, description?, aiEnabled? } */
export const PATCH = withRequestContext(async (req) => ok(await controller.update(idOf(req), await req.json())));

export const DELETE = withRequestContext(async (req) => {
  await controller.remove(idOf(req));
  return noContent();
});
