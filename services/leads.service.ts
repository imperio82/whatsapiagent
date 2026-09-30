import { api } from "./api-client";
import type {
  CreateLeadInput,
  LeadDto,
  UpdateLeadInput,
} from "@modules/leads/application/dtos";
import type { OpenerDto } from "@modules/leads/application/list-openers.use-case";
import type { GeneratedOpenerDto } from "@modules/leads/application/generate-opener.use-case";

export type OpenerTone = "amable" | "directo" | "consultivo" | "promocional";

export const leadsService = {
  list: () => api.get<LeadDto[]>("/api/v1/leads"),
  create: (input: CreateLeadInput) => api.post<LeadDto>("/api/v1/leads", input),
  update: (id: string, input: UpdateLeadInput) =>
    api.patch<LeadDto>(`/api/v1/leads/${id}`, input),

  listOpeners: (leadId: string) => api.get<OpenerDto[]>(`/api/v1/leads/${leadId}/openers`),
  generateOpeners: (
    leadId: string,
    input: { tone?: OpenerTone; variants?: number } = {},
  ) => api.post<GeneratedOpenerDto[]>(`/api/v1/leads/${leadId}/openers`, input),
  sendOpener: (leadId: string, openerId: string) =>
    api.post<{ sentAt: string }>(`/api/v1/leads/${leadId}/openers/${openerId}/send`),
};
