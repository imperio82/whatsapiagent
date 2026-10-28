import { api } from "./api-client";
import type {
  AddBillingEntryInput,
  BillingEntryDto,
  PlatformOverviewDto,
  TenantCostsDto,
  UpdateTenantBillingInput,
} from "@modules/platform/application/platform.use-cases";
import type { AgentModelDto, SetAgentModelInput } from "@modules/platform/application/agent-model.use-cases";
import type { SetVoiceModelInput, VoiceModelDto } from "@modules/platform/application/voice-model.use-cases";
import type { SetTrialInput, TrialSettingsDto } from "@modules/platform/application/trial.use-cases";
import type { ElevenLabsSettingsDto, SetElevenLabsInput } from "@modules/platform/application/elevenlabs.use-cases";
import type { SetEnforcementInput, UsageLimitsDto } from "@modules/platform/application/usage-limits.use-cases";
import type { PlatformRechargesDto, ResolveRechargeInput } from "@modules/platform/application/recharges-admin.use-cases";

const BASE = "/api/v1/platform/tenants";

export const platformService = {
  overview: (month: string) => api.get<PlatformOverviewDto>(`${BASE}?month=${month}`),
  costs: (id: string, month: string) => api.get<TenantCostsDto>(`${BASE}/${id}/costs?month=${month}`),
  updateTenant: (id: string, input: UpdateTenantBillingInput) => api.patch<{ id: string }>(`${BASE}/${id}`, input),
  entries: (id: string) => api.get<BillingEntryDto[]>(`${BASE}/${id}/billing`),
  addEntry: (id: string, input: AddBillingEntryInput) => api.post<BillingEntryDto>(`${BASE}/${id}/billing`, input),
  agentModel: () => api.get<AgentModelDto>("/api/v1/platform/ai-model"),
  setAgentModel: (input: SetAgentModelInput) => api.put<AgentModelDto>("/api/v1/platform/ai-model", input),
  elevenLabs: () => api.get<ElevenLabsSettingsDto>("/api/v1/platform/elevenlabs"),
  setElevenLabs: (input: SetElevenLabsInput) => api.put<ElevenLabsSettingsDto>("/api/v1/platform/elevenlabs", input),
  trial: () => api.get<TrialSettingsDto>("/api/v1/platform/trial"),
  setTrial: (input: SetTrialInput) => api.put<TrialSettingsDto>("/api/v1/platform/trial", input),
  voiceModel: () => api.get<VoiceModelDto>("/api/v1/platform/voice-model"),
  setVoiceModel: (input: SetVoiceModelInput) => api.put<VoiceModelDto>("/api/v1/platform/voice-model", input),
  limits: (month: string) => api.get<UsageLimitsDto>(`/api/v1/platform/limits?month=${month}`),
  setEnforcement: (input: SetEnforcementInput) => api.put<UsageLimitsDto>("/api/v1/platform/limits", input),
  recharges: () => api.get<PlatformRechargesDto>("/api/v1/platform/recharges"),
  resolveRecharge: (id: string, input: ResolveRechargeInput) =>
    api.patch<PlatformRechargesDto>(`/api/v1/platform/recharges/${id}`, input),
  setPaymentInstructions: (instructions: string) =>
    api.put<PlatformRechargesDto>("/api/v1/platform/recharges", { instructions }),
};
