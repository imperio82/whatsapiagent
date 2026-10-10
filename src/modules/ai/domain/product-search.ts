/**
 * Búsqueda de productos tolerante a cómo escribe la gente por WhatsApp:
 * sin tildes, sin importar mayúsculas, singular/plural y "500g" = "500 g".
 * Es una función pura para poder probarla sin base de datos.
 */

export interface SearchableProduct {
  name: string;
  sku: string | null;
  description: string | null;
}

// Palabras que no ayudan a encontrar el producto
const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "por", "para", "con", "y", "o",
  "me", "mi", "te", "que", "hay", "tienen", "tiene", "tienes", "quiero", "necesito", "busco", "dame",
  "mandame", "manda", "vende", "venden", "precio", "cuanto", "vale", "cuesta", "favor", "porfa", "x",
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/(\d)([a-z])/g, "$1 $2") // 500g → 500 g
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Singular sencillo: "panelas" → "panela", "jabones" → "jabon". */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function queryTokens(query: string): string[] {
  return [...new Set(normalize(query).split(" ").filter((w) => w && !STOPWORDS.has(w)).map(stem))];
}

/**
 * Ordena los productos por cuántas palabras de la búsqueda contienen.
 * Una coincidencia en el nombre pesa más que en la descripción.
 * Devuelve solo los que coinciden con al menos una palabra.
 */
export function rankProducts<T extends SearchableProduct>(query: string, products: T[], limit: number): T[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return products.slice(0, limit);

  const scored = products.map((p) => {
    const nameWords = normalize(`${p.name} ${p.sku ?? ""}`).split(" ").map(stem);
    const descWords = normalize(p.description ?? "").split(" ").map(stem);
    let score = 0;
    for (const t of tokens) {
      if (nameWords.some((w) => w === t || w.startsWith(t))) score += 2;
      else if (descWords.some((w) => w === t || w.startsWith(t))) score += 1;
    }
    return { p, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}
