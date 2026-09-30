"use client";

import { useState } from "react";
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@components/ui/dialog";
import { ProductForm } from "./product-form";
import { useDeleteProduct, useUpdateProduct } from "@hooks/use-products";
import { formatCurrency } from "@lib/utils";
import type { ProductDto } from "@modules/products/application/dtos";

interface Props {
  products: ProductDto[];
}

export function ProductsTable({ products }: Props) {
  const [editing, setEditing] = useState<ProductDto | null>(null);
  const update = useUpdateProduct();
  const remove = useDeleteProduct();

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Todavía no tenés productos cargados.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Creá tu primer producto para que la IA pueda ofrecerlo en WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Producto</th>
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5 text-right">Precio</th>
              <th className="px-4 py-2.5 text-right">Stock</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-accent/30">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted" />
                    )}
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.description && (
                        <div className="line-clamp-1 max-w-[40ch] text-xs text-muted-foreground">
                          {p.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  <span className="font-mono text-xs">{p.sku ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(p.priceMajor, p.currency)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {p.trackInventory ? p.stock : <span className="text-muted-foreground">∞</span>}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={p.status === "ACTIVE" ? "success" : "secondary"}>
                    {p.status === "ACTIVE" ? "Activo" : "Archivado"}
                  </Badge>
                </td>
                <td className="px-2 py-2.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => update.mutate({ id: p.id, input: { status: "ARCHIVED" } })}
                      >
                        <Archive className="mr-2 h-3.5 w-3.5" /> Archivar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (confirm("¿Eliminar este producto?")) remove.mutate(p.id);
                        }}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
          </DialogHeader>
          {editing && (
            <ProductForm
              initial={editing}
              submitting={update.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, input: values });
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
