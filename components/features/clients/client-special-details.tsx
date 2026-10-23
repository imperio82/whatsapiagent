"use client";

import { useState } from "react";
import { Cake, Link2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { Switch } from "@components/ui/switch";
import { useClients } from "@hooks/use-clients";
import {
  useAddClientRelation,
  useClientDetails,
  useDeleteClientDate,
  useDeleteClientRelation,
  useSaveClientDate,
  useSetGreetingsOptOut,
} from "@hooks/use-client-details";
import { DATE_KIND_LABELS, formatMonthDay, type ClientDateKindValue } from "@modules/clients/domain/special-dates";
import type { ClientDateDto } from "@modules/clients/application/details.use-cases";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const RELATION_SUGGESTIONS = ["Esposa", "Esposo", "Hijo", "Hija", "Mamá", "Papá", "Hermano", "Hermana", "Socio", "Amigo", "Lo refirió", "Referido"];

/** Fechas especiales, red de contactos y preferencia de felicitaciones del cliente. */
export function ClientSpecialDetails({ clientId }: { clientId: string }) {
  const { data } = useClientDetails(clientId);
  const optOut = useSetGreetingsOptOut(clientId);
  const [editing, setEditing] = useState<ClientDateDto | "new" | null>(null);

  if (!data) return <div className="h-24 animate-pulse rounded-md bg-muted/40" />;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <Cake className="h-4 w-4 text-wa" /> Fechas especiales
          </Label>
          {editing === null && (
            <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          )}
        </div>
        {data.dates.length === 0 && editing === null && (
          <p className="text-xs text-muted-foreground">Su cumpleaños, el de su esposa o hijos, el aniversario de la compra… Se le felicita ese día.</p>
        )}
        <ul className="space-y-1">
          {data.dates.map((d) =>
            editing !== "new" && editing?.id === d.id ? (
              <li key={d.id}>
                <DateForm clientId={clientId} initial={d} onClose={() => setEditing(null)} />
              </li>
            ) : (
              <DateRow key={d.id} clientId={clientId} date={d} onEdit={() => setEditing(d)} />
            ),
          )}
        </ul>
        {editing === "new" && <DateForm clientId={clientId} onClose={() => setEditing(null)} />}
        <label className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs">
          <span>
            <span className="font-medium">No enviarle felicitaciones</span>
            <span className="block text-muted-foreground">Si el cliente lo pidió. Las fechas se siguen viendo para el equipo.</span>
          </span>
          <Switch checked={data.greetingsOptOut} onCheckedChange={(v) => optOut.mutate(v)} disabled={optOut.isPending} />
        </label>
      </section>

      <RelationsSection clientId={clientId} relations={data.relations} />
    </div>
  );
}

