import { GetDashboardStatsUseCase } from "@modules/dashboard/application/get-stats.use-case";
import { ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

export const GET = withRequestContext(async () => {
  const data = await new GetDashboardStatsUseCase().execute();
  return ok(data);
});
