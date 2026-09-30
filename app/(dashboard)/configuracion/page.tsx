"use client";

import { useEffect, useState } from "react";
import { Building2, Save } from "lucide-react";
import { Button } from "@components/ui/button";
import { Card, CardContent } from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useCurrentTenant, useUpdateTenant } from "@hooks/use-tenant";

export default function GeneralSettingsPage(): React.ReactElement {
  const { data: tenant, isLoading } = useCurrentTenant();
  const update = useUpdateTenant();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name);
    setIndustry(tenant.industry ?? "");
    setAddress(tenant.address ?? "");
    setTaxId(tenant.taxId ?? "");
    setDescription(tenant.description ?? "");
  }, [tenant]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración general</h1>
        <p className="text-sm text-muted-foreground">
          Estos datos identifican a tu negocio en facturas, mensajes y la IA.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-muted p-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="font-semibold">Datos del negocio</div>
              <div className="text-xs text-muted-foreground">
                Slug:{" "}
                <code className="rounded bg-muted px-1 font-mono">{tenant?.slug}</code>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="name">Nombre del negocio</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="industry">Rubro</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="Retail, gastronomía, servicios…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxId">NIT / RUC / Identificación fiscal</Label>
              <Input
                id="taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="opcional"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Esta descripción también la usa la IA al responder a los clientes.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() =>
                update.mutate({
                  name,
                  industry: industry.trim() || null,
                  address: address.trim() || null,
                  taxId: taxId.trim() || null,
                  description: description.trim() || null,
                })
              }
              disabled={update.isPending}
            >
              <Save className="h-4 w-4" /> Guardar cambios
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
