import { api } from "./api-client";
import type { MemberDto } from "@modules/users/application/list-members.use-case";
import type { RoleDto } from "@modules/roles/application/list-roles.use-case";

export const teamService = {
  list: () => api.get<MemberDto[]>("/api/v1/team"),
  listRoles: () => api.get<RoleDto[]>("/api/v1/roles"),
  updatePhone: (membershipId: string, whatsappPhone: string | null) =>
    api.patch<{ updated: boolean }>(`/api/v1/team/${membershipId}`, { whatsappPhone }),
};
