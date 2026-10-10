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
  { id: "p1", name: "Arroz Diana 500 g", sku: "ARR-500", description: null, price: 2400, stock: 40 },
  { id: "p2", name: "Arroz Roa 1 kg", sku: "ARR-1K", description: "Arroz blanco", price: 4600, stock: 25 },
  { id: "p3", name: "Jabón Rey en barra", sku: "JAB-REY", description: "Jabón azul para ropa", price: 2100, stock: 3 },
  { id: "p4", name: "Panela redonda x 2", sku: null, description: null, price: 3800, stock: 18 },
  { id: "p5", name: "Aceite Premier 1 L", sku: "ACE-1L", description: null, price: 11900, stock: 9 },
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
      return JSON.stringify({ name: "Distribuidora La Esperanza", note: "ver INFORMACIÓN DEL NEGOCIO" });
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
  businessName: "Distribuidora La Esperanza",
  industry: "víveres y aseo",
  description: "Distribuidora de víveres y aseo en Quinchía, Risaralda. Vendemos a tiendas y al detal.",
  address: "Calle 5 # 4-20, Quinchía",
  businessHours: "Lunes a sábado de 7:00 a. m. a 6:00 p. m. Domingos y festivos cerrado.",
  deliveryInfo: "Domicilio gratis en el casco urbano en compras desde $50.000. A veredas cuesta $5.000. Entregamos el mismo día si pides antes de las 2 p. m.",
  paymentInfo: "Efectivo contra entrega, Nequi y Daviplata.",
  faq: "Cambios: dentro de los 3 días con la factura.",
  agentName: "Sofía, asesora de La Esperanza",
  clientName: "Don Mario",
});

const turns = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Buenas, ¿tienen arroz de 500g?",
      "¿y el domicilio a la vereda cuánto vale?",
      "Listo, mándame 10 arroces Diana y 2 jabones rey",
      "Necesito hablar con el dueño, el último pedido llegó incompleto",
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
