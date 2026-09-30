import Link from "next/link";
import { LoginForm } from "@components/features/auth/login-form";

export default function LoginPage(): React.ReactElement {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entrá a tu cuenta para gestionar tus ventas por WhatsApp.
        </p>
      </div>
      <LoginForm />
      <div className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          Registrá tu negocio
        </Link>
      </div>
    </div>
  );
}
