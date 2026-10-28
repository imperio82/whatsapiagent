/**
 * El texto de una respuesta escrita para WhatsApp, preparado para leerse en voz alta. En el chat cada línea es
 * una idea, casi siempre sin punto al final, y hay abreviaturas y cifras de chat: así como está, la voz lo lee de
 * corrido y sin entonación. Aquí cada línea queda como frase con su puntuación y lo abreviado se escribe completo.
 * Es solo pronunciación: el texto que ve el cliente no cambia.
 */

/** Signos con los que una línea ya cierra (o deja) una pausa */
const ENDS_WITH_PAUSE = /[.!?…:;,]$/;

/** Abreviaturas de chat y de direcciones en Colombia, como se dicen */
const ABBREVIATIONS: [RegExp, string][] = [
  [/(\d)\s*(?:m2|m²|mts2|mt2|mts²)(?![\p{L}\d])/giu, "$1 metros cuadrados"],
  [/(?<![\p{L}\d])(?:m2|m²|mts2|mt2)(?![\p{L}\d])/giu, "metros cuadrados"],
  [/(?<![\p{L}\d])1\s*(?:habs?|hab\.)(?![\p{L}])/giu, "1 habitación"],
  [/(?<![\p{L}])(?:habs?\.?)(?![\p{L}])/giu, "habitaciones"],
  [/(\d)\s*kms?(?![\p{L}])/giu, "$1 kilómetros"],
  [/(?<![\p{L}])aprox\.?(?![\p{L}])/giu, "aproximadamente"],
  [/(?<![\p{L}])(?:cra|kra|kr)\.?(?=\s*\d)/giu, "carrera"],
  [/(?<![\p{L}])(?:cll|cl)\.?(?=\s*\d)/giu, "calle"],
  [/(?<![\p{L}])av\.?(?=\s)/giu, "avenida"],
  [/(?:#|N°|Nº)\s*(?=\d)/gu, "número "],
  [/(\d)\s*%/gu, "$1 por ciento"],
];

/** "$350.000.000" → "350 millones de pesos"; "$45.900" → "45 mil 900 pesos". Puntos de miles, coma decimal. */
export function spokenPrice(digits: string): string | null {
  const [whole, decimals] = digits.split(",");
  const value = Number(whole!.replace(/\./g, ""));
  if (!Number.isFinite(value) || (decimals && /[1-9]/.test(decimals))) return null;
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const units = value % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(millions === 1 ? "un millón" : `${millions} millones`);
  if (thousands > 0) parts.push(thousands === 1 && millions === 0 ? "mil" : `${thousands} mil`);
  if (units > 0 || parts.length === 0) parts.push(String(units));
  // "un millón de pesos" pero "un millón 200 mil pesos"
  const exactMillions = millions > 0 && thousands === 0 && units === 0;
  return `${parts.join(" ")} ${exactMillions ? "de pesos" : "pesos"}`;
}

function spokenPrices(text: string): string {
  return text.replace(
    /\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(?:\s?(?:COP|pesos))?/gi,
    (match, digits: string) => spokenPrice(digits) ?? match,
  );
}

/** Una línea del chat como frase: sin viñeta y con el signo que le corresponde al final. */
function asSentence(line: string): string {
  const text = line.replace(/^(?:[-•·*]|\d{1,2}[.)])\s+/, "").trim();
  if (!text || ENDS_WITH_PAUSE.test(text)) return text;
  if (text.includes("¿") && text.lastIndexOf("¿") > text.lastIndexOf("?")) return `${text}?`;
  if (text.includes("¡") && text.lastIndexOf("¡") > text.lastIndexOf("!")) return `${text}!`;
  return `${text}.`;
}

export function spokenText(text: string): string {
  let result = text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[*_~`]/g, "")
    .split(/\n+/)
    .map(asSentence)
    .filter(Boolean)
    .join(" ");
  result = spokenPrices(result);
  for (const [pattern, replacement] of ABBREVIATIONS) result = result.replace(pattern, replacement);
  return result
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
