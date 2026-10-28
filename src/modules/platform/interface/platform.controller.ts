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
  GetVoiceModelUseCase,
  SetVoiceModelUseCase,
  setVoiceModelSchema,
  type VoiceModelDto,
} from "../application/voice-model.use-cases";
import {
  GetTrialSettingsUseCase,
  SetTrialSettingsUseCase,
  setTrialSchema,
  type TrialSettingsDto,
} from "../application/trial.use-cases";
import {
  GetElevenLabsSettingsUseCase,
  SetElevenLabsSettingsUseCase,
  setElevenLabsSchema,
  type ElevenLabsSettingsDto,
} from "../application/elevenlabs.use-cases";
import {
  GetUsageLimitsUseCase,
  SetLimitsEnforcementUseCase,
  setEnforcementSchema,
  type UsageLimitsDto,
} from "../application/usage-limits.use-cases";
import {
  ListPlatformRechargesUseCase,
  ResolveRechargeUseCase,
  SetPaymentInstructionsUseCase,
  paymentInstructionsSchema,
  resolveRechargeSchema,
  type PlatformRechargesDto,
} from "../application/recharges-admin.use-cases";

export class PlatformController {
  private readonly overviewUC = new GetPlatformOverviewUseCase();
  private readonly costsUC = new GetTenantCostsUseCase();
  private readonly updateUC = new UpdateTenantBillingUseCase();
  private readonly listEntriesUC = new ListBillingEntriesUseCase();
  private readonly addEntryUC = new AddBillingEntryUseCase();
  private readonly getModelUC = new GetAgentModelUseCase();
  private readonly setModelUC = new SetAgentModelUseCase();
  private readonly getVoiceModelUC = new GetVoiceModelUseCase();
  private readonly setVoiceModelUC = new SetVoiceModelUseCase();
  private readonly getTrialUC = new GetTrialSettingsUseCase();
  private readonly setTrialUC = new SetTrialSettingsUseCase();
  private readonly getElevenLabsUC = new GetElevenLabsSettingsUseCase();
  private readonly setElevenLabsUC = new SetElevenLabsSettingsUseCase();
  private readonly limitsUC = new GetUsageLimitsUseCase();
  private readonly enforcementUC = new SetLimitsEnforcementUseCase();
  private readonly rechargesUC = new ListPlatformRechargesUseCase();
  private readonly resolveRechargeUC = new ResolveRechargeUseCase();
  private readonly instructionsUC = new SetPaymentInstructionsUseCase();

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

  elevenLabs(): Promise<ElevenLabsSettingsDto> {
    return this.getElevenLabsUC.execute();
  }

  async setElevenLabs(body: unknown): Promise<ElevenLabsSettingsDto> {
    await this.setElevenLabsUC.execute(setElevenLabsSchema.parse(body));
    return this.getElevenLabsUC.execute();
  }

  trial(): Promise<TrialSettingsDto> {
    return this.getTrialUC.execute();
  }

  async setTrial(body: unknown): Promise<TrialSettingsDto> {
    await this.setTrialUC.execute(setTrialSchema.parse(body));
    return this.getTrialUC.execute();
  }

  voiceModel(): Promise<VoiceModelDto> {
    return this.getVoiceModelUC.execute();
  }

  async setVoiceModel(body: unknown): Promise<VoiceModelDto> {
    await this.setVoiceModelUC.execute(setVoiceModelSchema.parse(body));
    return this.getVoiceModelUC.execute();
  }

  limits(month: string | null): Promise<UsageLimitsDto> {
    return this.limitsUC.execute(month);
  }

  async setEnforcement(body: unknown): Promise<UsageLimitsDto> {
    await this.enforcementUC.execute(setEnforcementSchema.parse(body));
    return this.limitsUC.execute(null);
  }

  recharges(): Promise<PlatformRechargesDto> {
    return this.rechargesUC.execute();
  }

  async resolveRecharge(id: string, ownerUserId: string, body: unknown): Promise<PlatformRechargesDto> {
    await this.resolveRechargeUC.execute(id, ownerUserId, resolveRechargeSchema.parse(body));
    return this.rechargesUC.execute();
  }

  async setPaymentInstructions(body: unknown): Promise<PlatformRechargesDto> {
    await this.instructionsUC.execute(paymentInstructionsSchema.parse(body));
    return this.rechargesUC.execute();
  }
}
