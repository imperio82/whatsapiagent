"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@services/dashboard.service";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardService.getStats(),
    refetchInterval: 15_000,
  });
}
