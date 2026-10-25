"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Loader2, MessageCircle, Search, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useClients } from "@hooks/use-clients";
import { useCreateReminder } from "@hooks/use-reminders";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import { cn } from "@lib/utils";

const TEXTAREA =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Colombia no tiene horario de verano: la hora que se escribe siempre es UTC−5. */
const BOGOTA_OFFSET = "-05:00";
const bogotaDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

interface Props {
  open: boolean;
  onClose: () => void;
  /** Para abrirlo desde la ficha de un cliente con el cliente ya elegido */
  client?: { id: string; name: string; phone: string } | null;
}

export function NewReminderDialog({ open, onClose, client: initialClient = null }: Props): React.ReactElement {
  const create = useCreateReminder();
  const [client, setClient] = useState(initialClient);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const { data: clients, isFetching } = useClients({ search: query || undefined, pageSize: 6 });

  useEffect(() => {
    if (!open) return;
    setClient(initialClient);
    setSearch("");
    setQuery("");
    setAutoSend(true);
    setDate(bogotaDay(new Date(Date.now() + 86_400_000)));
    setTime("09:00");
    setMessage("");
    setNote("");
    // Solo al abrir o al cambiar de cliente: si dependiera del objeto, cada render del padre borraría lo escrito
  }, [open, initialClient?.id]);

  // Busca medio segundo después de dejar de escribir
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const dueAt = date && time ? new Date(`${date}T${time}:00${BOGOTA_OFFSET}`) : null;
  const past = dueAt ? dueAt.getTime() < Date.now() : false;
  const valid = !!client && !!dueAt && !past && (autoSend ? message.trim().length >= 2 : note.trim().length >= 2);

  function submit() {
    if (!valid) return;
    create.mutate(
      { clientId: client!.id, dueAt: dueAt!.toISOString(), message: message.trim(), note: note.trim() || null, autoSend },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo recordatorio</DialogTitle>
          <DialogDescription>Un mensaje que sale solo a la hora que elijas, o una tarea para ti con aviso por WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reminder-client">Cliente</Label>
            {client ? (
              <div className="flex items-center justify-between rounded-md border border-wa bg-wa/5 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{client.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">{clientPhoneToDisplay(client.phone)}</span>
                </span>
                <button type="button" onClick={() => setClient(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cambiar cliente">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reminder-client"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Busca por nombre o celular"
                    className="pl-8"
                    autoComplete="off"
                  />
                </div>
                <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {isFetching && !clients ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">Buscando…</li>
                  ) : !clients || clients.items.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-muted-foreground">No hay clientes con esa búsqueda.</li>
                  ) : (
                    clients.items.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setClient({ id: c.id, name: c.name, phone: c.phone })}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/50"
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{clientPhoneToDisplay(c.phone)}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>¿Qué quieres programar?</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { value: true, icon: MessageCircle, title: "Mensaje al cliente", text: "Le llega por WhatsApp a la hora que elijas." },
                  { value: false, icon: ClipboardList, title: "Tarea para mí", text: "Te aviso por WhatsApp cuando toque (llamar, visitar…)." },
                ] as const
              ).map((o) => {
                const Icon = o.icon;
                return (
                  <button
                    key={String(o.value)}
                    type="button"
                    aria-pressed={autoSend === o.value}
                    onClick={() => setAutoSend(o.value)}
                    className={cn(
                      "flex items-start gap-2 rounded-md border p-3 text-left text-sm",
                      autoSend === o.value ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50",
                    )}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4", autoSend === o.value ? "text-wa" : "text-muted-foreground")} />
                    <span>
                      <span className="block font-medium">{o.title}</span>
                      <span className="block text-xs text-muted-foreground">{o.text}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-date">Fecha</Label>
              <Input id="reminder-date" type="date" value={date} min={bogotaDay(new Date())} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-time">Hora (Colombia)</Label>
              <Input id="reminder-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          {past && <p className="text-xs text-destructive">Esa fecha y hora ya pasaron.</p>}

          {!autoSend && (
            <div className="space-y-1.5">
              <Label htmlFor="reminder-note">Qué hay que hacer</Label>
              <Input
                id="reminder-note"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej: Llamarlo para saber si le aprobaron el crédito"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reminder-message">{autoSend ? "Mensaje" : "Mensaje para el cliente (opcional)"}</Label>
            <textarea
              id="reminder-message"
              rows={4}
              maxLength={1000}
              className={TEXTAREA}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                autoSend
                  ? "Ej: Hola, Carlos 👋 Te escribo para contarte que ya llegó el apartamento que buscabas en Palermo. ¿Te gustaría visitarlo esta semana?"
                  : "Si lo escribes, lo puedes enviar con un clic cuando hagas la tarea."
              }
            />
            {autoSend && (
              <p className="text-xs text-muted-foreground">
                Con la API oficial de Meta, si el cliente no te ha escrito en las últimas 24 horas el envío puede fallar; quedará en “Con error”.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
