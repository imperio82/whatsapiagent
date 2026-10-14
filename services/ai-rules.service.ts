import { api } from "./api-client";
import type { AiRuleDto, CreateAiRuleInput, UpdateAiRuleInput } from "@modules/ai/application/ai-rules.use-cases";

export const aiRulesService = {
  list: () => api.get<AiRuleDto[]>("/api/v1/ai/rules"),
  create: (input: CreateAiRuleInput) => api.post<AiRuleDto>("/api/v1/ai/rules", input),
  update: (id: string, input: UpdateAiRuleInput) => api.patch<AiRuleDto>(`/api/v1/ai/rules/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/v1/ai/rules/${id}`),
  restore: () => api.post<AiRuleDto[]>("/api/v1/ai/rules/restore"),
};
