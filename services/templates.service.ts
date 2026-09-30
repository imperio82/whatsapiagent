import { api } from "./api-client";
import type {
  TemplateDto,
  UpsertTemplateInput,
} from "@modules/templates/application/dtos";

export const templatesService = {
  list: () => api.get<TemplateDto[]>("/api/v1/templates"),
  create: (input: UpsertTemplateInput) => api.post<TemplateDto>("/api/v1/templates", input),
  update: (id: string, input: Partial<UpsertTemplateInput>) =>
    api.patch<TemplateDto>(`/api/v1/templates/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/v1/templates/${id}`),
};
