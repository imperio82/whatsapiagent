import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { GreetingsService } from "../application/greetings.service";
import {
  DismissGreetingUseCase,
  GetGreetingSettingsUseCase,
  GREETING_STATUSES,
  ListGreetingsUseCase,
  ListUpcomingDatesUseCase,
  PrepareGreetingsUseCase,
  SendGreetingUseCase,
  UpdateGreetingSettingsUseCase,
  sendGreetingSchema,
  type GreetingStatusValue,
} from "../application/use-cases";

export class GreetingsController {
  private readonly service = new GreetingsService(getWhatsAppProvider());

  list(status: string | null) {
    const valid = GREETING_STATUSES.includes(status as GreetingStatusValue) ? (status as GreetingStatusValue) : undefined;
    return new ListGreetingsUseCase().execute(valid);
  }

  upcoming() {
    return new ListUpcomingDatesUseCase().execute();
  }

  prepare() {
    return new PrepareGreetingsUseCase(this.service).execute();
  }

  send(id: string, body: unknown) {
    return new SendGreetingUseCase(this.service).execute(id, sendGreetingSchema.parse(body ?? {}));
  }

  dismiss(id: string) {
    return new DismissGreetingUseCase(this.service).execute(id);
  }

  settings() {
    return new GetGreetingSettingsUseCase().execute();
  }

  updateSettings(body: unknown) {
    return new UpdateGreetingSettingsUseCase().execute(body);
  }
}
