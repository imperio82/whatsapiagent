"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Pencil, UserPlus, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@components/ui/avatar";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Switch } from "@components/ui/switch";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";
import { ApiError } from "@services/api-client";
import { teamService } from "@services/team.service";

const EXAMPLES = ["¿Qué citas tengo hoy?", "¿Quiénes están calientes?", "Confirma la visita de Laura para el jueves a las 3"];

export default function TeamPage(): React.ReactElement {
  const { data: members } = useQuery({ queryKey: ["team"], queryFn: () => teamService.list() });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => teamService.listRoles() });
  const { data: tenant } = useCurrentTenant();
  const updateTenant = useUpdateTenant();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Equipo</h1>
          <p className="text-sm text-muted-foreground">
            Personas con acceso a este negocio y sus roles.
          </p>
        </div>
        <Button disabled>
          <UserPlus className="h-4 w-4" /> Invitar (próximamente)
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-wa/10 text-wa">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="font-semibold">Asistente del asesor por WhatsApp</div>
            <p className="text-sm text-muted-foreground">
              Cuando un asesor escribe al número del negocio desde su WhatsApp, no lo atiende el agente de clientes sino un
              asistente interno: consulta la agenda, los compradores y el inventario, y confirma citas, marca clientes o les
              escribe por él. También responde al número de avisos del negocio.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {EXAMPLES.map((e) => (
                <span key={e} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  “{e}”
                </span>
              ))}
            </div>
          </div>
          <Switch
            checked={tenant?.advisorAssistant ?? true}
            disabled={!tenant || updateTenant.isPending}
            onCheckedChange={(advisorAssistant) => updateTenant.mutate({ advisorAssistant })}
            aria-label="Activar el asistente del asesor"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {(members?.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sin miembros.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5">Miembro</th>
                  <th className="px-4 py-2.5">Roles</th>
                  <th className="px-4 py-2.5">WhatsApp</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5">Agregado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members?.map((m) => {
                  const initials = m.name
                    .split(" ")
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase();
                  return (
                    <tr key={m.membershipId}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-muted-foreground">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {m.roles.map((r) => (
                            <Badge key={r.key} variant="secondary">
                              {r.name}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <PhoneCell membershipId={m.membershipId} phone={m.whatsappPhone} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={m.status === "ACTIVE" ? "success" : "secondary"}>
                          {m.status === "ACTIVE" ? "Activo" : m.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {format(new Date(m.joinedAt), "PP", { locale: es })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {roles && roles.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="mb-3 font-semibold">Roles disponibles</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {roles.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.name}</span>
                    {r.isSystem && (
                      <Badge variant="outline" className="text-[10px]">
                        Sistema
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {r.permissionCount} permisos
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** WhatsApp del asesor, editable en la misma fila. */
function PhoneCell({ membershipId, phone }: { membershipId: string; phone: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const save = useMutation({
    mutationFn: (whatsappPhone: string | null) => teamService.updatePhone(membershipId, whatsappPhone),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      setEditing(false);
      toast.success("WhatsApp del asesor guardado");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "No se pudo guardar"),
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(phone ?? "");
          setEditing(true);
        }}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {phone ? <span className="font-mono text-foreground">+{phone}</span> : "Agregar"}
        <Pencil className="h-3 w-3" />
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(value.trim() || null);
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="57 300 123 4567"
        className="h-8 w-40 text-xs"
        aria-label="WhatsApp del asesor con indicativo"
      />
      <Button type="submit" variant="ghost" size="icon" className="h-8 w-8" disabled={save.isPending} aria-label="Guardar">
        <Check className="h-4 w-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(false)} aria-label="Cancelar">
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}
