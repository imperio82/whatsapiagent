import { GetCurrentTenantUseCase, type CurrentTenantDto } from "../application/get-current-tenant.use-case";
import { UpdateTenantUseCase, updateTenantSchema } from "../application/update-tenant.use-case";

export class TenantsController {
  private readonly getCurrent = new GetCurrentTenantUseCase();
  private readonly updateUC = new UpdateTenantUseCase();

  async getCurrentTenant(): Promise<CurrentTenantDto> {
    return this.getCurrent.execute();
  }

  async updateCurrentTenant(body: unknown): Promise<CurrentTenantDto> {
    const input = updateTenantSchema.parse(body);
    return this.updateUC.execute(input);
  }
}
