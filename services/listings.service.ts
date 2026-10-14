import { api } from "./api-client";
import type {
  CreateListingInput,
  ListingDto,
  ListListingsInput,
  UpdateListingInput,
} from "@modules/listings/application/dtos";

export const listingsService = {
  list: (filters: Partial<ListListingsInput> = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
    );
    const qs = params.toString();
    return api.get<ListingDto[]>(`/api/v1/listings${qs ? `?${qs}` : ""}`);
  },
  create: (input: CreateListingInput) => api.post<ListingDto>("/api/v1/listings", input),
  update: (id: string, input: UpdateListingInput) => api.patch<ListingDto>(`/api/v1/listings/${id}`, input),
  archive: (id: string) => api.delete<void>(`/api/v1/listings/${id}`),
};
