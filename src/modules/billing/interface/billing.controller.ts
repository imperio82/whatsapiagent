import { GetMyUsageUseCase, type MyUsageDto } from "../application/my-usage.use-case";
import {
  GetRechargeOptionsUseCase,
  RequestRechargeUseCase,
  requestRechargeSchema,
  type RechargeDto,
  type RechargeOptionsDto,
} from "../application/recharges.use-cases";

export class BillingController {
  private readonly myUsageUC = new GetMyUsageUseCase();
  private readonly rechargeOptionsUC = new GetRechargeOptionsUseCase();
  private readonly requestRechargeUC = new RequestRechargeUseCase();

  myUsage(): Promise<MyUsageDto> {
    return this.myUsageUC.execute();
  }

  rechargeOptions(): Promise<RechargeOptionsDto> {
    return this.rechargeOptionsUC.execute();
  }

  requestRecharge(body: unknown): Promise<RechargeDto> {
    return this.requestRechargeUC.execute(requestRechargeSchema.parse(body));
  }
}
