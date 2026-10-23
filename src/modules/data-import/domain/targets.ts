/**
 * Qué se puede importar y a qué campo va cada columna. Cada destino tiene una columna "llave"
 * que identifica la fila entre sincronizaciones (SKU, código del bien, teléfono): con ella se
 * actualiza lo que ya existe en vez de duplicarlo.
 */

export type ImportTargetValue = "PRODUCTS" | "LISTINGS" | "CLIENTS";

export interface TargetField {
  key: string;
  label: string;
  required?: boolean;
  /** Identifica la fila entre sincronizaciones. */
  isKey?: boolean;
  hint?: string;
  /** Encabezados que se reconocen solos al mapear (sin tildes, en minúscula). */
  synonyms: string[];
}

export interface TargetDefinition {
  value: ImportTargetValue;
  label: string;
  description: string;
  fields: TargetField[];
  /** Las columnas sin mapear se pueden guardar como características del bien. */
  allowsExtraColumns?: boolean;
}

export const IMPORT_TARGETS: Record<ImportTargetValue, TargetDefinition> = {
  PRODUCTS: {
    value: "PRODUCTS",
    label: "Productos",
    description: "Catálogo de la tienda: lo que la IA cotiza y vende.",
    fields: [
      { key: "sku", label: "Código / SKU", required: true, isKey: true, synonyms: ["sku", "codigo", "referencia", "ref", "id", "code", "cod"] },
      { key: "name", label: "Nombre", required: true, synonyms: ["nombre", "producto", "name", "descripcion corta", "articulo"] },
      { key: "price", label: "Precio", required: true, hint: "En pesos: $4.500, 4500 o 4,500", synonyms: ["precio", "price", "valor", "precio venta", "pvp", "valor unitario"] },
      { key: "description", label: "Descripción", synonyms: ["descripcion", "description", "detalle", "detalles"] },
      { key: "stock", label: "Existencias", hint: "Vacío = no se controla inventario", synonyms: ["stock", "existencias", "cantidad", "inventario", "disponible", "unidades"] },
      { key: "imageUrl", label: "Foto (enlace)", synonyms: ["imagen", "foto", "image", "url imagen", "foto url", "imagen url"] },
      { key: "active", label: "Activo", hint: "sí/no; vacío = activo", synonyms: ["activo", "estado", "status", "publicado"] },
    ],
  },
  LISTINGS: {
    value: "LISTINGS",
    label: "Inventario (vehículos e inmuebles)",
    description: "Bienes que la IA ofrece. Los datos del propietario quedan privados.",
    allowsExtraColumns: true,
    fields: [
      { key: "externalId", label: "Código del bien", required: true, isKey: true, hint: "El código o id en tu archivo", synonyms: ["codigo", "id", "referencia", "ref", "placa", "matricula", "code"] },
      { key: "title", label: "Nombre del bien", required: true, synonyms: ["nombre", "titulo", "title", "vehiculo", "inmueble", "descripcion corta", "bien"] },
      { key: "kind", label: "Tipo (vehículo o inmueble)", required: true, hint: "carro, moto, camioneta → vehículo; casa, apartamento, lote → inmueble", synonyms: ["tipo", "clase", "categoria", "tipo de bien"] },
      { key: "operation", label: "Venta o arriendo", hint: "Vacío = venta", synonyms: ["operacion", "negocio", "venta arriendo", "tipo de negocio", "modalidad"] },
      { key: "price", label: "Precio", required: true, synonyms: ["precio", "valor", "price", "canon", "precio venta"] },
      { key: "city", label: "Ciudad", required: true, synonyms: ["ciudad", "municipio", "city"] },
      { key: "zone", label: "Barrio o sector", synonyms: ["barrio", "sector", "zona", "ubicacion"] },
      { key: "description", label: "Descripción", synonyms: ["descripcion", "detalle", "observaciones publicas", "description"] },
      { key: "photos", label: "Fotos (enlaces)", hint: "Varios enlaces separados por coma o espacio", synonyms: ["fotos", "imagenes", "foto", "imagen", "photos"] },
      { key: "status", label: "Estado", hint: "disponible, reservado, vendido; vacío = disponible", synonyms: ["estado", "status", "disponibilidad"] },
      { key: "ownerName", label: "Propietario (privado)", synonyms: ["propietario", "dueno", "nombre propietario", "owner"] },
      { key: "ownerPhone", label: "Teléfono del propietario (privado)", synonyms: ["telefono propietario", "celular propietario", "tel propietario", "contacto propietario"] },
      { key: "exactAddress", label: "Dirección exacta (privada)", synonyms: ["direccion", "direccion exacta", "address"] },
    ],
  },
  CLIENTS: {
    value: "CLIENTS",
    label: "Clientes",
    description: "Tu base de clientes, con sus cumpleaños para felicitarlos.",
    fields: [
      { key: "phone", label: "Celular (WhatsApp)", required: true, isKey: true, hint: "Sin indicativo se asume Colombia (57)", synonyms: ["celular", "telefono", "whatsapp", "movil", "phone", "tel", "numero"] },
      { key: "name", label: "Nombre", required: true, synonyms: ["nombre", "cliente", "nombre completo", "name", "razon social"] },
      { key: "email", label: "Correo", synonyms: ["correo", "email", "e-mail", "mail", "correo electronico"] },
      { key: "city", label: "Ciudad", synonyms: ["ciudad", "municipio", "city"] },
      { key: "address", label: "Dirección", synonyms: ["direccion", "address", "domicilio"] },
      { key: "birthday", label: "Cumpleaños", hint: "15/03/1990, 1990-03-15 o 15 de marzo", synonyms: ["cumpleanos", "fecha de nacimiento", "nacimiento", "birthday", "fecha nacimiento", "cumple"] },
      { key: "notes", label: "Notas", synonyms: ["notas", "observaciones", "comentarios", "notes"] },
    ],
  },
};

/** "Teléfono  Propietario" → "telefono propietario" */
export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Propone a qué campo va cada columna según su encabezado. Cada columna se usa una sola vez. */
export function guessMapping(columns: string[], target: ImportTargetValue): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const normalized = columns.map((c) => ({ column: c, n: normalizeHeader(c) }));
  const fields = IMPORT_TARGETS[target].fields;
  const assign = (key: string, column: string) => {
    mapping[key] = column;
    used.add(column);
  };

  // 1) Coincidencias exactas para todos los campos, así "Teléfono propietario" no se lo lleva "propietario"
  for (const field of fields) {
    const exact = normalized.find((c) => !used.has(c.column) && field.synonyms.includes(c.n));
    if (exact) assign(field.key, exact.column);
  }
  // 2) Columnas que contienen un sinónimo completo; gana el sinónimo más largo (más específico)
  const candidates = fields
    .filter((f) => !mapping[f.key])
    .flatMap((f) => f.synonyms.filter((s) => s.length >= 4).map((s) => ({ field: f, s })))
    .sort((a, b) => b.s.length - a.s.length);
  for (const { field, s } of candidates) {
    if (mapping[field.key]) continue;
    const match = normalized.find((c) => !used.has(c.column) && ` ${c.n} `.includes(` ${s} `));
    if (match) assign(field.key, match.column);
  }
  return mapping;
}

/** Campos obligatorios sin columna asignada. */
export function missingRequired(mapping: Record<string, string>, target: ImportTargetValue): TargetField[] {
  return IMPORT_TARGETS[target].fields.filter((f) => f.required && !mapping[f.key]);
}
