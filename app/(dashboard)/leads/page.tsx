"use client";

import { useState } from "react";
import { ChevronDown, Phone, Plus, Sparkles, Building2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { useCreateLead, useLeads, useUpdateLead } from "@hooks/use-leads";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";
import { OpenersDialog } from "@components/features/leads/openers-dialog";
import {
  createLeadSchema,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_TEMPERATURE_LABELS,
  QUALIFICATION_LABELS,
  type CreateLeadInput,
  type LeadDto,
  type LeadStageValue,
} from "@modules/leads/application/dtos";
import { cn } from "@lib/utils";
import { Badge, type BadgeProps } from "@components/ui/badge";

const TEMPERATURE_VARIANT: Record<keyof typeof LEAD_TEMPERATURE_LABELS, BadgeProps["variant"]> = {
  HOT: "destructive",
  WARM: "warning",
  COLD: "secondary",
};

const cop = (value: number) => `$${value.toLocaleString("es-CO")}`;

const STAGE_COLORS: Record<LeadStageValue, string> = {
  NEW: "border-zinc-400",
  CONTACTED: "border-blue-500",
  INTERESTED: "border-violet-500",
  READY_TO_BUY: "border-emerald-500",
  CUSTOMER: "border-wa",
  LOST: "border-destructive",
};

export default function LeadsPage(): React.ReactElement {
  const { data } = useLeads();
  const [creating, setCreating] = useState(false);
  const [openersFor, setOpenersFor] = useState<LeadDto | null>(null);

  const grouped = LEAD_STAGES.map((stage) => ({
    stage,
    leads: (data ?? []).filter((l) => l.stage === stage),
  }));

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-t border-border">
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline de leads</h1>
          <p className="text-sm text-muted-foreground">
            Captá contactos por WhatsApp, hacelos avanzar hasta cerrar la venta.
          </p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nuevo lead
            </Button>
          </DialogTrigger>
          <CreateLeadDialog onClose={() => setCreating(false)} />
        </Dialog>
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto bg-muted/20 p-4">
        {grouped.map(({ stage, leads }) => (
          <div
            key={stage}
            className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
          >
            <div
              className={cn(
                "border-l-2 px-3 py-2.5",
                STAGE_COLORS[stage],
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{LEAD_STAGE_LABELS[stage]}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {leads.length}
                </span>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2">
              {leads.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Vacío
                </p>
              ) : (
                leads.map((l) => (
                  <LeadCard
                    key={l.id}
                    lead={l}
                    onOpeners={() => setOpenersFor(l)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <OpenersDialog lead={openersFor} onClose={() => setOpenersFor(null)} />
    </div>
  );
}

function LeadCard({ lead, onOpeners }: { lead: LeadDto; onOpeners: () => void }) {
  const update = useUpdateLead();
  const [editingSearch, setEditingSearch] = useState(false);
  const searchSummary = [
    lead.searchKind === "VEHICLE" ? "vehículo" : lead.searchKind === "PROPERTY" ? "inmueble" : null,
    lead.searchOperation === "RENT" ? "arriendo" : lead.searchOperation === "SALE" ? "compra" : null,
    lead.budgetMaxCop ? `hasta ${cop(lead.budgetMaxCop)}` : null,
    lead.searchCity,
  ].filter(Boolean);

  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm shadow-sm hover:border-accent-foreground/20">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{lead.contactName}</div>
          {lead.businessName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{lead.businessName}</span>
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-0.5 hover:bg-accent" aria-label="Cambiar etapa">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {lead.leadType === "BUYER" && (
              <DropdownMenuItem onClick={() => setEditingSearch(true)}>Editar qué busca…</DropdownMenuItem>
            )}
            {LEAD_STAGES.map((s) => (
              <DropdownMenuItem
                key={s}
                disabled={s === lead.stage}
                onClick={() => update.mutate({ id: lead.id, input: { stage: s } })}
              >
                {LEAD_STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Phone className="h-3 w-3" /> {clientPhoneToDisplay(lead.phone)}
      </div>

      {(lead.temperature || lead.leadType === "SELLER") && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.leadType === "SELLER" && <Badge variant="secondary">Vendedor</Badge>}
          {lead.temperature && (
            <Badge variant={TEMPERATURE_VARIANT[lead.temperature]}>
              {lead.temperature === "HOT" ? "🔥 " : ""}
              {LEAD_TEMPERATURE_LABELS[lead.temperature]}
            </Badge>
          )}
        </div>
      )}

      {lead.listing ? (
        <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          {lead.leadType === "SELLER" ? "Vende" : "Le interesa"}: {lead.listing.title}
          {lead.listing.priceCop > 0 && ` (${cop(lead.listing.priceCop)})`}
        </div>
      ) : (
        lead.productInterest && (
          <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
            Interés: {lead.productInterest}
          </div>
        )
      )}

      {lead.offerCop !== null && (
        <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Ofreció {cop(lead.offerCop)}</div>
      )}

      {Object.keys(lead.qualification).length > 0 && (
        <dl className="mt-2 space-y-0.5 rounded bg-muted/50 p-2 text-[11px]">
          {Object.entries(QUALIFICATION_LABELS)
            .filter(([key]) => lead.qualification[key])
            .map(([key, label]) => (
              <div key={key} className="flex gap-1">
                <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                <dd className="line-clamp-2">{lead.qualification[key]}</dd>
              </div>
            ))}
        </dl>
      )}

      {lead.leadType === "BUYER" && searchSummary.length > 0 && (
        <div className="mt-1.5 text-[11px]">
          <span className="text-muted-foreground">Avisarle si entra:</span> {searchSummary.join(" · ")}
        </div>
      )}

      {editingSearch && <SearchDialog lead={lead} onClose={() => setEditingSearch(false)} />}

      {lead.aiSummary && <p className="mt-1.5 line-clamp-3 text-[11px] italic text-muted-foreground">{lead.aiSummary}</p>}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {lead.lastContactAt
            ? formatDistanceToNow(new Date(lead.lastContactAt), { locale: es, addSuffix: true })
            : "Sin contacto"}
        </span>
        <button
          type="button"
          onClick={onOpeners}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-wa transition-colors hover:bg-wa/10"
          title="Abridores con IA"
        >
          <Sparkles className="h-3 w-3" />
          {lead.openersCount > 0 ? lead.openersCount : "Generar"}
        </button>
      </div>
    </div>
  );
}

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** Lo que busca el comprador en datos que se cruzan con el inventario nuevo (Coincidencias). */
function SearchDialog({ lead, onClose }: { lead: LeadDto; onClose: () => void }) {
  const update = useUpdateLead();
  const [kind, setKind] = useState(lead.searchKind === "OTHER" ? "" : (lead.searchKind ?? ""));
  const [operation, setOperation] = useState(lead.searchOperation ?? "");
  const [budget, setBudget] = useState(lead.budgetMaxCop ? String(lead.budgetMaxCop) : "");
  const [city, setCity] = useState(lead.searchCity ?? "");

  async function save() {
    const digits = budget.replace(/\D/g, "");
    await update.mutateAsync({
      id: lead.id,
      input: {
        searchKind: kind === "VEHICLE" || kind === "PROPERTY" ? kind : null,
        searchOperation: operation === "SALE" || operation === "RENT" ? operation : null,
        budgetMaxCop: digits ? Number(digits) : null,
        searchCity: city.trim() || null,
      },
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Qué busca {lead.contactName}</DialogTitle>
          <DialogDescription>
            Cuando entre al inventario un bien que cumpla esto, aparece en Coincidencias para que le avises. Deja vacío lo que no
            sepas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="search-kind">Tipo</Label>
            <select id="search-kind" className={SELECT} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="VEHICLE">Vehículo</option>
              <option value="PROPERTY">Inmueble</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="search-op">Operación</Label>
            <select id="search-op" className={SELECT} value={operation} onChange={(e) => setOperation(e.target.value)}>
              <option value="">Cualquiera</option>
              <option value="SALE">Comprar</option>
              <option value="RENT">Arrendar</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="search-budget">Presupuesto máximo (COP)</Label>
            <Input
              id="search-budget"
              inputMode="numeric"
              value={budget ? Number(budget.replace(/\D/g, "")).toLocaleString("es-CO") : ""}
              onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
              placeholder="100.000.000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="search-city">Ciudad o barrio</Label>
            <Input id="search-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manizales" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateLeadDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateLead();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateLeadInput>({ resolver: zodResolver(createLeadSchema) });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuevo lead</DialogTitle>
        <DialogDescription>
          Capturá datos de un prospecto. Después podés hacerlo avanzar por el pipeline.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={handleSubmit(async (v) => {
          await create.mutateAsync(v);
          onClose();
        })}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <Label htmlFor="contactName">Nombre del contacto</Label>
          <Input id="contactName" {...register("contactName")} />
          {errors.contactName && (
            <p className="text-xs text-destructive">{errors.contactName.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Negocio (opcional)</Label>
          <Input id="businessName" {...register("businessName")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" {...register("phone")} placeholder="502xxxxxxxx" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="productInterest">Producto de interés</Label>
          <Input id="productInterest" {...register("productInterest")} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            Crear lead
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
