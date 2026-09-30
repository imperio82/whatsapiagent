"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@components/ui/avatar";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { teamService } from "@services/team.service";

export default function TeamPage(): React.ReactElement {
  const { data: members } = useQuery({ queryKey: ["team"], queryFn: () => teamService.list() });
  const { data: roles } = useQuery({ queryKey: ["roles"], queryFn: () => teamService.listRoles() });

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
        <CardContent className="p-0">
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
