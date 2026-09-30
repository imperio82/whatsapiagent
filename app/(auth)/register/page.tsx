import Link from "next/link";
import { RegisterForm } from "@components/features/auth/register-form";

export default function RegisterPage(): React.ReactElement {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrá tu negocio y empezá a vender por WhatsApp en minutos.
        </p>
      </div>
      <RegisterForm />
      <div className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-foreground hover:underline">
          Iniciá sesión
        </Link>
      </div>
    </div>
  );
}
