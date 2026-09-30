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
  type CreateLeadInput,
  type LeadDto,
  type LeadStageValue,
} from "@modules/leads/application/dtos";
import { cn } from "@lib/utils";

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

      {lead.productInterest && (
        <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
          Interés: {lead.productInterest}
        </div>
      )}

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
