import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  FlaskConical,
  Hand,
  ListChecks,
  MessageSquare,
  Receipt,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@components/ui/button";
import { EXTRA_CHAT_COP, PLANS, PLAN_TIERS, TRIAL_DAYS } from "@modules/billing/domain/plans";
import { cn } from "@lib/utils";

export const metadata: Metadata = {
  title: "Atiendo IA · Tu vendedor de WhatsApp con IA",
  description:
    "Un agente de IA que atiende a tus clientes por WhatsApp las 24 horas con tu catálogo real, toma pedidos y te pasa los clientes listos para cerrar.",
};

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("es-CO");

const BENEFITS = [
  {
    icon: MessageSquare,
    title: "Responde al instante, día y noche",
    text: "Tu agente contesta cada mensaje en segundos, también los domingos y a medianoche. Ningún cliente se queda esperando.",
  },
  {
    icon: Receipt,
    title: "Vende con tu catálogo real",
    text: "Solo ofrece lo que tienes y con tus precios. Cotiza, toma el pedido y lo deja registrado para que lo despaches.",
  },
  {
    icon: Target,
    title: "Califica y te pasa los listos",
    text: "Pregunta lo que necesitas saber, separa a los curiosos de los compradores y te avisa cuando alguien está listo para cerrar.",
  },
  {
    icon: Hand,
    title: "Una persona cuando hace falta",
    text: "Si el cliente pide hablar con alguien o el caso es delicado, el agente se detiene y le avisa a tu equipo.",
  },
  {
    icon: ListChecks,
    title: "Lo entrenas sin tocar código",
    text: "Con las habilidades del agente le explicas cómo atender, como a un empleado nuevo: trato, límites y preguntas clave.",
  },
  {
    icon: FlaskConical,
    title: "Pruébalo antes de soltarlo",
    text: "En el simulador le escribes como si fueras un cliente y ves qué responde y qué hizo, antes de atender a clientes reales.",
  },
  {
    icon: Users,
    title: "Todos tus clientes en un lugar",
    text: "Cada persona que escribe queda guardada con su historial, sus pedidos y fechas especiales como su cumpleaños.",
  },
  {
    icon: CalendarClock,
    title: "Agenda citas y visitas",
    text: "Para vehículos e inmuebles: agenda visitas en tu Google Calendar y cruza tu inventario con lo que buscan los compradores.",
  },
];

const STEPS = [
  { title: "Conecta tu WhatsApp", text: "Usamos la conexión oficial de Meta. Te acompañamos en la configuración, sin costo." },
  { title: "Carga lo que vendes", text: "Agrega tus productos o tu inventario uno por uno, o súbelos desde un Excel." },
  { title: "Prueba y enciende", text: "Ajusta las habilidades, pruébalo en el simulador y activa las respuestas automáticas." },
];

