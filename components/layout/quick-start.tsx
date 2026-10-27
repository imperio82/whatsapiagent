"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Boxes, Car, ListChecks, MessageSquare, Rocket, Users, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card } from "@components/ui/card";
import { useCurrentTenant } from "@hooks/use-tenant";
import { cn } from "@lib/utils";

/** Si ya vio la guía en este navegador; la primera vez se abre sola. */
const SEEN_KEY = "quick-start-seen";
const STEP_KEY = "quick-start-step";

interface Step {
  /** Página que se muestra y opción del menú que se resalta; sin ella es la bienvenida o el cierre. */
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
  points?: { title: string; text: string }[];
}

const stepsFor = (brokerage: boolean): Step[] => [
  {
    icon: Rocket,
    title: "Bienvenido 👋",
    body: "En 4 pasos te mostramos dónde está lo importante: dónde llegan los mensajes, dónde cargas lo que vendes, dónde ves a tus clientes y cómo le enseñas a tu agente a atenderlos.",
  },
  {
    href: "/chats",
    icon: MessageSquare,
    title: "1. Aquí llegan los mensajes",
    body: "En Conversaciones ves cada chat de WhatsApp y lo que respondió el agente. Puedes entrar a cualquiera y escribir tú.",
    points: [
      {
        title: "Cuando piden una persona",
        text: "La conversación se marca en rojo y la campana de arriba muestra cuántos esperan. Mientras la atiende una persona, el agente no responde.",
      },
    ],
  },
  brokerage
    ? {
        href: "/inventario",
        icon: Car,
        title: "2. Aquí agregas el inventario",
        body: "Con «Agregar bien» cargas vehículos e inmuebles uno por uno, o con «Importar» subes un Excel. El agente solo ofrece y da precios de lo que esté aquí. Después lo encuentras en Colecciones → Inventario, en el ícono de configuración.",
        points: [
          {
            title: "Datos del propietario",
            text: "Nombre, teléfono y dirección exacta del dueño se guardan, pero nunca se le envían al cliente.",
          },
        ],
      }
    : {
        href: "/productos",
        icon: Boxes,
        title: "2. Aquí agregas tus productos",
        body: "Con «Nuevo producto» cargas tu catálogo uno por uno, o con «Importar» subes un Excel. El agente solo ofrece y da precios de lo que esté aquí. Después lo encuentras en Colecciones → Productos, en el ícono de configuración.",
      },
  {
    href: "/clientes",
    icon: Users,
    title: "3. Aquí ves a tus clientes",
    body: "Cada persona que escribe por WhatsApp queda guardada como cliente. Abre uno para ver sus datos, sus conversaciones y fechas especiales como su cumpleaños.",
    points: [
      {
        title: brokerage ? "Compradores" : "Leads",
        text: brokerage
          ? "En Compradores ves a los interesados que el agente ya calificó, listos para seguimiento."
          : "En Leads ves a los interesados que el agente detectó, listos para seguimiento.",
      },
    ],
  },
  {
    href: "/configuracion/ia/habilidades",
    icon: ListChecks,
    title: "4. Aquí agregas las habilidades del agente",
    body: "Las habilidades le enseñan a tu agente cómo atender, como se lo explicarías a un empleado nuevo. Ya trae unas por defecto; puedes editarlas, apagarlas o crear las tuyas, sin tocar código. Hay cuatro tipos:",
    points: [
      { title: "Trato y estilo", text: "Cómo le habla al cliente: tú o usted, formalidad, emojis." },
      { title: "Lo que puede y no puede hacer", text: "Límites claros, por ejemplo no prometer descuentos ni dar datos privados." },
      { title: "Preguntas para calificar", text: "Lo que pregunta, en orden, para saber si el cliente va en serio." },
      { title: "Cuándo pasar a una persona", text: "En qué casos deja de responder y te avisa." },
    ],
  },
  {
    icon: Rocket,
    title: "¡Listo!",
    body: "Ya sabes dónde está todo. Antes de atender clientes reales, pruébalo en Administración → Simulador del agente: le escribes como si fueras un cliente y ves cómo responde. Puedes volver a abrir esta guía cuando quieras con el botón «Guía» de la barra de arriba.",
  },
];

