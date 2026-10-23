/**
 * Demo de intermediación de vehículos e inmuebles (Eje Cafetero): crea un negocio ficticio con
 * perfil BROKERAGE, sus reglas de IA, inventario con fotos, compradores calificados, una cita por
 * confirmar, un bien por aprobar y la conversación del ejemplo de la propuesta.
 *
 *   npm run db:seed:intermediacion
 *   npm run db:seed:intermediacion -- --email=tu@correo.com      → da acceso a ese usuario (debe existir o se crea con demo1234)
 *   npm run db:seed:intermediacion -- --notify=573001234567     → número que recibe los avisos al dueño
 *
 * Es idempotente: el inventario vuelve a su estado inicial y los compradores de ejemplo (y sus
 * citas y conversaciones) se recrean en cada corrida, así la demo siempre arranca igual. Solo toca
 * el negocio "intermediacion-demo". Requiere haber corrido antes `npm run db:seed` (roles y permisos).
 *
 * Todos los nombres, teléfonos y direcciones son inventados. Las fotos son de Unsplash, ilustrativas.
 */
import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { defaultRulesFor } from "../src/modules/ai/domain/default-rules";

const prisma = new PrismaClient();

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"] as const;
  }),
);
const EMAIL = args.get("email") ?? "demo@whatsappia.app";
const NOTIFY = args.get("notify")?.replace(/\D/g, "") || null;
const SLUG = "intermediacion-demo";

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80`;

const BUSINESS = {
  name: "Eje Autos & Hogar",
  industry: "Intermediación de vehículos e inmuebles",
  description:
    "Intermediamos la compra, venta y arriendo de vehículos usados e inmuebles en Manizales, Villamaría y Pereira. " +
    "Conectamos compradores y vendedores y acompañamos todo el proceso hasta el traspaso o la escritura.",
  address: "Avenida Santander, Manizales (la dirección exacta se da al confirmar la cita)",
  businessHours: "Lunes a viernes de 8:00 a. m. a 6:00 p. m. y sábados de 9:00 a. m. a 1:00 p. m. Por WhatsApp atendemos 24/7.",
  deliveryInfo:
    "Inmuebles en Manizales, Villamaría, Chinchiná y Pereira. Vehículos de cualquier ciudad del país; el traspaso lo gestionamos nosotros.",
  paymentInfo:
    "Contado, crédito de vehículo o hipotecario con bancos aliados (sujeto a estudio del banco), leasing habitacional y vehículo en parte de pago (sujeto a peritaje).",
  faq:
    "¿Cobran comisión al comprador? No, la comisión la paga el vendedor.\n" +
    "¿Hacen el traspaso? Sí, lo gestionamos con el comprador; los gastos de traspaso los paga el comprador.\n" +
    "¿Los vehículos tienen peritaje? Sí, todos tienen peritaje y el comprador puede llevar su mecánico a la prueba de manejo.\n" +
    "¿Puedo separar un inmueble? Sí, con una promesa de compraventa que firma un asesor.",
  aiAgentName: "Valentina, asesora virtual de Eje Autos & Hogar",
};

interface DemoListing {
  code: string;
  kind: "VEHICLE" | "PROPERTY";
  operation?: "SALE" | "RENT";
  status?: "AVAILABLE" | "RESERVED" | "PENDING_REVIEW";
  title: string;
  description: string;
  priceCop: number;
  city: string;
  zone?: string;
  attributes: Record<string, string>;
  photos?: string[];
  owner: { name: string; phone: string; exactAddress: string; notes: string };
}

const LISTINGS: DemoListing[] = [
  {
    code: "INV-0001",
    kind: "VEHICLE",
    title: "Mazda CX-5 Grand Touring 2021",
    description: "Camioneta de un solo dueño, mantenimientos en concesionario, llantas nuevas. Techo corredizo y cámara de reversa.",
    priceCop: 98_000_000,
    city: "Manizales",
    attributes: { Año: "2021", Kilometraje: "48.000 km", Transmisión: "Automática", Combustible: "Gasolina", Tracción: "4x2" },
    owner: { name: "Hernán Giraldo", phone: "3000000101", exactAddress: "Placa ABC-123", notes: "Comisión 3 %. Acepta hasta $94 M de contado." },
  },
  {
    code: "INV-0002",
    kind: "VEHICLE",
    title: "Renault Duster Intens 2020",
    description: "Camioneta económica, ideal para ciudad y carretera. SOAT y técnico-mecánica al día.",
    priceCop: 62_000_000,
    city: "Manizales",
    attributes: { Año: "2020", Kilometraje: "61.000 km", Transmisión: "Mecánica", Combustible: "Gasolina", Tracción: "4x2" },
    owner: { name: "Luz Marina Arango", phone: "3000000102", exactAddress: "Placa DEF-456", notes: "Comisión 3 %." },
  },
  {
    code: "INV-0003",
    kind: "VEHICLE",
    title: "Toyota RAV4 Hybrid 2021",
    description: "Híbrida, muy bajo consumo. Paquete de seguridad Toyota Safety Sense, tapicería en cuero.",
    priceCop: 135_000_000,
    city: "Pereira",
    attributes: { Año: "2021", Kilometraje: "39.000 km", Transmisión: "Automática", Combustible: "Híbrido", Tracción: "4x4" },
    photos: [photo("1617469767053-d3b523a0b982")],
    owner: { name: "Andrés Felipe Mejía", phone: "3000000103", exactAddress: "Placa GHI-789", notes: "Recibe carro de menor valor en parte de pago." },
  },
  {
    code: "INV-0004",
    kind: "VEHICLE",
    status: "RESERVED",
    title: "Ford Expedition Limited 2018",
    description: "Tres filas de sillas, 7 pasajeros. 4x4, techo panorámico.",
    priceCop: 165_000_000,
    city: "Manizales",
    attributes: { Año: "2018", Kilometraje: "85.000 km", Transmisión: "Automática", Combustible: "Gasolina", Tracción: "4x4" },
    photos: [photo("1533473359331-0135ef1b58bf")],
    owner: { name: "Gloria Patricia Ríos", phone: "3000000104", exactAddress: "Placa JKL-012", notes: "Separada con promesa hasta el viernes." },
  },
  {
    code: "INV-0005",
    kind: "VEHICLE",
    title: "Mercedes-Benz CLA 200 2019",
    description: "Sedán deportivo, siempre en garaje. Pantalla táctil, sensores de parqueo.",
    priceCop: 118_000_000,
    city: "Manizales",
    attributes: { Año: "2019", Kilometraje: "42.000 km", Transmisión: "Automática", Combustible: "Gasolina" },
    photos: [photo("1590362891991-f776e747a588")],
    owner: { name: "Santiago Ocampo", phone: "3000000105", exactAddress: "Placa MNO-345", notes: "Precio firme." },
  },
  {
    code: "INV-0006",
    kind: "VEHICLE",
    title: "Chevrolet Onix LT Turbo 2022",
    description: "Bajo kilometraje, garantía de fábrica vigente.",
    priceCop: 58_500_000,
    city: "Villamaría",
    attributes: { Año: "2022", Kilometraje: "28.000 km", Transmisión: "Mecánica", Combustible: "Gasolina" },
    owner: { name: "Paula Andrea Castaño", phone: "3000000106", exactAddress: "Placa PQR-678", notes: "Comisión 3 %." },
  },
  {
    code: "INV-0007",
    kind: "PROPERTY",
    title: "Apartamento de 3 alcobas en Palermo",
    description: "Piso 7 con vista a la ciudad, cocina abierta, balcón, conjunto con portería 24 horas, gimnasio y salón social.",
    priceCop: 480_000_000,
    city: "Manizales",
    zone: "Palermo",
    attributes: { Área: "98 m²", Habitaciones: "3", Baños: "2", Parqueadero: "1 cubierto", Estrato: "5", Administración: "$420.000" },
    photos: [photo("1560448204-e02f11c3d0e2"), photo("1493809842364-78817add7ffb")],
    owner: { name: "María Teresa Londoño", phone: "3000000107", exactAddress: "Calle 59 # 22-30, apto 701 (ficticia)", notes: "Comisión 3 %. Escrituras al día." },
  },
  {
    code: "INV-0008",
    kind: "PROPERTY",
    operation: "RENT",
    title: "Apartamento de 2 alcobas en arriendo en El Cable",
    description: "Iluminado, a dos cuadras de la Avenida Santander. Incluye cocina integral y zona de ropas.",
    priceCop: 2_300_000,
    city: "Manizales",
    zone: "El Cable",
    attributes: { Área: "64 m²", Habitaciones: "2", Baños: "2", Parqueadero: "No", Estrato: "4" },
    photos: [photo("1522708323590-d24dbb6b0267"), photo("1502672260266-1c1ef2d93688")],
    owner: { name: "Jaime Alberto Duque", phone: "3000000108", exactAddress: "Carrera 23 # 65-10, apto 302 (ficticia)", notes: "Pide fiador o póliza de arrendamiento." },
  },
  {
    code: "INV-0009",
    kind: "PROPERTY",
    title: "Casa campestre en Villamaría",
    description: "Casa de dos niveles con amplio jardín, kiosco con BBQ y vista a las montañas. A 15 minutos de Manizales.",
    priceCop: 650_000_000,
    city: "Villamaría",
    zone: "Vía a Termales",
    attributes: { Lote: "2.500 m²", Construcción: "240 m²", Habitaciones: "4", Baños: "3", Parqueadero: "3" },
    photos: [photo("1570129477492-45c003edd2be")],
    owner: { name: "Familia Botero Salazar", phone: "3000000109", exactAddress: "Km 4 vía a Termales (ficticia)", notes: "Sucesión terminada, escritura lista." },
  },
  {
    code: "INV-0010",
    kind: "PROPERTY",
    title: "Casa en condominio con piscina en Cerritos",
    description: "Casa moderna en condominio cerrado, piscina privada, zonas verdes y seguridad 24 horas.",
    priceCop: 1_450_000_000,
    city: "Pereira",
    zone: "Cerritos",
    attributes: { Área: "320 m²", Habitaciones: "5", Baños: "5", Parqueadero: "2", Piscina: "Privada" },
    photos: [photo("1600596542815-ffad4c1539a9"), photo("1580587771525-78b9dba3b914")],
    owner: { name: "Carolina Uribe", phone: "3000000110", exactAddress: "Condominio Los Robles, casa 12 (ficticia)", notes: "Comisión 2,5 %." },
  },
  {
    code: "INV-0011",
    kind: "PROPERTY",
    title: "Apartamento de 2 alcobas en San Jorge",
    description: "Ideal para primera vivienda o inversión. Conjunto con parque infantil.",
    priceCop: 230_000_000,
    city: "Manizales",
    zone: "San Jorge",
    attributes: { Área: "58 m²", Habitaciones: "2", Baños: "1", Parqueadero: "Comunal", Estrato: "3" },
    owner: { name: "Óscar Iván Cardona", phone: "3000000111", exactAddress: "Conjunto San Jorge Real, torre 3 (ficticia)", notes: "Acepta leasing habitacional." },
  },
  {
    code: "INV-0012",
    kind: "PROPERTY",
    operation: "RENT",
    title: "Local comercial en el Centro",
    description: "Local a nivel de calle, alto flujo peatonal, baño y mezzanine.",
    priceCop: 3_800_000,
    city: "Manizales",
    zone: "Centro",
    attributes: { Área: "45 m²", Mezzanine: "Sí", Baños: "1" },
    owner: { name: "Inversiones Ficticias S.A.S.", phone: "3000000112", exactAddress: "Carrera 22 # 20-15 (ficticia)", notes: "Contrato mínimo de un año." },
  },
  {
    code: "INV-0013",
    kind: "VEHICLE",
    status: "PENDING_REVIEW",
    title: "Chevrolet Tracker LTZ 2021",
    description: "Lo trajo un vendedor por WhatsApp. Dice que tiene todos los mantenimientos al día y un solo dueño.",
    priceCop: 82_000_000,
    city: "Manizales",
    attributes: { Año: "2021", Kilometraje: "35.000 km", Transmisión: "Automática" },
    owner: { name: "Jorge Salazar", phone: "573000000203", exactAddress: "", notes: "Recibido por WhatsApp. Revisar fotos, papeles y precio antes de publicar." },
  },
];

interface DemoBuyer {
  phone: string;
  name: string;
  city: string;
  lead: {
    leadType: "BUYER" | "SELLER";
    temperature: "HOT" | "WARM" | "COLD" | null;
    stage: "NEW" | "CONTACTED" | "INTERESTED" | "READY_TO_BUY";
    listingCode?: string;
    qualification?: Record<string, string>;
    aiSummary?: string;
    offerCop?: number;
    /** Lo que busca, para las coincidencias con el inventario nuevo. */
    search?: { kind?: "VEHICLE" | "PROPERTY"; operation?: "SALE" | "RENT"; budgetMax?: number; city?: string };
  };
}

const BUYERS: DemoBuyer[] = [
  {
    phone: "573000000201",
    name: "Carlos Restrepo",
    city: "Manizales",
    lead: {
      leadType: "BUYER",
      temperature: "HOT",
      stage: "READY_TO_BUY",
      listingCode: "INV-0001",
      qualification: { busca: "Camioneta para la familia", formaPago: "Crédito", presupuesto: "$30.000.000 de cuota inicial", plazo: "Este mes" },
      aiSummary: "Carlos quiere la Mazda CX-5 2021 con crédito y $30 M de inicial. Pidió verla el jueves en la mañana.",
      search: { kind: "VEHICLE", operation: "SALE", budgetMax: 100_000_000, city: "Manizales" },
    },
  },
  {
    phone: "573000000202",
    name: "Diana Ospina",
    city: "Manizales",
    lead: {
      leadType: "BUYER",
      temperature: "WARM",
      stage: "INTERESTED",
      listingCode: "INV-0007",
      qualification: { busca: "Apartamento de 3 alcobas en Palermo o Chipre", formaPago: "Leasing habitacional", plazo: "En unos 3 meses" },
      aiSummary: "Diana busca apartamento de 3 alcobas; está esperando la aprobación del leasing.",
      search: { kind: "PROPERTY", operation: "SALE", budgetMax: 500_000_000, city: "Manizales" },
    },
  },
  {
    phone: "573000000203",
    name: "Jorge Salazar",
    city: "Manizales",
    lead: {
      leadType: "SELLER",
      temperature: null,
      stage: "INTERESTED",
      listingCode: "INV-0013",
      aiSummary: "Quiere vender su Chevrolet Tracker 2021; espera $82 M. Falta revisar fotos y papeles.",
    },
  },
  {
    phone: "573000000204",
    name: "Andrea Cifuentes",
    city: "Pereira",
    lead: {
      leadType: "BUYER",
      temperature: "COLD",
      stage: "CONTACTED",
      qualification: { busca: "Carro pequeño", presupuesto: "Hasta $35.000.000", plazo: "No tiene afán" },
      aiSummary: "Está mirando opciones; el presupuesto no alcanza para lo que hay en inventario.",
      search: { kind: "VEHICLE", operation: "SALE", budgetMax: 35_000_000, city: "Pereira" },
    },
  },
  {
    phone: "573000000205",
    name: "Felipe Montoya",
    city: "Pereira",
    lead: {
      leadType: "BUYER",
      temperature: "HOT",
      stage: "READY_TO_BUY",
      listingCode: "INV-0003",
      qualification: { busca: "Camioneta híbrida", formaPago: "Contado más carro en parte de pago", partePago: "Mazda 3 2017, 70.000 km" },
      aiSummary: "Ofreció $125 M por la RAV4 dejando su Mazda 3 2017.",
      offerCop: 125_000_000,
      search: { kind: "VEHICLE", operation: "SALE", budgetMax: 130_000_000, city: "Pereira" },
    },
  },
  {
    phone: "573000000206",
    name: "Mateo Ramírez",
    city: "Manizales",
    lead: {
      leadType: "BUYER",
      temperature: "WARM",
      stage: "INTERESTED",
      qualification: { busca: "Camioneta automática", formaPago: "Contado", presupuesto: "Hasta 90 millones" },
      aiSummary: "Busca camioneta automática de contado; nada de lo que hay le convenció. Avisarle si entra algo.",
      search: { kind: "VEHICLE", operation: "SALE", budgetMax: 90_000_000, city: "Manizales" },
    },
  },
];

/** La conversación del ejemplo de la propuesta, para que el panel no arranque vacío. */
const EXAMPLE_CHAT: Array<{ from: "CLIENT" | "AI"; text: string; minutesAgo: number }> = [
  { from: "CLIENT", text: "Buenas, ¿sigue disponible la camioneta que publicaron?", minutesAgo: 62 },
  { from: "AI", text: "¡Hola! Sí, tenemos estas camionetas disponibles:\n1. Mazda CX-5 Grand Touring 2021, 48.000 km, $98.000.000\n2. Renault Duster Intens 2020, 61.000 km, $62.000.000\n¿Cuál le interesa?", minutesAgo: 61 },
  { from: "CLIENT", text: "La Mazda. ¿Se puede financiar?", minutesAgo: 58 },
  { from: "AI", text: "Sí, se puede con crédito de vehículo con bancos aliados, sujeto a estudio del banco. Para orientarlo mejor: ¿la compra sería de contado, con crédito o dejando un vehículo en parte de pago?", minutesAgo: 57 },
  { from: "CLIENT", text: "Crédito, tengo 30 millones de cuota inicial.", minutesAgo: 55 },
  { from: "AI", text: "Perfecto, con $30.000.000 de cuota inicial podemos avanzar. ¿Le gustaría verla y hacer la prueba de manejo? Hay disponibilidad el martes o el jueves en la mañana.", minutesAgo: 54 },
  { from: "CLIENT", text: "El jueves.", minutesAgo: 50 },
  { from: "AI", text: "Listo, dejé la solicitud para el jueves en la mañana. Un asesor le confirma la hora y el lugar. ¿Me regala su nombre?", minutesAgo: 49 },
  { from: "CLIENT", text: "Carlos Restrepo", minutesAgo: 47 },
  { from: "AI", text: "Gracias, Carlos. Ya quedó todo anotado; en breve un asesor le escribe para confirmar. 🚗", minutesAgo: 46 },
];

async function main() {
  // 1. Negocio
  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: { ...BUSINESS, agentProfile: "BROKERAGE", aiAutoReply: true, ...(NOTIFY ? { ownerNotifyPhone: NOTIFY } : {}) },
    create: { slug: SLUG, ...BUSINESS, agentProfile: "BROKERAGE", aiAutoReply: true, ownerNotifyPhone: NOTIFY },
  });
  console.log(`→ Negocio: ${tenant.name} (${tenant.slug})`);

  // 2. Acceso para el usuario
  const user =
    (await prisma.user.findUnique({ where: { email: EMAIL } })) ??
    (await prisma.user.create({ data: { email: EMAIL, name: "Demo Intermediación", passwordHash: await bcrypt.hash("demo1234", 10) } }));
  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { status: "ACTIVE" },
    create: { userId: user.id, tenantId: tenant.id, status: "ACTIVE" },
  });
  const ownerRole = await prisma.role.findFirst({ where: { key: "owner", isSystem: true, tenantId: null } });
  if (ownerRole) {
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id } },
      update: {},
      create: { membershipId: membership.id, roleId: ownerRole.id },
    });
  } else {
    console.warn("⚠ No existe el rol owner: corre primero `npm run db:seed`.");
  }
  console.log(`→ Acceso: ${EMAIL}`);

  // 3. Reglas de la IA (las por defecto de intermediación; las que agregue el negocio no se tocan)
  const rules = defaultRulesFor("BROKERAGE");
  for (const [position, rule] of rules.entries()) {
    await prisma.aiRule.upsert({
      where: { tenantId_systemKey: { tenantId: tenant.id, systemKey: rule.systemKey } },
      update: { category: rule.category, title: rule.title, content: rule.content, isActive: true, position },
      create: { tenantId: tenant.id, ...rule, position },
    });
  }
  await prisma.tenant.update({ where: { id: tenant.id }, data: { aiRulesSeededAt: new Date() } });
  console.log(`→ ${rules.length} reglas de la IA`);

  // 4. Inventario (vuelve a su estado inicial en cada corrida)
  const listingIds = new Map<string, string>();
  for (const l of LISTINGS) {
    const data = {
      kind: l.kind,
      operation: l.operation ?? "SALE",
      status: l.status ?? "AVAILABLE",
      title: l.title,
      description: l.description,
      priceCop: BigInt(l.priceCop),
      city: l.city,
      zone: l.zone ?? null,
      attributes: l.attributes,
      photos: l.photos ?? [],
      ownerName: l.owner.name,
      ownerPhone: l.owner.phone,
      exactAddress: l.owner.exactAddress || null,
      privateNotes: l.owner.notes,
    } as const;
    const saved = await prisma.listing.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: l.code } },
      update: data,
      create: { ...data, tenantId: tenant.id, code: l.code },
    });
    listingIds.set(l.code, saved.id);
  }
  // El consecutivo sigue después del último código de la demo
  const maxSeq = Math.max(...LISTINGS.map((l) => Number(l.code.slice(4))));
  await prisma.tenant.update({ where: { id: tenant.id }, data: { listingSeq: { set: Math.max(maxSeq, tenant.listingSeq) } } });
  // Los bienes que dejó un vendedor en una corrida anterior de la demo se archivan
  const demoCodes = LISTINGS.map((l) => l.code);
  await prisma.listing.updateMany({
    where: { tenantId: tenant.id, code: { notIn: demoCodes }, status: "PENDING_REVIEW" },
    data: { status: "ARCHIVED" },
  });
  console.log(`→ ${LISTINGS.length} bienes en el inventario`);

  // 5. Compradores y vendedores de ejemplo (se recrean con sus citas y conversaciones)
  for (const b of BUYERS) {
    const client = await prisma.client.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone: b.phone } },
      update: { name: b.name, city: b.city },
      create: { tenantId: tenant.id, phone: b.phone, name: b.name, city: b.city, source: "demo" },
    });
    await prisma.appointment.deleteMany({ where: { tenantId: tenant.id, clientId: client.id } });
    await prisma.lead.deleteMany({ where: { tenantId: tenant.id, clientId: client.id } });
    await prisma.conversation.deleteMany({ where: { tenantId: tenant.id, clientId: client.id } });

    const listingId = b.lead.listingCode ? listingIds.get(b.lead.listingCode) ?? null : null;
    const listing = b.lead.listingCode ? LISTINGS.find((l) => l.code === b.lead.listingCode) : undefined;
    const lead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        contactName: b.name,
        phone: b.phone,
        leadType: b.lead.leadType,
        temperature: b.lead.temperature,
        stage: b.lead.stage,
        source: "WHATSAPP",
        listingId,
        productInterest: listing ? (b.lead.leadType === "SELLER" ? `Vende: ${listing.title}` : listing.title) : b.lead.qualification?.busca ?? null,
        qualification: b.lead.qualification ?? Prisma.JsonNull,
        aiSummary: b.lead.aiSummary ?? null,
        offerCop: b.lead.offerCop ? BigInt(b.lead.offerCop) : null,
        searchKind: b.lead.search?.kind ?? null,
        searchOperation: b.lead.search?.operation ?? null,
        budgetMaxCop: b.lead.search?.budgetMax ? BigInt(b.lead.search.budgetMax) : null,
        searchCity: b.lead.search?.city ?? null,
        lastContactAt: new Date(Date.now() - 45 * 60_000),
      },
    });

    if (b.name === "Carlos Restrepo") {
      await prisma.appointment.create({
        data: { tenantId: tenant.id, clientId: client.id, leadId: lead.id, listingId, requestedSlot: "jueves en la mañana", notes: "Prueba de manejo. Va con crédito." },
      });
      const conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          waChatId: `${b.phone}@s.whatsapp.net`,
          status: "OPEN",
          lastMessageAt: new Date(Date.now() - 46 * 60_000),
        },
      });
      await prisma.message.createMany({
        data: EXAMPLE_CHAT.map((m) => ({
          conversationId: conversation.id,
          direction: m.from === "CLIENT" ? ("INBOUND" as const) : ("OUTBOUND" as const),
          authoredBy: m.from,
          content: m.text,
          sentAt: new Date(Date.now() - m.minutesAgo * 60_000),
        })),
      });
    }
  }
  console.log(`→ ${BUYERS.length} compradores y vendedores, 1 cita por confirmar y la conversación de ejemplo`);

  console.log("✔ Listo. Entra al panel, elige “Eje Autos & Hogar” arriba a la izquierda y prueba por WhatsApp:");
  console.log('   "¿sigue disponible la camioneta?", "¿tienen apartamentos en Manizales?", "quiero vender mi carro", "le ofrezco 90 millones por la Mazda".');
  console.log("   Coincidencias: en Inventario → Por aprobar, aprueba la Chevrolet Tracker y revisa Coincidencias (Carlos y Mateo la buscan).");
  if (!NOTIFY) console.log("   Para recibir los avisos al dueño: npm run db:seed:intermediacion -- --notify=57TU_NUMERO");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
