/**
 * Ensayo de la demo de intermediación por el mismo camino que un mensaje real
 * (RespondToMessageUseCase → reglas de la base de datos → grafo → verificador), pero con un
 * WhatsApp falso que imprime lo que enviaría. Usa el negocio "intermediacion-demo"
 * (npm run db:seed:intermediacion) y clientes de prueba que se borran al empezar.
 *
 *   npx tsx --env-file=.env scripts/probar-intermediacion.ts            → todos los guiones
 *   npx tsx --env-file=.env scripts/probar-intermediacion.ts vendedor   → solo uno
 *   … --pausa=0                                                          → sin espera entre mensajes
 *
 * Entre mensajes espera 15 s por defecto: el plan gratis de Gemini permite 15 consultas por minuto
 * y cada mensaje hace de 3 a 5 (router, especialista con herramientas y reintentos).
 *
 * Consume la API de IA configurada (AI_PROVIDER). No envía nada por WhatsApp.
 */
(process.env as Record<string, string>).NODE_ENV = "test"; // sin el log de consultas de Prisma

const SCRIPTS: Record<string, { phone: string; name: string; turns: string[] }> = {
  comprador: {
    phone: "573009990001",
    name: "Cliente 0001",
    turns: [
      "Buenas, ¿sigue disponible la camioneta que publicaron?",
      "La Mazda. ¿Se puede financiar?",
      "Crédito, tengo 30 millones de cuota inicial",
      "¿Me pasa el número del dueño para hablar directo con él?",
      "Ok. ¿Y tiene fotos de la Toyota?",
      "Listo, quiero ir a ver la Mazda el jueves en la mañana",
      "Me llamo Carlos Pérez",
      "¿Me la deja en 90 millones de contado?",
      "¿Hola?",
    ],
  },
  vendedor: {
    phone: "573009990002",
    name: "Cliente 0002",
    turns: [
      "Hola, quiero vender mi carro con ustedes",
      "Es una Kia Sportage 2019 con 70 mil km, automática, está en Manizales en La Enea",
      "Espero unos 75 millones. Me llamo Sandra Gómez",
    ],
  },
  arriendo: {
    phone: "573009990003",
    name: "Cliente 0003",
    turns: ["Buenas noches, ¿tienen apartamentos en arriendo en Manizales?", "Mándeme fotos por favor", "¿Cuánto vale la administración y si piden fiador?"],
  },
};

