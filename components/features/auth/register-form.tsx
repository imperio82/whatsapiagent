"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { api } from "@services/api-client";

const schema = z.object({
  businessName: z.string().min(2, "Mínimo 2 caracteres").max(80),
  slug: z
    .string()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Solo minúsculas, números y guiones"),
  industry: z.string().max(80).optional(),
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
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="businessName">Negocio</Label>
          <Input id="businessName" {...register("businessName")} placeholder="Mi Tienda" />
          {errors.businessName && <p className="text-xs text-destructive">{errors.businessName.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Identificador</Label>
          <Input id="slug" {...register("slug")} placeholder="mi-tienda" />
          {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="industry">Rubro (opcional)</Label>
        <Input id="industry" {...register("industry")} placeholder="Retail, gastronomía, servicios…" />
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
