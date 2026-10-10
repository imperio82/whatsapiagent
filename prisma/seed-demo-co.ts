/**
 * Datos de prueba para Colombia: una tienda de ropa y calzado con catálogo en COP
 * (cada talla y color es un producto con su propio stock), información del negocio
 * para la IA y algunos clientes.
 *
 *   npm run db:seed:demo                     → negocio "mis-cositas"
 *   npm run db:seed:demo -- --tenant=demo    → otro negocio por su slug
 *   npm run db:seed:demo -- --force          → también sobrescribe la información del negocio
 *
 * Es idempotente: se puede correr varias veces. Los productos se identifican por SKU y en cada
 * corrida vuelven a su precio y stock inicial (útil para repetir una demo). No borra nada.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"] as const;
  }),
);
const TENANT_SLUG = args.get("tenant") ?? "mis-cositas";
const FORCE = args.get("force") === "true";

interface DemoProduct {
  sku: string;
  name: string;
  price: number; // pesos (se guardan en centavos)
  stock: number;
  description?: string;
}

/** Una referencia con varias tallas: un producto por talla, con su stock. */
function sizes(
  skuBase: string,
  name: string,
  price: number,
  description: string,
  stockBySize: Record<string, number>,
): DemoProduct[] {
  return Object.entries(stockBySize).map(([size, stock]) => ({
    sku: `${skuBase}-${size}`,
    name: `${name} talla ${size}`,
    price,
    stock,
    description,
  }));
}

const PRODUCTS: DemoProduct[] = [
  ...sizes("VES-CAM-BLA", "Camiseta básica blanca", 25000, "Camiseta 100 % algodón, cuello redondo, unisex", { S: 8, M: 12, L: 10, XL: 2 }),
  ...sizes("VES-CAM-NEG", "Camiseta básica negra", 25000, "Camiseta 100 % algodón, cuello redondo, unisex", { S: 6, M: 10, L: 7, XL: 1 }),
  ...sizes("VES-JEA-HOM", "Jean clásico hombre azul", 89900, "Jean de corte recto, azul oscuro, talla por cintura", { "30": 5, "32": 8, "34": 6, "36": 3 }),
  ...sizes("VES-JEA-MUJ", "Jean skinny mujer azul claro", 94900, "Jean tiro alto, elástico, azul claro", { "6": 4, "8": 7, "10": 6, "12": 2 }),
  ...sizes("VES-BLU-EST", "Blusa estampada manga corta", 45900, "Blusa fresca con estampado floral", { S: 5, M: 6, L: 4 }),
  ...sizes("VES-BUZ-GRI", "Buzo con capota gris", 79900, "Buzo perchado con capota y bolsillo canguro, unisex", { S: 3, M: 5, L: 5, XL: 2 }),
  ...sizes("VES-VES-FLO", "Vestido casual floral", 99900, "Vestido a la rodilla, tela fresca, estampado floral", { S: 3, M: 4, L: 2 }),
  ...sizes("CAL-TEN-BLA", "Tenis blancos unisex", 129900, "Tenis casuales blancos, horma normal", { "37": 2, "38": 4, "39": 5, "40": 5, "41": 3, "42": 1 }),
  { sku: "ACC-MED-X3", name: "Medias tobilleras x 3 pares", price: 15000, stock: 20, description: "Talla única, colores surtidos" },
  { sku: "ACC-GOR-NEG", name: "Gorra negra", price: 29900, stock: 9, description: "Gorra ajustable, talla única" },
];

const BUSINESS = {
  industry: "Ropa y calzado",
  description:
    "Tienda de ropa y calzado para hombre y mujer en Quinchía, Risaralda. Vendemos en el local y por WhatsApp, " +
    "con envíos a todo Colombia.",
  address: "Carrera 6 # 5-14, local 2, Quinchía, Risaralda",
  businessHours: "Lunes a sábado de 8:00 a. m. a 7:00 p. m. Domingos de 9:00 a. m. a 1:00 p. m.",
  deliveryInfo:
    "En Quinchía el domicilio vale $3.000 y llega el mismo día si pides antes de las 4:00 p. m. " +
    "Envíos a todo Colombia por Interrapidísimo: entre $12.000 y $18.000 según la ciudad, llegan en 2 a 4 días hábiles. " +
    "Envío gratis en compras desde $200.000.",
  paymentInfo:
    "Nequi, Daviplata, transferencia a Bancolombia y efectivo en el local. Pago contra entrega solo en Quinchía.",
  faq:
    "¿Hacen cambios? Sí, cambio de talla o de referencia dentro de los 8 días, con la etiqueta y sin usar. No se devuelve dinero, salvo por defecto de fábrica.\n" +
    "¿Cómo sé mi talla de jean? Es la medida de la cintura en pulgadas (hombre) o la talla colombiana (mujer: 6, 8, 10, 12).\n" +
    "¿Los tenis son de horma normal? Sí, pide tu talla de siempre.\n" +
    "¿Puedo apartar? Sí, con el 30 % del valor y hasta por 8 días.",
  aiAgentName: "Sofía, asesora de la tienda",
};

const CLIENTS = [
  { phone: "573001234501", name: "Laura Gómez", address: "Barrio El Centro, Quinchía" },
  { phone: "573001234502", name: "Andrés Ríos", address: "Pereira, Risaralda" },
  { phone: "573001234503", name: "Marta Cardona", address: "Vereda Naranjal, Quinchía" },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    const all = await prisma.tenant.findMany({ select: { slug: true } });
    throw new Error(`No existe el negocio "${TENANT_SLUG}". Disponibles: ${all.map((t) => t.slug).join(", ")}`);
  }
  console.log(`→ Negocio: ${tenant.name} (${tenant.slug})`);

  // Información del negocio: solo llena lo vacío, salvo con --force
  const context: Record<string, string> = {};
  for (const [key, value] of Object.entries(BUSINESS)) {
    const current = (tenant as Record<string, unknown>)[key];
    if (FORCE || current === null || current === "") context[key] = value;
  }
  await prisma.tenant.update({ where: { id: tenant.id }, data: { ...context, aiAutoReply: true } });
  console.log(`→ Información del negocio: ${Object.keys(context).join(", ") || "sin cambios (usa --force)"}`);

  for (const p of PRODUCTS) {
    const data = {
      name: p.name,
      description: p.description ?? null,
      priceCents: p.price * 100,
      currency: "COP",
      stock: p.stock,
      trackInventory: true,
      status: "ACTIVE" as const,
    };
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: data,
      create: { ...data, sku: p.sku, tenantId: tenant.id },
    });
  }
  console.log(`→ ${PRODUCTS.length} productos (cada talla con su stock)`);

  for (const c of CLIENTS) {
    await prisma.client.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: c.phone } },
      update: {},
      create: { ...c, tenantId: tenant.id, source: "demo" },
    });
  }
  console.log(`→ ${CLIENTS.length} clientes de ejemplo`);
  console.log(
    '✔ Listo. Prueba por WhatsApp: "¿tienen jean de hombre talla 32?", "¿cuánto vale el envío a Pereira?", "mándame 2 camisetas negras M".',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
