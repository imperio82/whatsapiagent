import { ValidationError } from "@shared/domain/errors";
import {
  AddCollectionRowUseCase,
  CreateCollectionUseCase,
  DeleteCollectionRowUseCase,
  UpdateCollectionRowUseCase,
  rowValuesSchema,
  type CollectionRowDto,
  DeleteCollectionUseCase,
  GetCollectionRowsUseCase,
  ListCollectionsUseCase,
  ReplaceCollectionDataUseCase,
  UpdateCollectionUseCase,
  collectionMetaSchema,
  listRowsSchema,
  type CollectionDto,
  type CollectionRowsDto,
  type UploadedFile,
} from "../application/collections.use-cases";

/** Lee el archivo y los campos de un formulario multipart. */
async function readUpload(form: FormData): Promise<{ file: UploadedFile; sheetName: string | null }> {
  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("Adjunta un archivo .xlsx, .csv o .json");
  const sheetName = form.get("sheetName");
  return {
    file: { buffer: Buffer.from(await file.arrayBuffer()), name: file.name },
    sheetName: typeof sheetName === "string" && sheetName ? sheetName : null,
  };
}

export class CollectionsController {
  private readonly listUC = new ListCollectionsUseCase();
  private readonly rowsUC = new GetCollectionRowsUseCase();
  private readonly createUC = new CreateCollectionUseCase();
  private readonly replaceUC = new ReplaceCollectionDataUseCase();
  private readonly updateUC = new UpdateCollectionUseCase();
  private readonly deleteUC = new DeleteCollectionUseCase();
  private readonly addRowUC = new AddCollectionRowUseCase();
  private readonly updateRowUC = new UpdateCollectionRowUseCase();
  private readonly deleteRowUC = new DeleteCollectionRowUseCase();

  list(): Promise<CollectionDto[]> {
    return this.listUC.execute();
  }

  rows(id: string, params: URLSearchParams): Promise<CollectionRowsDto> {
    return this.rowsUC.execute(id, listRowsSchema.parse({ q: params.get("q") ?? undefined, page: params.get("page") ?? 1 }));
  }

  async create(form: FormData): Promise<CollectionDto> {
    const { file, sheetName } = await readUpload(form);
    const meta = collectionMetaSchema.parse({
      name: form.get("name"),
      description: form.get("description") || null,
      aiEnabled: form.get("aiEnabled") !== "false",
    });
    return this.createUC.execute(meta, file, sheetName);
  }

  async replaceData(id: string, form: FormData): Promise<CollectionDto> {
    const { file, sheetName } = await readUpload(form);
    return this.replaceUC.execute(id, file, sheetName);
  }

  update(id: string, body: unknown): Promise<CollectionDto> {
    return this.updateUC.execute(id, collectionMetaSchema.partial().parse(body));
  }

  remove(id: string): Promise<void> {
    return this.deleteUC.execute(id);
  }

  addRow(id: string, body: unknown): Promise<CollectionRowDto> {
    return this.addRowUC.execute(id, rowValuesSchema.parse(body));
  }

  updateRow(id: string, rowId: string, body: unknown): Promise<CollectionRowDto> {
    return this.updateRowUC.execute(id, rowId, rowValuesSchema.parse(body));
  }

  removeRow(id: string, rowId: string): Promise<void> {
    return this.deleteRowUC.execute(id, rowId);
  }
}
