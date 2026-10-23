/**
 * Limpieza de valores que llegan de Excel, Sheets o una base externa: precios con símbolos,
 * fechas en varios formatos, teléfonos sin indicativo, tipos escritos a mano.
 */

const SPANISH_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * "$ 82.000.000" → 82000000 · "4,500" → 4500 · "4.500,50" → 4500.5 · "1,234.5" → 1234.5.
 * En Colombia el punto separa miles: un solo punto seguido de 3 dígitos se toma como miles.
 */
export function parseAmount(raw: string): number | null {
  let v = raw.replace(/[^\d.,-]/g, "");
  if (!v || !/\d/.test(v)) return null;
  const lastDot = v.lastIndexOf(".");
  const lastComma = v.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // El que aparece de último es el separador decimal
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    v = v.split(thousands).join("").replace(decimal, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = v.split(sep);
    const thousandsLike = parts.length > 2 || parts[parts.length - 1]!.length === 3;
    v = thousandsLike ? parts.join("") : parts.join(".");
  }
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseInteger(raw: string): number | null {
  const n = parseAmount(raw);
  return n === null ? null : Math.round(n);
}

/** sí/no, true/false, activo/inactivo… Vacío o desconocido = null. */
export function parseBoolean(raw: string): boolean | null {
  const v = plain(raw);
  if (!v) return null;
  if (["si", "s", "true", "1", "x", "activo", "activa", "yes", "publicado", "disponible"].includes(v)) return true;
  if (["no", "n", "false", "0", "inactivo", "inactiva", "archivado", "oculto"].includes(v)) return false;
  return null;
}

const VEHICLE_WORDS = ["vehiculo", "carro", "auto", "automovil", "camioneta", "moto", "motocicleta", "campero", "camion", "suv", "sedan", "hatchback", "pickup", "bus", "van", "furgon"];
const PROPERTY_WORDS = ["inmueble", "casa", "apartamento", "apto", "lote", "finca", "local", "oficina", "bodega", "terreno", "apartaestudio", "edificio", "habitacion", "consultorio", "parqueadero", "predio"];

export function parseListingKind(raw: string): "VEHICLE" | "PROPERTY" | "OTHER" | null {
  const v = plain(raw);
  if (!v) return null;
  if (v === "vehicle") return "VEHICLE";
  if (v === "property") return "PROPERTY";
  const words = v.split(/[^a-z]+/);
  if (words.some((w) => VEHICLE_WORDS.includes(w))) return "VEHICLE";
  if (words.some((w) => PROPERTY_WORDS.includes(w))) return "PROPERTY";
  return "OTHER";
}

export function parseOperation(raw: string): "SALE" | "RENT" {
  const v = plain(raw);
  return /arriendo|arrendamiento|alquiler|renta|rent|canon/.test(v) ? "RENT" : "SALE";
}

export function parseListingStatus(raw: string): "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED" | null {
  const v = plain(raw);
  if (!v) return null;
  if (/reservad|separad/.test(v)) return "RESERVED";
  if (/vendid|arrendad|sold|cerrad/.test(v)) return "SOLD";
  if (/archivad|inactiv|retirad|no disponible/.test(v)) return "ARCHIVED";
  return "AVAILABLE";
}

/**
 * Celular con indicativo, solo dígitos. Un número colombiano de 10 dígitos que empieza por 3 se
 * completa con 57. Si no parece un teléfono, null.
 */
export function normalizePhone(raw: string, defaultCountry = "57"): string | null {
  let digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) digits = defaultCountry + digits;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Varios enlaces en una celda: separados por coma, punto y coma, espacio o salto de línea. */
export function splitUrls(raw: string): string[] {
  return raw
    .split(/[\s,;|]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\/\S+$/i.test(u));
}

export interface MonthDay {
  month: number;
  day: number;
  year: number | null;
}

const validDay = (y: number | null, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y ?? 2000, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * Fecha de cumpleaños en los formatos comunes: 15/03/1990, 15-03, 1990-03-15, "15 de marzo de 1990",
 * o el número de serie de Excel (días desde 1899-12-30). En Colombia el día va primero.
 */
export function parseMonthDay(raw: string): MonthDay | null {
  const v = plain(raw);
  if (!v) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validDay(y, mo, d) ? { month: mo, day: d, year: y } : null;
  }

  m = /^(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/.exec(v);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : null;
    if (y !== null && y < 100) y += y > (new Date().getFullYear() % 100) ? 1900 : 2000;
    return validDay(y, mo, d) ? { month: mo, day: d, year: y } : null;
  }

  m = /^(\d{1,2})\s*(?:de\s+)?([a-z]+)(?:\s*(?:de|del)?\s*(\d{4}))?$/.exec(v);
  if (m) {
    const mo = SPANISH_MONTHS.findIndex((name) => name.startsWith(m![2]!.slice(0, 3))) + 1;
    const d = Number(m[1]);
    const y = m[3] ? Number(m[3]) : null;
    return mo > 0 && validDay(y, mo, d) ? { month: mo, day: d, year: y } : null;
  }

  // Número de serie de Excel (fecha guardada como número)
  if (/^\d{4,5}$/.test(v)) {
    const serial = Number(v);
    if (serial > 1000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return { month: date.getUTCMonth() + 1, day: date.getUTCDate(), year: date.getUTCFullYear() };
    }
  }
  return null;
}