function DateRow({ clientId, date, onEdit }: { clientId: string; date: ClientDateDto; onEdit: () => void }) {
  const remove = useDeleteClientDate(clientId);
  const what =
    date.kind === "BIRTHDAY" ? (date.personName ? `Cumpleaños de ${date.personName}` : "Su cumpleaños") : date.label ?? DATE_KIND_LABELS[date.kind];
  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium">{what}</div>
        <div className="text-xs text-muted-foreground">
          {formatMonthDay(date)}
          {date.message ? " · mensaje propio" : ""}
          {!date.isActive ? " · pausada" : ""}
        </div>
      </div>
      <div className="flex shrink-0">
        <Button size="icon" variant="ghost" aria-label="Editar fecha" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Eliminar fecha" onClick={() => remove.mutate(date.id)} disabled={remove.isPending}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function DateForm({ clientId, initial, onClose }: { clientId: string; initial?: ClientDateDto; onClose: () => void }) {
  const save = useSaveClientDate(clientId);
  const [kind, setKind] = useState<ClientDateKindValue>(initial?.kind ?? "BIRTHDAY");
  const [forOther, setForOther] = useState(Boolean(initial?.personName));
  const [personName, setPersonName] = useState(initial?.personName ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [day, setDay] = useState(initial?.day ?? 1);
  const [month, setMonth] = useState(initial?.month ?? 1);
  const [year, setYear] = useState(initial?.year ? String(initial.year) : "");
  const [message, setMessage] = useState(initial?.message ?? "");

  const submit = async () => {
    await save.mutateAsync({
      id: initial?.id,
      input: {
        kind,
        personName: forOther ? personName : null,
        label: kind === "BIRTHDAY" ? null : label,
        day,
        month,
        year: year ? Number(year) : null,
        message: message || null,
        isActive: initial?.isActive ?? true,
      },
    });
    onClose();
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={SELECT} value={kind} onChange={(e) => setKind(e.target.value as ClientDateKindValue)} aria-label="Tipo de fecha">
          <option value="BIRTHDAY">Cumpleaños</option>
          <option value="ANNIVERSARY">Aniversario</option>
          <option value="CUSTOM">Otra fecha especial</option>
        </select>
        {kind === "BIRTHDAY" ? (
          <select className={SELECT} value={forOther ? "other" : "self"} onChange={(e) => setForOther(e.target.value === "other")} aria-label="De quién">
            <option value="self">Del cliente</option>
            <option value="other">De alguien de su círculo</option>
          </select>
        ) : (
          <Input placeholder="Qué se celebra: aniversario de bodas" value={label} onChange={(e) => setLabel(e.target.value)} />
        )}
      </div>
      {kind === "BIRTHDAY" && forOther && (
        <Input placeholder="Nombre y relación: María (esposa)" value={personName} onChange={(e) => setPersonName(e.target.value)} />
      )}
      <div className="grid grid-cols-3 gap-2">
        <select className={SELECT} value={day} onChange={(e) => setDay(Number(e.target.value))} aria-label="Día">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select className={SELECT} value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Mes">
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <Input inputMode="numeric" placeholder="Año (opcional)" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      </div>
      <textarea
        rows={2}
        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
        placeholder="Mensaje propio para esta fecha (opcional; si no, se usa el del negocio)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={save.isPending || (kind !== "BIRTHDAY" && label.trim().length < 2) || (forOther && kind === "BIRTHDAY" && personName.trim().length < 2)}
        >
          Guardar fecha
        </Button>
      </div>
    </div>
  );
}

function RelationsSection({ clientId, relations }: { clientId: string; relations: import("@modules/clients/application/details.use-cases").ClientRelationDto[] }) {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [relatedId, setRelatedId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const { data: found } = useClients({ search: search.length >= 2 ? search : undefined });
  const add = useAddClientRelation(clientId);
  const remove = useDeleteClientRelation(clientId);
  const candidates = (found?.items ?? []).filter((c) => c.id !== clientId && !relations.some((r) => r.other.id === c.id)).slice(0, 6);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-wa" /> Red de contactos
        </Label>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Link2 className="h-4 w-4" /> Relacionar
          </Button>
        )}
      </div>
      {relations.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Quién lo refirió, su familia o socios que también son clientes.</p>
      )}
      <ul className="space-y-1">
        {relations.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate">
                <span className="font-medium">{r.other.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{r.inverse ? `(este cliente es su: ${r.label.toLowerCase()})` : `· ${r.label}`}</span>
              </div>
              <div className="text-xs text-muted-foreground">{clientPhoneToDisplay(r.other.phone)}</div>
            </div>
            <Button size="icon" variant="ghost" aria-label="Quitar relación" onClick={() => remove.mutate(r.id)} disabled={remove.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {adding && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Input placeholder="Buscar cliente por nombre o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          {search.length >= 2 && (
            <div className="flex flex-wrap gap-1.5">
              {candidates.length === 0 && <span className="text-xs text-muted-foreground">Sin resultados</span>}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={relatedId === c.id}
                  onClick={() => setRelatedId(c.id)}
                  className={`rounded border px-2 py-1 text-xs ${relatedId === c.id ? "border-wa bg-wa/10 text-wa" : "border-border"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <Input list="relation-suggestions" placeholder="¿Qué es de este cliente? Esposa, socio, lo refirió…" value={label} onChange={(e) => setLabel(e.target.value)} />
          <datalist id="relation-suggestions">
            {RELATION_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!relatedId || label.trim().length < 2 || add.isPending}
              onClick={async () => {
                await add.mutateAsync({ relatedClientId: relatedId!, label: label.trim() });
                setAdding(false);
                setSearch("");
                setRelatedId(null);
                setLabel("");
              }}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
