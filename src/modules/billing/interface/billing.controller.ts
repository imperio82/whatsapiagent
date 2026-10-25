import { GetMyUsageUseCase, type MyUsageDto } from "../application/my-usage.use-case";

export class BillingController {
  private readonly myUsageUC = new GetMyUsageUseCase();

  myUsage(): Promise<MyUsageDto> {
    return this.myUsageUC.execute();
  }
}
