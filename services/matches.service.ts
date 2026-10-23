import { api } from "./api-client";
import type { MatchDto, MatchStatusValue } from "@modules/matching/application/use-cases";

export const matchesService = {
  list: (status?: MatchStatusValue) => api.get<MatchDto[]>(`/api/v1/matches${status ? `?status=${status}` : ""}`),
  send: (id: string, message?: string) =>
    api.post<{ status: "SENT" | "FAILED"; error?: string }>(`/api/v1/matches/${id}/send`, message ? { message } : {}),
  dismiss: (id: string) => api.post<void>(`/api/v1/matches/${id}/dismiss`),
  runForListing: (listingId: string) => api.post<{ created: number; sent: number }>(`/api/v1/listings/${listingId}/matches`),
};
