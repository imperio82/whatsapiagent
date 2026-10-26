"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@components/ui/button";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";
import {
  AGENT_RESOURCES,
  PERMISSION_LEVELS,
  PERMISSION_LEVEL_LABELS,
  agentPermissionsFrom,
  resourcesFor,
  type AgentResource,
  type PermissionLevel,
} from "@modules/ai/domain/agent-permissions";
import { cn } from "@lib/utils";

const rank = (level: PermissionLevel) => PERMISSION_LEVELS.indexOf(level);

/** Permisos del agente por área. Va dentro del modal de Mi agente. */
export function AgentPermissionsForm({ onSaved }: { onSaved?: () => void }): React.ReactElement {
  const { data: tenant } = useCurrentTenant();
  const update = useUpdateTenant();
  const [perms, setPerms] = useState<Record<AgentResource, PermissionLevel> | null>(null);

  useEffect(() => {
    if (tenant) setPerms(agentPermissionsFrom(tenant.aiPermissions, tenant.agentProfile ?? "RETAIL"));
  }, [tenant]);

  if (!tenant || !perms) return <div className="h-40 animate-pulse rounded-md bg-muted/50" />;

  const profile = tenant.agentProfile ?? "RETAIL";
  const resources = resourcesFor(profile);

  function save() {
    // Se conservan las áreas del otro perfil, por si el negocio cambia de tipo
    const own = Object.fromEntries(resources.map((r) => [r, perms![r]]));
    update.mutate({ aiPermissions: { ...(tenant!.aiPermissions ?? {}), ...own } }, { onSuccess: onSaved });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-wa" />
        <p>
          <span className="font-medium text-foreground">Lectura</span> consulta datos, <span className="font-medium text-foreground">actualización</span>{" "}
          modifica los que ya existen y <span className="font-medium text-foreground">escritura</span> crea registros nuevos (incluye las anteriores). Lo
          que el agente no puede hacer, se lo pasa a una persona del equipo. Aplica desde el siguiente mensaje que llegue.
        </p>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {resources.map((resource) => {
          const def = AGENT_RESOURCES[resource];
          const levels = def.levels[profile]!;
          const current = perms[resource];
          const steps = levels.filter((l) => l !== "none");
          return (
            <div key={resource} className="space-y-2.5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold">{def.label[profile]}</span>
                <div role="radiogroup" aria-label={def.label[profile]} className="inline-flex rounded-md border border-border p-0.5">
                  {levels.map((level) => (
                    <button
                      key={level}
                      type="button"
                      role="radio"
                      aria-checked={current === level}
                      onClick={() => setPerms({ ...perms, [resource]: level })}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        current === level
                          ? level === "none"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-wa/15 text-foreground"
                          : "text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {PERMISSION_LEVEL_LABELS[level]}
                    </button>
                  ))}
                </div>
              </div>
              <ul className="space-y-1">
                {steps.map((level) => {
                  const allowed = rank(level) <= rank(current);
                  return (
                    <li key={level} className={cn("flex items-start gap-1.5 text-xs", allowed ? "text-foreground" : "text-muted-foreground line-through")}>
                      {allowed ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-wa" /> : <X className="mt-0.5 h-3 w-3 shrink-0" />}
                      {def.help[level]?.[profile]}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={update.isPending}>
          <Sparkles className="h-4 w-4" /> Guardar cambios
        </Button>
      </div>
    </div>
  );
}
