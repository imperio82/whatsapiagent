"use client";

import { useState } from "react";
import { Copy, Loader2, Send, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@components/ui/dialog";
import { Separator } from "@components/ui/separator";
import {
  useGenerateOpeners,
  useLeadOpeners,
  useSendOpener,
} from "@hooks/use-leads";
import type { OpenerTone } from "@services/leads.service";
import type { LeadDto } from "@modules/leads/application/dtos";
import { clientPhoneToDisplay } from "@shared/domain/wa-jid";

interface Props {
  lead: LeadDto | null;
  onClose: () => void;
}

const TONES: { value: OpenerTone; label: string }[] = [
  { value: "amable", label: "Amable" },
  { value: "directo", label: "Directo" },
  { value: "consultivo", label: "Consultivo" },
  { value: "promocional", label: "Promocional" },
];

export function OpenersDialog({ lead, onClose }: Props): React.ReactElement {
  const [tone, setTone] = useState<OpenerTone>("amable");
  const leadId = lead?.id ?? null;
  const { data: openers, isLoading } = useLeadOpeners(leadId);
  const generate = useGenerateOpeners(leadId);
  const send = useSendOpener(leadId);

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {lead && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-wa" />
                <DialogTitle>Abridores para {lead.contactName}</DialogTitle>
              </div>
              <DialogDescription>
                Mensajes en frío generados por IA. Prueba tonos y compara cuál convierte mejor.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="font-medium">{lead.contactName}</div>
                <div className="mt-0.5 text-muted-foreground">
                  {lead.businessName && <span>{lead.businessName} · </span>}
                  {clientPhoneToDisplay(lead.phone)}
                  {lead.productInterest && (
                    <span> · interesa “{lead.productInterest}”</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Tono:</span>
                {TONES.map((t) => (
                  <Button
                    key={t.value}
                    size="sm"
                    variant={tone === t.value ? "default" : "outline"}
                    onClick={() => setTone(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="wa"
                  className="ml-auto"
                  onClick={() => generate.mutate({ tone, variants: 3 })}
                  disabled={generate.isPending}
                >
                  {generate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generar
                </Button>
              </div>

              <Separator />

              <div className="max-h-96 space-y-2 overflow-y-auto">
                {isLoading ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Cargando…</p>
                ) : (openers?.length ?? 0) === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Todavía no hay abridores para este lead. Toca <strong>Generar</strong> para crear 3 variantes con IA.
                  </p>
                ) : (
                  openers?.map((o) => (
                    <div
                      key={o.id}
                      className="rounded-md border border-border bg-card p-3 text-sm"
                    >
                      <div className="whitespace-pre-wrap">{o.content}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {o.sentAt ? (
                            <Badge variant="success">
                              Enviado {formatDistanceToNow(new Date(o.sentAt), { locale: es, addSuffix: true })}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">No enviado</Badge>
                          )}
                          {o.responded && <Badge variant="wa">Respondido</Badge>}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(o.content);
                              toast.success("Copiado al portapapeles");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar
                          </Button>
                          <Button
                            size="sm"
                            variant="wa"
                            disabled={send.isPending || !!o.sentAt}
                            onClick={() => send.mutate(o.id)}
                          >
                            <Send className="h-3.5 w-3.5" />
                            {o.sentAt ? "Enviado" : "Enviar"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
