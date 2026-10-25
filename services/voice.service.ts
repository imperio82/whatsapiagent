import { api, ApiError } from "./api-client";
import type {
  PreviewVoiceInput,
  UpdateVoiceSettingsInput,
  VoiceOptionDto,
  VoicePreviewDto,
  VoiceSettingsDto,
} from "@modules/voice/application/voice-settings.use-cases";
import type { VoiceSettings } from "@modules/voice/application/voice-runtime";

export const voiceService = {
  settings: () => api.get<VoiceSettingsDto>("/api/v1/voice/settings"),
  update: (input: UpdateVoiceSettingsInput) => api.put<VoiceSettings>("/api/v1/voice/settings", input),
  preview: (input: PreviewVoiceInput) => api.post<VoicePreviewDto>("/api/v1/voice/preview", input),
  deleteClone: (id: string) => api.delete<{ id: string }>(`/api/v1/voice/clones/${id}`),
  /** Multipart: el cliente del API solo manda JSON */
  clone: async (input: { name: string; consent: boolean; files: File[] }): Promise<VoiceOptionDto> => {
    const form = new FormData();
    form.append("name", input.name);
    form.append("consent", String(input.consent));
    for (const f of input.files) form.append("files", f);
    const res = await fetch("/api/v1/voice/clones", { method: "POST", body: form, credentials: "include" });
    const json = (await res.json()) as { ok: true; data: VoiceOptionDto } | { ok: false; error: { code: string; message: string } };
    if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message);
    return json.data;
  },
};
