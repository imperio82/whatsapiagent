import { api, ApiError } from "./api-client";
import type { DataSourceDto, PreviewDto } from "@modules/data-import/application/use-cases";
import type { ImportTargetValue } from "@modules/data-import/domain/targets";

export type Mapping = Record<string, string | string[]>;

export type ConnectedSourceInput =
  | { type: "GOOGLE_SHEET"; spreadsheet: string; sheetName?: string | null }
  | { type: "POSTGRES" | "MYSQL"; connectionUrl: string; table?: string | null };

/** Los archivos van en multipart; el cliente JSON no sirve aquí. */
async function upload<T>(path: string, file: File, fields: Record<string, string | null | undefined>): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  const res = await fetch(path, { method: "POST", body: form, credentials: "include" });
  const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data;
}

export const dataSourcesService = {
  list: () => api.get<DataSourceDto[]>("/api/v1/data-sources"),
  previewFile: (file: File, target: ImportTargetValue, sheetName?: string | null) =>
    upload<PreviewDto>("/api/v1/data-sources/file/preview", file, { target, sheetName }),
  importFile: (file: File, target: ImportTargetValue, mapping: Mapping, sheetName?: string | null) =>
    upload<DataSourceDto>("/api/v1/data-sources/file/import", file, { target, sheetName, mapping: JSON.stringify(mapping) }),
  previewSource: (target: ImportTargetValue, source: ConnectedSourceInput) =>
    api.post<PreviewDto>("/api/v1/data-sources/preview", { target, ...source }),
  create: (input: ConnectedSourceInput & { name: string; target: ImportTargetValue; mapping: Mapping; syncEveryMinutes: 60 | 360 | 1440 | null }) =>
    api.post<DataSourceDto>("/api/v1/data-sources", input),
  update: (id: string, input: { name?: string; mapping?: Mapping; syncEveryMinutes?: 60 | 360 | 1440 | null; isActive?: boolean }) =>
    api.patch<DataSourceDto>(`/api/v1/data-sources/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/v1/data-sources/${id}`),
  sync: (id: string) => api.post<DataSourceDto>(`/api/v1/data-sources/${id}/sync`),
};
