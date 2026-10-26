import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { auth } from "@modules/auth/infrastructure/auth-config";
import { isPlatformOwner } from "@modules/platform/interface/platform-access";
import { Button } from "@components/ui/button";

/**
 * Plataforma: fuera del panel de los negocios y sin enlace en su menú. A cualquier otro usuario le
 * responde 404, como si la página no existiera.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }): Promise<React.ReactElement> {
  const session = await auth();
  if (!isPlatformOwner(session?.user)) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[90rem] items-center gap-3 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-wa text-wa-foreground">
            <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">Atiendo IA · Plataforma</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{session?.user?.email}</span>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> Volver al panel
            </Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[90rem] px-4 py-6">{children}</main>
    </div>
  );
}
