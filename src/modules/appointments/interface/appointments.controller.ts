import { getWhatsAppProvider } from "@modules/whatsapp/infrastructure/provider-factory";
import {
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
  updateAppointmentSchema,
  type AppointmentDto,
} from "../application/use-cases";

export class AppointmentsController {
  private readonly listUC = new ListAppointmentsUseCase();
  private readonly updateUC = new UpdateAppointmentUseCase(getWhatsAppProvider());

  list(): Promise<AppointmentDto[]> {
    return this.listUC.execute();
  }

  update(id: string, body: unknown): Promise<AppointmentDto> {
    return this.updateUC.execute(id, updateAppointmentSchema.parse(body));
  }
}
