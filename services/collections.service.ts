import { api, ApiError } from "./api-client";
import type { CollectionDto, CollectionRowsDto } from "@modules/collections/application/collections.use-cases";

/** Los archivos van en multipart; el cliente JSON no sirve aquí. */
async function upload<T>(method: "POST" | "PUT", path: string, file: File, fields: Record<string, string | null | undefined>): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  const res = await fetch(path, { method, body: form, credentials: "include" });
  const json = (await res.json()) as { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };
  if (!json.ok) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
  return json.data;
}

export interface CollectionMeta {
  name: string;
  description?: string | null;
  aiEnabled?: boolean;
}

export const collectionsService = {
  list: () => api.get<CollectionDto[]>("/api/v1/collections"),
  rows: (id: string, q: string, page: number) =>
    api.get<CollectionRowsDto>(`/api/v1/collections/${id}?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  create: (meta: CollectionMeta, file: File) =>
    upload<CollectionDto>("POST", "/api/v1/collections", file, {
      name: meta.name,
      description: meta.description,
      aiEnabled: meta.aiEnabled === false ? "false" : "true",
    }),
  replaceData: (id: string, file: File) => upload<CollectionDto>("PUT", `/api/v1/collections/${id}/data`, file, {}),
  update: (id: string, input: Partial<CollectionMeta>) => api.patch<CollectionDto>(`/api/v1/collections/${id}`, input),
  remove: (id: string) => api.delete<void>(`/api/v1/collections/${id}`),
};
