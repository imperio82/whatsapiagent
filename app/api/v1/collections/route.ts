import { CollectionsController } from "@modules/collections/interface/collections.controller";
import { created, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new CollectionsController();

export const GET = withRequestContext(async () => ok(await controller.list()));

/** Multipart: file (.xlsx, .csv o .json), name, description, aiEnabled y sheetName (opcional). */
export const POST = withRequestContext(async (req) => created(await controller.create(await req.formData())));
