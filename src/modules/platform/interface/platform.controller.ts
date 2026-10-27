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
import {
  GetAgentModelUseCase,
  SetAgentModelUseCase,
  setAgentModelSchema,
  type AgentModelDto,
} from "../application/agent-model.use-cases";
import {
  GetUsageLimitsUseCase,
  SetLimitsEnforcementUseCase,
  setEnforcementSchema,
  type UsageLimitsDto,
} from "../application/usage-limits.use-cases";

export class PlatformController {
  private readonly overviewUC = new GetPlatformOverviewUseCase();
  private readonly costsUC = new GetTenantCostsUseCase();
  private readonly updateUC = new UpdateTenantBillingUseCase();
  private readonly listEntriesUC = new ListBillingEntriesUseCase();
  private readonly addEntryUC = new AddBillingEntryUseCase();
  private readonly getModelUC = new GetAgentModelUseCase();
  private readonly setModelUC = new SetAgentModelUseCase();
  private readonly limitsUC = new GetUsageLimitsUseCase();
  private readonly enforcementUC = new SetLimitsEnforcementUseCase();

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

  agentModel(): Promise<AgentModelDto> {
    return this.getModelUC.execute();
  }

  async setAgentModel(body: unknown): Promise<AgentModelDto> {
    await this.setModelUC.execute(setAgentModelSchema.parse(body));
    return this.getModelUC.execute();
  }

  limits(month: string | null): Promise<UsageLimitsDto> {
    return this.limitsUC.execute(month);
  }

  async setEnforcement(body: unknown): Promise<UsageLimitsDto> {
    await this.enforcementUC.execute(setEnforcementSchema.parse(body));
    return this.limitsUC.execute(null);
  }
}
