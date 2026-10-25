import {
  CloneVoiceUseCase,
  DeleteClonedVoiceUseCase,
  GetVoiceClipUseCase,
  GetVoiceSettingsUseCase,
  PreviewVoiceUseCase,
  UpdateVoiceSettingsUseCase,
  previewVoiceSchema,
  updateVoiceSettingsSchema,
  type VoiceOptionDto,
  type VoicePreviewDto,
  type VoiceSettingsDto,
} from "../application/voice-settings.use-cases";
import type { VoiceSettings } from "../application/voice-runtime";

export class VoiceController {
  private readonly getUC = new GetVoiceSettingsUseCase();
  private readonly updateUC = new UpdateVoiceSettingsUseCase();
  private readonly previewUC = new PreviewVoiceUseCase();
  private readonly cloneUC = new CloneVoiceUseCase();
  private readonly deleteCloneUC = new DeleteClonedVoiceUseCase();
  private readonly clipUC = new GetVoiceClipUseCase();

  settings(): Promise<VoiceSettingsDto> {
    return this.getUC.execute();
  }

  update(body: unknown): Promise<VoiceSettings> {
    return this.updateUC.execute(updateVoiceSettingsSchema.parse(body));
  }

  preview(body: unknown): Promise<VoicePreviewDto> {
    return this.previewUC.execute(previewVoiceSchema.parse(body));
  }

  clone(form: FormData): Promise<VoiceOptionDto> {
    return this.cloneUC.execute({
      name: String(form.get("name") ?? ""),
      consent: form.get("consent") === "true",
      files: form.getAll("files").filter((f): f is File => f instanceof File),
    });
  }

  deleteClone(id: string): Promise<void> {
    return this.deleteCloneUC.execute(id);
  }

  clip(id: string): Promise<{ data: Buffer; mimeType: string }> {
    return this.clipUC.execute(id);
  }
}
