import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();

/** Multipart con un archivo nuevo: reemplaza todas las filas de la tabla (la estructura puede cambiar). */
export const PUT = withRequestContext(async (req) => {
  const id = new URL(req.url).pathname.split("/").at(-2)!;
  return ok(await controller.replaceData(id, await req.formData()));
});
