import Link from "next/link";
import { RegisterForm } from "@components/features/auth/register-form";

export default function RegisterPage(): React.ReactElement {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registra tu negocio y empieza a vender por WhatsApp en minutos.
        </p>
      </div>
      <RegisterForm />
      <div className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Inicia sesión
        </Link>
      </div>
    </div>
  );
}
