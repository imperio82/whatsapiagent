"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Car, Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { api } from "@services/api-client";
import { cn } from "@lib/utils";

const BUSINESS_TYPES = [
  {
    value: "RETAIL",
    icon: ShoppingBag,
    title: "Tienda",
    text: "Vendo productos: catálogo, cotizaciones y pedidos.",
    businessPlaceholder: "Mi Tienda",
    slugPlaceholder: "mi-tienda",
    industryPlaceholder: "Ropa, tecnología, alimentos…",
  },
  {
    value: "BROKERAGE",
    icon: Car,
    title: "Intermediación",
    text: "Vendo o arriendo vehículos e inmuebles de terceros: inventario, compradores, vendedores y visitas.",
    businessPlaceholder: "Eje Autos & Hogar",
    slugPlaceholder: "eje-autos",
    industryPlaceholder: "Vehículos, finca raíz o ambos",
  },
] as const;

const schema = z.object({
  businessName: z.string().min(2, "Mínimo 2 caracteres").max(80),
  slug: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Solo minúsculas, números y guiones"),
  industry: z.string().max(80).optional(),
  agentProfile: z.enum(["RETAIL", "BROKERAGE"]),
  ownerName: z.string().min(2, "Mínimo 2 caracteres").max(80),
  ownerEmail: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

type Values = z.infer<typeof schema>;

export function RegisterForm(): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { agentProfile: "RETAIL" } });
  const agentProfile = watch("agentProfile");
  const type = BUSINESS_TYPES.find((t) => t.value === agentProfile) ?? BUSINESS_TYPES[0];

  async function onSubmit(values: Values): Promise<void> {
    setSubmitting(true);
    try {
      await api.post("/api/v1/auth/register", values);
      const res = await signIn("credentials", {
        email: values.ownerEmail,
        password: values.password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("Cuenta creada, pero falló el inicio de sesión");
        router.replace("/login");
        return;
      }
      toast.success("¡Negocio creado!");
      router.replace("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>¿Qué tipo de negocio es?</Label>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de negocio">
          {BUSINESS_TYPES.map((option) => {
            const Icon = option.icon;
            const selected = agentProfile === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setValue("agentProfile", option.value, { shouldDirty: true })}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border p-3 text-left transition-colors",
                  selected ? "border-wa bg-wa/5" : "border-border hover:bg-accent/50",
                )}
              >
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-wa" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Define cómo atiende el asistente y qué ves en el panel. Puedes cambiarlo después.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Negocio</Label>
          <Input id="businessName" {...register("businessName")} placeholder={type.businessPlaceholder} />
          {errors.businessName && <p className="text-xs text-destructive">{errors.businessName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Identificador</Label>
          <Input id="slug" {...register("slug")} placeholder={type.slugPlaceholder} />
          {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="industry">Rubro (opcional)</Label>
        <Input id="industry" {...register("industry")} placeholder={type.industryPlaceholder} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ownerName">Tu nombre</Label>
        <Input id="ownerName" {...register("ownerName")} placeholder="Juan Pérez" />
        {errors.ownerName && <p className="text-xs text-destructive">{errors.ownerName.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ownerEmail">Email</Label>
        <Input id="ownerEmail" type="email" {...register("ownerEmail")} />
        {errors.ownerEmail && <p className="text-xs text-destructive">{errors.ownerEmail.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" {...register("password")} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Crear negocio
      </Button>
    </form>
  );
}
