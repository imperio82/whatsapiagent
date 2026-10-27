import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { MatchingService } from "@modules/matching/application/matching.service";
import { listListingsSchema, type ListingDto } from "../application/dtos";
import {
  ArchiveListingUseCase,
  CreateListingUseCase,
  GetListingUseCase,
  ListListingsUseCase,
  UpdateListingUseCase,
} from "../application/use-cases";

export class ListingsController {
  private readonly listUC = new ListListingsUseCase();
  private readonly getUC = new GetListingUseCase();
  private readonly matching = new MatchingService(getWhatsAppProvider());
  private readonly createUC = new CreateListingUseCase(this.matching);
  private readonly updateUC = new UpdateListingUseCase(this.matching);
  private readonly archiveUC = new ArchiveListingUseCase();

  list(searchParams: URLSearchParams): Promise<ListingDto[]> {
    const input = listListingsSchema.parse({
      search: searchParams.get("search") || undefined,
      kind: searchParams.get("kind") || undefined,
      status: searchParams.get("status") || undefined,
    });
    return this.listUC.execute(input);
  }

  get(id: string): Promise<ListingDto> {
    return this.getUC.execute(id);
  }

  create(body: unknown): Promise<ListingDto> {
    return this.createUC.execute(body as never);
  }

  update(id: string, body: unknown): Promise<ListingDto> {
    return this.updateUC.execute(id, body as never);
  }

  archive(id: string): Promise<void> {
    return this.archiveUC.execute(id);
  }
}