async function main() {
  const { prisma } = await import("../src/shared/infrastructure/prisma/client");
  const { RespondToMessageUseCase } = await import("../src/modules/ai/application/respond-to-message.use-case");
  const { getAIProvider } = await import("../src/modules/ai/infrastructure/provider-factory");
  type WhatsAppProvider = import("../src/modules/whatsapp/domain/ports/whatsapp-provider").WhatsAppProvider;

  const tenant = await prisma.tenant.findUnique({ where: { slug: "intermediacion-demo" } });
  if (!tenant) throw new Error("Falta el negocio de demo: npm run db:seed:intermediacion");

  // Para ver los avisos al dueño hace falta un número; si no hay, se usa uno falso solo durante el ensayo
  const FAKE_OWNER = "570000000000";
  const ownerPhone = tenant.ownerNotifyPhone ?? FAKE_OWNER;
  if (!tenant.ownerNotifyPhone) await prisma.tenant.update({ where: { id: tenant.id }, data: { ownerNotifyPhone: FAKE_OWNER } });

  const fakeWhatsApp: WhatsAppProvider = {
    kind: "meta",
    async start() {},
    async stop() {},
    getState: () => ({ kind: "connected", phoneNumber: "demo", connectedAt: new Date() }),
    onInbound() {},
    async sendText(_tenantId, { to, text }) {
      if (to === ownerPhone) console.log(`\n   📲 AVISO AL DUEÑO: ${text}`);
      else console.log(`\n🤖 ${text.replace(/\n/g, "\n   ")}`);
      return { providerMessageId: `fake-${Date.now()}-${Math.random()}`, sentAt: new Date() };
    },
  };

  // Solo se muestra la traza del grafo, no el resto de logs
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const first = String(args[0] ?? "");
    if (first.startsWith("[ai graph]")) log(`   · ${first.slice(11)}`);
    else if (!first.startsWith("[ai respond]")) log(...args);
  };

  const respond = new RespondToMessageUseCase(getAIProvider(), fakeWhatsApp);
  const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const pauseArg = process.argv.find((a) => a.startsWith("--pausa="));
  const pauseMs = (pauseArg ? Number(pauseArg.split("=")[1]) : 15) * 1000;
  let first = true;

  try {
    for (const [name, script] of Object.entries(SCRIPTS)) {
      if (only && only !== name) continue;
      log(`\n════════ ${name.toUpperCase()} ════════`);

      // Cliente de prueba limpio en cada ensayo
      const old = await prisma.client.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone: script.phone } } });
      if (old) {
        await prisma.appointment.deleteMany({ where: { clientId: old.id } });
        await prisma.lead.deleteMany({ where: { clientId: old.id } });
        await prisma.conversation.deleteMany({ where: { clientId: old.id } });
        await prisma.listing.deleteMany({ where: { tenantId: tenant.id, ownerPhone: script.phone } });
        await prisma.client.delete({ where: { id: old.id } });
      }
      const client = await prisma.client.create({
        data: { tenantId: tenant.id, phone: script.phone, name: script.name, source: "ensayo" },
      });
      const conversation = await prisma.conversation.create({
        data: { tenantId: tenant.id, clientId: client.id, waChatId: `${script.phone}@s.whatsapp.net` },
      });

      for (const text of script.turns) {
        if (!first && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
        first = false;
        log(`\n👤 ${text}`);
        await prisma.message.create({
          data: { conversationId: conversation.id, direction: "INBOUND", authoredBy: "CLIENT", content: text },
        });
        const before = await prisma.message.count({ where: { conversationId: conversation.id } });
        await respond.execute({ tenantId: tenant.id, conversationId: conversation.id });
        const after = await prisma.message.count({ where: { conversationId: conversation.id } });
        if (after === before) {
          const conv = await prisma.conversation.findUnique({ where: { id: conversation.id } });
          log(`\n   (la IA no responde: ${conv?.aiPausedUntil ? "la conversación la tiene un asesor" : "sin respuesta"})`);
        }
      }

      const leads = await prisma.lead.findMany({ where: { clientId: client.id }, include: { listing: { select: { title: true } } } });
      const appointments = await prisma.appointment.findMany({ where: { clientId: client.id } });
      const listings = await prisma.listing.findMany({ where: { tenantId: tenant.id, ownerPhone: script.phone } });
      const finalClient = await prisma.client.findUnique({ where: { id: client.id } });
      log("\n── Resultado en el CRM ──");
      log(`Cliente: ${finalClient?.name}`);
      for (const l of leads) {
        log(
          `Lead ${l.leadType} · ${l.stage} · ${l.temperature ?? "sin clasificar"}${l.listing ? ` · ${l.listing.title}` : ""}${l.offerCop ? ` · oferta $${Number(l.offerCop).toLocaleString("es-CO")}` : ""}`,
        );
        if (l.qualification) log(`   calificación: ${JSON.stringify(l.qualification)}`);
      }
      for (const a of appointments) log(`Cita ${a.status}: ${a.requestedSlot}`);
      for (const l of listings) log(`Bien ${l.code} ${l.status}: ${l.title} · $${Number(l.priceCop).toLocaleString("es-CO")} · ${JSON.stringify(l.attributes)}`);
    }
  } finally {
    console.log = log;
    if (!tenant.ownerNotifyPhone) await prisma.tenant.update({ where: { id: tenant.id }, data: { ownerNotifyPhone: null } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