let open = false;
let step = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openQuickStart(): void {
  setStep(0);
}

/** El paso en curso se guarda en la pestaña para que la guía siga donde iba si la página se recarga. */
function setStep(next: number): void {
  open = true;
  step = next;
  try {
    sessionStorage.setItem(STEP_KEY, String(next));
  } catch {
    // Sin almacenamiento: al recargar la guía empieza de nuevo
  }
  emit();
}

function closeQuickStart(): void {
  open = false;
  try {
    localStorage.setItem(SEEN_KEY, "1");
    sessionStorage.removeItem(STEP_KEY);
  } catch {
    // Sin almacenamiento: volverá a abrirse la próxima vez
  }
  emit();
}

function useQuickStartState(): { open: boolean; step: number } {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => false);
  const current = useSyncExternalStore(subscribe, () => step, () => 0);
  return { open: isOpen, step: current };
}

/** Página que la guía está mostrando ahora; el menú lateral la resalta. */
export function useQuickStartHref(): string | undefined {
  const { data: tenant } = useCurrentTenant();
  const state = useQuickStartState();
  if (!state.open) return undefined;
  return stepsFor(tenant?.agentProfile === "BROKERAGE")[state.step]?.href;
}

export function QuickStart(): React.ReactElement | null {
  const { data: tenant } = useCurrentTenant();
  const { open: isOpen, step: current } = useQuickStartState();
  const router = useRouter();
  const pathname = usePathname();
  const steps = stepsFor(tenant?.agentProfile === "BROKERAGE");
  const data = steps[current];

  useEffect(() => {
    try {
      const saved = Number(sessionStorage.getItem(STEP_KEY) ?? NaN);
      if (Number.isInteger(saved) && saved >= 0) setStep(saved);
      else if (localStorage.getItem(SEEN_KEY) !== "1") openQuickStart();
    } catch {
      // Sin almacenamiento no se abre sola; queda el botón «Guía»
    }
  }, []);

  if (!isOpen || !tenant || !data) return null;
  const Icon = data.icon;
  const last = current === steps.length - 1;

  // Cada paso lleva a su página para que se vea dónde está
  function goTo(next: number) {
    setStep(next);
    const href = steps[next]?.href;
    if (href && pathname !== href) router.push(href);
  }

  return (
    <Card
      role="dialog"
      aria-labelledby="quick-start-title"
      className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] border-wa/40 shadow-2xl"
    >
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="rounded-md bg-wa/15 p-2 text-wa">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inicio rápido</div>
          <h2 id="quick-start-title" className="text-base font-semibold leading-snug">
            {data.title}
          </h2>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" onClick={closeQuickStart} aria-label="Cerrar guía">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 pb-3 text-sm text-muted-foreground">
        <p>{data.body}</p>
        {data.points && (
          <ul className="space-y-2">
            {data.points.map((p) => (
              <li key={p.title} className="rounded-md bg-accent/50 px-3 py-2">
                <div className="text-xs font-medium text-foreground">{p.title}</div>
                <div className="text-xs">{p.text}</div>
              </li>
            ))}
          </ul>
        )}
        {data.href && (
          <p className="text-xs">
            En el menú de la izquierda lo encuentras resaltado.{" "}
            <Link href={data.href} className="font-medium text-wa hover:underline">
              Ir ahora
            </Link>
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        <div className="flex gap-1" aria-label={`Paso ${current + 1} de ${steps.length}`}>
          {steps.map((s, i) => (
            <span
              key={s.title}
              className={cn("h-1.5 rounded-full transition-all", i === current ? "w-4 bg-wa" : "w-1.5 bg-muted-foreground/30")}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {current > 0 && (
            <Button variant="ghost" size="sm" onClick={() => goTo(current - 1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Atrás
            </Button>
          )}
          {last ? (
            <Button variant="wa" size="sm" onClick={closeQuickStart}>
              Terminar
            </Button>
          ) : (
            <Button variant="wa" size="sm" onClick={() => goTo(current + 1)}>
              {current === 0 ? "Empezar" : "Siguiente"} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