const FAQ = [
  {
    q: "¿Cobran por la implementación?",
    a: "No. Te ayudamos a conectar tu WhatsApp, cargar tu catálogo y dejar el agente listo, sin costo adicional.",
  },
  {
    q: "¿Qué cuenta como un cliente atendido?",
    a: `Cada persona distinta a la que el agente le responde en el mes, sin importar cuántos mensajes mande. Te avisamos al 70 % y al 90 % del cupo. Si lo pasas, recargas clientes adicionales desde ${cop.format(EXTRA_CHAT_COP)} cada uno o subes de plan, y ningún cliente se queda sin respuesta: los chats abiertos siguen con el agente y los nuevos pasan a tu equipo.`,
  },
  {
    q: "¿Qué pasa con el cobro de Meta por WhatsApp?",
    a: "Meta le cobra directamente a tu negocio, con la tarjeta que registres en tu cuenta. Cada número tiene 1.000 respuestas gratis al mes y después cada respuesta cuesta unos 3 pesos. Las campañas de marketing se cobran aparte, solo si las envías.",
  },
  {
    q: "¿El agente puede equivocarse con los precios?",
    a: "Solo usa los precios y productos que tú cargaste, y cada respuesta pasa por una verificación antes de enviarse. Si no sabe algo, lo dice o le pasa el chat a tu equipo.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay permanencia: pagas mes a mes, o pagas el año y te regalamos 2 meses.",
  },
];

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-wa text-wa-foreground">
              <MessageSquare className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight">Atiendo IA</span>
          </Link>
          <nav className="hidden gap-5 text-sm text-muted-foreground md:flex">
            <a href="#beneficios" className="hover:text-foreground">Beneficios</a>
            <a href="#planes" className="hover:text-foreground">Planes</a>
            <a href="#preguntas" className="hover:text-foreground">Preguntas</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="wa" size="sm">
              <Link href="/register">Probar gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,hsla(142,70%,49%,0.14),transparent_45%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:py-24 lg:grid-cols-2">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-wa/15 px-3 py-1 text-xs font-medium text-wa">
                <Sparkles className="h-3.5 w-3.5" /> Agente de ventas con IA para WhatsApp
              </span>
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Tu vendedor de WhatsApp <span className="text-wa">que nunca duerme</span>
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                Atiende a cada cliente al instante con tu catálogo real, toma los pedidos y te pasa a los que están listos
                para comprar. Tú solo cierras la venta.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="wa" size="lg">
                  <Link href="/register">
                    Prueba {TRIAL_DAYS} días gratis <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="#planes">Ver planes</a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Sin costo de implementación · Sin permanencia · Precios en pesos</p>
            </div>

            <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl">
              <div className="mb-3 flex items-center gap-2 border-b border-border pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-wa/15 text-wa">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Tu tienda</div>
                  <div className="text-xs text-wa">en línea · responde al instante</div>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <Bubble side="in">Hola, ¿tienen el café en grano de 1 kg?</Bubble>
                <Bubble side="out">
                  ¡Hola! Sí, el café en grano de 1 kg está a $160.000 y tenemos 12 disponibles. ¿Te lo envío a domicilio?
                </Bubble>
                <Bubble side="in">Sí, mándame 2 a Pereira</Bubble>
                <Bubble side="out">Listo, quedó tu pedido #0142 por $320.000. Te confirmo el envío por aquí. ☕</Bubble>
              </div>
            </div>
          </div>
        </section>

        {/* Beneficios */}
        <section id="beneficios" className="border-t border-border bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-10 max-w-2xl space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">Todo lo que hace tu agente</h2>
              <p className="text-muted-foreground">
                Para tiendas que venden por WhatsApp y para quienes intermedian vehículos e inmuebles.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-wa/15 text-wa">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mb-1 font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="mb-10 text-3xl font-semibold tracking-tight">Listo en una tarde</h2>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-border p-5">
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-wa text-sm font-semibold text-wa-foreground">
                    {i + 1}
                  </div>
                  <h3 className="mb-1 font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Planes */}
        <section id="planes" className="border-t border-border bg-muted/30 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-10 max-w-2xl space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight">Planes claros, en pesos</h2>
              <p className="text-muted-foreground">
                Todos incluyen el agente de IA, sin costo de implementación y con {TRIAL_DAYS} días de prueba. Paga el año y te
                regalamos 2 meses.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {PLAN_TIERS.map((tier) => {
                const plan = PLANS[tier];
                return (
                  <div
                    key={tier}
                    className={cn(
                      "relative flex flex-col rounded-2xl border bg-card p-6",
                      plan.highlighted ? "border-wa shadow-xl ring-1 ring-wa" : "border-border",
                    )}
                  >
                    {plan.highlighted && (
                      <span className="absolute -top-3 left-6 rounded-full bg-wa px-3 py-0.5 text-xs font-semibold text-wa-foreground">
                        El más elegido
                      </span>
                    )}
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.tagline}</p>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight">{cop.format(plan.priceCop)}</span>
                      <span className="text-sm text-muted-foreground">/mes</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      o {cop.format(plan.priceCop * 10)} al año
                    </p>
                    <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted/60 px-3 py-2">
                        <div className="font-semibold">{int.format(plan.chats)}</div>
                        <div className="text-xs text-muted-foreground">clientes al mes</div>
                      </div>
                      <div className="rounded-md bg-muted/60 px-3 py-2">
                        <div className="font-semibold">{plan.users}</div>
                        <div className="text-xs text-muted-foreground">{plan.users === 1 ? "usuario" : "usuarios"}</div>
                      </div>
                    </div>
                    <ul className="mt-5 flex-1 space-y-2 text-sm">
                      {plan.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-wa" /> {f}
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant={plan.highlighted ? "wa" : "outline"} className="mt-6">
                      <Link href="/register">Empieza gratis</Link>
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Precios en pesos colombianos. Cliente adicional por encima del cupo: desde {cop.format(EXTRA_CHAT_COP)}. El cobro de Meta
              por WhatsApp lo paga tu negocio directamente a Meta: cada número tiene 1.000 respuestas gratis al mes.
            </p>
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-4">
            <h2 className="mb-8 text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
            <div className="divide-y divide-border rounded-xl border border-border">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {f.q}
                      <span className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Cierre */}
        <section className="border-t border-border bg-gradient-to-br from-zinc-900 via-zinc-950 to-black py-16 text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Pon a vender tu WhatsApp hoy</h2>
              <p className="mt-1 text-white/60">
                {TRIAL_DAYS} días gratis. Te ayudamos a dejarlo funcionando sin costo.
              </p>
            </div>
            <Button asChild variant="wa" size="lg">
              <Link href="/register">
                Crear mi cuenta <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Atiendo IA · CRM y agente de ventas por WhatsApp
      </footer>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", side === "out" && "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2",
          side === "in" ? "rounded-tl-sm bg-muted" : "rounded-tr-sm bg-wa/15",
        )}
      >
        {children}
      </div>
    </div>
  );
}
