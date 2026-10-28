import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import { getFastAIProvider } from "@modules/ai/infrastructure/provider-factory";
import {
  DraftAppointmentNoticeUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  noticeDraftSchema,
  updateAppointmentSchema,
  type AppointmentDto,
  type NoticeDraftDto,
} from "../application/use-cases";

export class AppointmentsController {
  private readonly listUC = new ListAppointmentsUseCase();
  private readonly updateUC = new UpdateAppointmentUseCase(getWhatsAppProvider(), getFastAIProvider());
  private readonly draftUC = new DraftAppointmentNoticeUseCase(getWhatsAppProvider(), getFastAIProvider());

  list(): Promise<AppointmentDto[]> {
    return this.listUC.execute();
  }

  update(id: string, body: unknown): Promise<AppointmentDto> {
    return this.updateUC.execute(id, updateAppointmentSchema.parse(body));
  }

  draftNotice(id: string, body: unknown): Promise<NoticeDraftDto> {
    return this.draftUC.execute(id, noticeDraftSchema.parse(body));
  }
}
