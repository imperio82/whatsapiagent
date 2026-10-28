import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { MatchingService, type MatchRunResult } from "../application/matching.service";
import {
  DismissMatchUseCase,
  ListMatchesUseCase,
  MATCH_STATUSES,
  RunAllMatchesUseCase,
  RunListingMatchesUseCase,
  SendMatchUseCase,
  sendMatchSchema,
  type MatchDto,
  type MatchStatusValue,
} from "../application/use-cases";

export class MatchingController {
  private readonly service = new MatchingService(getWhatsAppProvider());
  private readonly listUC = new ListMatchesUseCase();
  private readonly sendUC = new SendMatchUseCase(this.service);
  private readonly dismissUC = new DismissMatchUseCase(this.service);
  private readonly runUC = new RunListingMatchesUseCase(this.service);
  private readonly runAllUC = new RunAllMatchesUseCase(this.service);

  list(status: string | null): Promise<MatchDto[]> {
    const valid = MATCH_STATUSES.includes(status as MatchStatusValue) ? (status as MatchStatusValue) : undefined;
    return this.listUC.execute(valid);
  }

  send(id: string, body: unknown) {
    return this.sendUC.execute(id, sendMatchSchema.parse(body ?? {}));
  }

  dismiss(id: string): Promise<void> {
    return this.dismissUC.execute(id);
  }

  runForListing(listingId: string): Promise<MatchRunResult> {
    return this.runUC.execute(listingId);
  }

  runAll() {
    return this.runAllUC.execute();
  }
}
