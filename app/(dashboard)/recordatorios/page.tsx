"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellRing, Cake, CalendarClock, ClipboardList, MessageSquareReply } from "lucide-react";
import { GreetingsPanel } from "@components/features/reminders/greetings-panel";
import { RemindersPanel } from "@components/features/reminders/reminders-panel";
import { useGreetings } from "@hooks/use-greetings";
import { useReminders } from "@hooks/use-reminders";
import type { ReminderKindValue } from "@modules/reminders/domain/reminders";
import { cn } from "@lib/utils";

type Tab = "citas" | "seguimiento" | "libres" | "felicitaciones";

const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }>; kind?: ReminderKindValue }[] = [
  { value: "citas", label: "Citas", icon: CalendarClock, kind: "APPOINTMENT" },
  { value: "seguimiento", label: "Seguimiento", icon: MessageSquareReply, kind: "FOLLOW_UP" },
  { value: "libres", label: "Libres", icon: ClipboardList, kind: "CUSTOM" },
  { value: "felicitaciones", label: "Felicitaciones", icon: Cake },
];

export default function RemindersPage(): React.ReactElement {
  return (
    <Suspense>
      <Reminders />
    </Suspense>
  );
}

function Reminders(): React.ReactElement {
  // `?tipo=felicitaciones` abre esa pestaña (la usa la ruta vieja /felicitaciones)
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tipo") as Tab | null;
  const tab: Tab = TABS.some((t) => t.value === requested) ? requested! : "citas";
  const { data: pending } = useReminders({ status: "PENDING" });
  const { data: greetings } = useGreetings("PENDING");

  const count = (t: (typeof TABS)[number]) =>
    t.kind ? (pending?.filter((r) => r.kind === t.kind).length ?? 0) : (greetings?.length ?? 0);
  const current = TABS.find((t) => t.value === tab)!;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BellRing className="h-6 w-6 text-wa" /> Recordatorios
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Los mensajes que tu negocio inicia: recordar citas, retomar con clientes que dejaron de responder, lo que programes tú y
          las felicitaciones de fechas especiales.
        </p>
      </div>

      <div role="tablist" aria-label="Tipos de recordatorio" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = t.value === tab;
          const n = count(t);
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => router.replace(`${pathname}?tipo=${t.value}`, { scroll: false })}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
                selected ? "border-wa font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {n > 0 && <span className="rounded-full bg-wa/20 px-1.5 text-[11px] tabular-nums text-wa">{n}</span>}
            </button>
          );
        })}
      </div>

      <section role="tabpanel">
        {current.kind ? <RemindersPanel key={current.kind} kind={current.kind} /> : <GreetingsPanel />}
      </section>
    </div>
  );
}
