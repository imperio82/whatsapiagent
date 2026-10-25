import {
  AddBillingEntryUseCase,
  GetPlatformOverviewUseCase,
  GetTenantCostsUseCase,
  ListBillingEntriesUseCase,
  UpdateTenantBillingUseCase,
  addBillingEntrySchema,
  updateTenantBillingSchema,
  type BillingEntryDto,
  type PlatformOverviewDto,
  type TenantCostsDto,
} from "../application/platform.use-cases";

export class PlatformController {
  private readonly overviewUC = new GetPlatformOverviewUseCase();
  private readonly costsUC = new GetTenantCostsUseCase();
  private readonly updateUC = new UpdateTenantBillingUseCase();
  private readonly listEntriesUC = new ListBillingEntriesUseCase();
  private readonly addEntryUC = new AddBillingEntryUseCase();

  overview(month: string | null): Promise<PlatformOverviewDto> {
    return this.overviewUC.execute(month);
  }

  costs(tenantId: string, month: string | null): Promise<TenantCostsDto> {
    return this.costsUC.execute(tenantId, month);
  }

  updateTenant(tenantId: string, body: unknown): Promise<void> {
    return this.updateUC.execute(tenantId, updateTenantBillingSchema.parse(body));
  }

  entries(tenantId: string): Promise<BillingEntryDto[]> {
    return this.listEntriesUC.execute(tenantId);
  }

  addEntry(tenantId: string, ownerUserId: string, body: unknown): Promise<BillingEntryDto> {
    return this.addEntryUC.execute(tenantId, ownerUserId, addBillingEntrySchema.parse(body));
  }
}
