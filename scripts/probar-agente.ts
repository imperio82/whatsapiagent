/**
 * Prueba el grafo multiagente sin WhatsApp ni base de datos: catálogo de ejemplo en memoria
 * y una conversación de varios turnos. Muestra la respuesta y la traza de cada turno.
 *
 *   npx tsx --env-file=.env scripts/probar-agente.ts
 */
import type { AITool, ChatMessage } from "../src/modules/ai/domain/ports/ai-provider";
import { rankProducts } from "../src/modules/ai/domain/product-search";
import { runSalesGraph } from "../src/modules/ai/infrastructure/graph/sales-graph";
import { buildBusinessContext } from "../src/modules/ai/infrastructure/system-prompt";

const catalog = [
  { id: "p1", name: "Jean clásico hombre azul talla 32", sku: "VES-JEA-HOM-32", description: "Corte recto, azul oscuro", price: 89900, stock: 8 },
  { id: "p2", name: "Jean clásico hombre azul talla 34", sku: "VES-JEA-HOM-34", description: "Corte recto, azul oscuro", price: 89900, stock: 6 },
  { id: "p3", name: "Camiseta básica negra talla M", sku: "VES-CAM-NEG-M", description: "100 % algodón, unisex", price: 25000, stock: 10 },
  { id: "p4", name: "Camiseta básica negra talla XL", sku: "VES-CAM-NEG-XL", description: "100 % algodón, unisex", price: 25000, stock: 1 },
  { id: "p5", name: "Tenis blancos unisex talla 40", sku: "CAL-TEN-BLA-40", description: "Horma normal", price: 129900, stock: 5 },
  { id: "p6", name: "Gorra negra", sku: "ACC-GOR-NEG", description: "Talla única", price: 29900, stock: 9 },
];
let orderSeq = 0;

const tools: AITool[] = [
  {
    name: "search_products",
    description: "Busca productos del catálogo por nombre, SKU o descripción. Devuelve precio y stock. Úsala siempre antes de cotizar.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: [],
      additionalProperties: false,
    },
    async execute(args) {
      const found = rankProducts(String(args.query ?? ""), catalog, 5);
      return JSON.stringify(found.map((p) => ({ id: p.id, name: p.name, priceMajor: p.price, currency: "COP", stock: p.stock })));
    },
  },
  {
    name: "get_business_info",
    description: "Información del negocio: horario, envíos, medios de pago y preguntas frecuentes.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      return JSON.stringify({ name: "Mis Cositas", note: "ver INFORMACIÓN DEL NEGOCIO" });
    },
  },
  {
    name: "create_pending_order",
    description: "Crea el pedido cuando el cliente confirma productos y cantidades. Usa los IDs de search_products. Reserva stock.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { productId: { type: "string" }, quantity: { type: "number" } },
            required: ["productId", "quantity"],
            additionalProperties: false,
          },
        },
        notes: { type: "string" },
      },
      required: ["items"],
      additionalProperties: false,
    },
    async execute(args) {
      const items = (args.items ?? []) as Array<{ productId: string; quantity: number }>;
      let total = 0;
      for (const i of items) {
        const p = catalog.find((c) => c.id === i.productId);
        if (!p) return JSON.stringify({ error: "producto_inexistente", detalle: i.productId });
        if (p.stock < i.quantity) {
          return JSON.stringify({ error: "stock_insuficiente", detalle: [{ name: p.name, pedido: i.quantity, disponible: p.stock }] });
        }
        total += p.price * i.quantity;
      }
      for (const i of items) catalog.find((c) => c.id === i.productId)!.stock -= i.quantity;
      orderSeq += 1;
      return JSON.stringify({ ok: true, orderCode: `PED-${String(orderSeq).padStart(4, "0")}`, totalMajor: total, currency: "COP" });
    },
  },
];

const businessContext = buildBusinessContext({
  businessName: "Mis Cositas",
  industry: "Ropa y calzado",
  description: "Tienda de ropa y calzado para hombre y mujer en Quinchía, Risaralda, con envíos a todo Colombia.",
  address: "Carrera 6 # 5-14, local 2, Quinchía",
  businessHours: "Lunes a sábado de 8:00 a. m. a 7:00 p. m. Domingos de 9:00 a. m. a 1:00 p. m.",
  deliveryInfo: "En Quinchía el domicilio vale $3.000. Envíos a todo Colombia por Interrapidísimo entre $12.000 y $18.000, en 2 a 4 días hábiles. Envío gratis desde $200.000.",
  paymentInfo: "Nequi, Daviplata, transferencia a Bancolombia y efectivo en el local.",
  faq: "Cambios de talla dentro de los 8 días con la etiqueta y sin usar.",
  agentName: "Sofía, asesora de la tienda",
  clientName: "Laura",
});

const turns = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Hola, ¿tienen jean de hombre talla 32?",
      "¿y cuánto vale el envío a Pereira?",
      "Listo, mándame el jean y 2 camisetas negras talla M",
      "También agrégame 3 camisetas negras XL",
      "Quiero hablar con una persona, el pedido anterior llegó con la talla equivocada",
    ];

async function main() {
  const history: ChatMessage[] = [];
  for (const text of turns) {
  history.push({ role: "user", content: text });
  console.log(`\n👤 Cliente: ${text}`);
  const r = await runSalesGraph({ businessContext, history, tools });
  for (const s of r.trace) {
    const extra = s.tool ? ` ${s.tool}(${JSON.stringify(s.args)})` : "";
    console.log(`   · ${s.node} [${s.type}]${extra}${s.detail ? ` — ${s.detail}` : ""}${s.ms ? ` (${s.ms} ms)` : ""}`);
  }
  console.log(`🤖 ${r.text}`);
  console.log(`   tokens ${r.tokensIn}/${r.tokensOut} · herramientas ${r.toolCallsUsed} · ${r.model}${r.handoff ? " · PASA A HUMANO" : ""}`);
  history.push({ role: "assistant", content: r.text });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
