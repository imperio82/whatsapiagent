"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { createProductSchema, type CreateProductInput } from "@modules/products/application/dtos";
import type { ProductDto } from "@modules/products/application/dtos";

interface ProductFormProps {
  initial?: ProductDto;
  onSubmit: (values: CreateProductInput) => Promise<void> | void;
  submitting: boolean;
  onCancel: () => void;
}

export function ProductForm({ initial, onSubmit, submitting, onCancel }: ProductFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      sku: initial?.sku ?? "",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      priceMajor: initial?.priceMajor ?? 0,
      currency: initial?.currency ?? "GTQ",
      trackInventory: initial?.trackInventory ?? true,
      stock: initial?.stock ?? 0,
      imageUrl: initial?.imageUrl ?? "",
    },
  });

  useEffect(() => {
    if (initial) {
      reset({
        sku: initial.sku ?? "",
        name: initial.name,
        description: initial.description ?? "",
        priceMajor: initial.priceMajor,
        currency: initial.currency,
        trackInventory: initial.trackInventory,
        stock: initial.stock,
        imageUrl: initial.imageUrl ?? "",
      });
    }
  }, [initial, reset]);

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v))} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sku">SKU</Label>
          <Input id="sku" {...register("sku")} placeholder="opcional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Moneda</Label>
          <Input id="currency" {...register("currency")} placeholder="GTQ" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priceMajor">Precio</Label>
          <Input
            id="priceMajor"
            type="number"
            step="0.01"
            {...register("priceMajor", { valueAsNumber: true })}
          />
          {errors.priceMajor && <p className="text-xs text-destructive">{errors.priceMajor.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stock">Stock</Label>
          <Input id="stock" type="number" {...register("stock", { valueAsNumber: true })} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="description">Descripción</Label>
          <textarea
            id="description"
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            {...register("description")}
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="imageUrl">URL de imagen</Label>
          <Input id="imageUrl" {...register("imageUrl")} placeholder="https://…" />
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" {...register("trackInventory")} className="rounded border-input" />
          Controlar inventario
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
