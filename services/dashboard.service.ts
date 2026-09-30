import { api } from "./api-client";
import type { DashboardStatsDto } from "@modules/dashboard/application/get-stats.use-case";

export const dashboardService = {
  getStats: () => api.get<DashboardStatsDto>("/api/v1/dashboard/stats"),
};
