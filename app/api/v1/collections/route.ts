import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { created, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();

export const GET = withRequestContext(async () => ok(await controller.list()));

/**
 * Multipart: file (.xlsx, .csv o .json), name, description, aiEnabled y sheetName (opcional).
 * JSON: { name, description?, aiEnabled?, columns: string[], rows?: Record<string, string>[] } crea la tabla desde cero.
 */
export const POST = withRequestContext(async (req) =>
  created(
    req.headers.get("content-type")?.includes("application/json")
      ? await controller.createBlank(await req.json())
      : await controller.create(await req.formData()),
  ),
);
