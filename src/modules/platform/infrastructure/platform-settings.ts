import { prisma } from "@shared/infrastructure/prisma/client";

/** Se leen en cada respuesta del agente: se guardan en memoria un rato para no consultar la base cada vez */
const CACHE_MS = 30_000;
const cache = new Map<string, { value: string | null; at: number }>();

/** Ajuste de platform_settings; null si no existe o si la tabla todavía no está (migración sin aplicar). */
export async function getPlatformSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: string | null = null;
  try {
    value = (await prisma.platformSetting.findUnique({ where: { key } }))?.value ?? null;
  } catch (err) {
    console.warn(`[plataforma] no se pudo leer el ajuste ${key}: ${(err as Error).message}`);
  }
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setPlatformSetting(key: string, value: string): Promise<void> {
  await prisma.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  cache.set(key, { value, at: Date.now() });
}

/**
 * Cómo se aplican los límites de uso. "registro" (fase 1 del documento): se calcula y se registra qué
 * habría pasado, pero el agente sigue como antes. "activo": al llegar al tope hay gracia y mensaje de espera.
 */
export type LimitsEnforcement = "registro" | "activo";
const ENFORCEMENT_KEY = "usage.enforcement";

export async function limitsEnforcement(): Promise<LimitsEnforcement> {
  return (await getPlatformSetting(ENFORCEMENT_KEY)) === "activo" ? "activo" : "registro";
}

export function setLimitsEnforcement(mode: LimitsEnforcement): Promise<void> {
  return setPlatformSetting(ENFORCEMENT_KEY, mode);
}
