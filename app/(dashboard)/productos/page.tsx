"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Search, Upload } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@components/ui/dialog";
import { ProductForm } from "@components/features/products/product-form";
import { ProductsTable } from "@components/features/products/products-table";
import { useCreateProduct, useProducts } from "@hooks/use-products";

export default function ProductsPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const create = useCreateProduct();
  const { data, isLoading } = useProducts({ search: search || undefined, pageSize: 50 });

  return (
    <div className="space-y-5">
      <Link href="/colecciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Colecciones
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Cargá tu catálogo. La IA usa esta información para responder por WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/configuracion/datos?destino=productos">
            <Upload className="h-4 w-4" /> Importar
          </Link>
        </Button>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nuevo producto</DialogTitle>
              <DialogDescription>
                Agregalo al catálogo. Si no llevás inventario, desactivá el control de stock.
              </DialogDescription>
            </DialogHeader>
            <ProductForm
              submitting={create.isPending}
              onCancel={() => setCreating(false)}
              onSubmit={async (values) => {
                await create.mutateAsync(values);
                setCreating(false);
              }}
            />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {data ? `${data.total} resultados` : ""}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : (
        <ProductsTable products={data?.items ?? []} />
      )}
    </div>
  );
}
