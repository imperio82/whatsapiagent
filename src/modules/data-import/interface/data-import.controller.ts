import { ValidationError } from "@shared/domain/errors";
import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { MatchingService } from "@modules/matching/application/matching.service";
import { DataSourcesService } from "../application/data-sources.service";
import {
  CreateSourceUseCase,
  DeleteSourceUseCase,
  ImportFileUseCase,
  ListSourcesUseCase,
  PreviewFileUseCase,
  PreviewSourceUseCase,
  SyncSourceUseCase,
  UpdateSourceUseCase,
  fileImportSchema,
} from "../application/use-cases";

/** Lee el archivo y los campos de un formulario multipart. */
async function readUpload(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Adjunta un archivo .xlsx o .csv");
  const mappingRaw = form.get("mapping");
  let mapping: unknown;
  if (typeof mappingRaw === "string" && mappingRaw) {
    try {
      mapping = JSON.parse(mappingRaw);
    } catch {
      throw new ValidationError("Mapeo de columnas inválido");
    }
  }
  const fields = fileImportSchema.parse({
    target: form.get("target"),
    sheetName: form.get("sheetName") || null,
    mapping,
  });
  return { file: { buffer: Buffer.from(await file.arrayBuffer()), name: file.name }, fields };
}

export class DataImportController {
  private readonly service = new DataSourcesService(new MatchingService(getWhatsAppProvider()));

  async previewFile(req: Request) {
    const { file, fields } = await readUpload(req);
    return new PreviewFileUseCase().execute(file, fields);
  }

  async importFile(req: Request) {
    const { file, fields } = await readUpload(req);
    if (!fields.mapping) throw new ValidationError("Falta el mapeo de columnas");
    return new ImportFileUseCase(this.service).execute(file, { ...fields, mapping: fields.mapping });
  }

  previewSource(body: unknown) {
    return new PreviewSourceUseCase().execute(body);
  }

  list() {
    return new ListSourcesUseCase().execute();
  }

  create(body: unknown) {
    return new CreateSourceUseCase(this.service).execute(body);
  }

  update(id: string, body: unknown) {
    return new UpdateSourceUseCase().execute(id, body);
  }

  remove(id: string) {
    return new DeleteSourceUseCase().execute(id);
  }

  sync(id: string) {
    return new SyncSourceUseCase(this.service).execute(id);
  }
}
