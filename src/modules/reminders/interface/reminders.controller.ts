import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { RemindersService } from "../application/reminders.service";
import {
  CompleteReminderUseCase,
  CreateReminderUseCase,
  DismissReminderUseCase,
  GetReminderSettingsUseCase,
  ListRemindersUseCase,
  PrepareRemindersUseCase,
  REMINDER_KINDS,
  REMINDER_STATUSES,
  SendReminderUseCase,
  UpdateReminderSettingsUseCase,
  sendReminderSchema,
  type ReminderStatusValue,
} from "../application/use-cases";
import type { ReminderKindValue } from "../domain/reminders";

export class RemindersController {
  private readonly service = new RemindersService(getWhatsAppProvider());

  list(status: string | null, kind: string | null) {
    return new ListRemindersUseCase().execute({
      status: REMINDER_STATUSES.includes(status as ReminderStatusValue) ? (status as ReminderStatusValue) : undefined,
      kind: REMINDER_KINDS.includes(kind as ReminderKindValue) ? (kind as ReminderKindValue) : undefined,
    });
  }

  create(body: unknown) {
    return new CreateReminderUseCase(this.service).execute(body);
  }

  prepare() {
    return new PrepareRemindersUseCase(this.service).execute();
  }

  send(id: string, body: unknown) {
    return new SendReminderUseCase(this.service).execute(id, sendReminderSchema.parse(body ?? {}));
  }

  complete(id: string) {
    return new CompleteReminderUseCase(this.service).execute(id);
  }

  dismiss(id: string) {
    return new DismissReminderUseCase(this.service).execute(id);
  }

  settings() {
    return new GetReminderSettingsUseCase().execute();
  }

  updateSettings(body: unknown) {
    return new UpdateReminderSettingsUseCase().execute(body);
  }
}
