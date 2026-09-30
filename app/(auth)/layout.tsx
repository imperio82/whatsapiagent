import { MessageSquare } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-wa text-wa-foreground">
              <MessageSquare className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-semibold tracking-tight">whatsAppia</span>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsla(142,70%,49%,0.18),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsla(142,70%,49%,0.08),transparent_40%)]" />
        <div className="relative z-10 flex flex-1 flex-col justify-between p-12 text-white">
          <div className="text-sm uppercase tracking-[0.2em] text-white/50">CRM por WhatsApp</div>
          <div className="space-y-3">
            <div className="text-balance text-3xl font-semibold leading-tight">
              Convertí cada chat en una venta.
              <br />
              <span className="text-wa">Sin perder seguimiento.</span>
            </div>
            <p className="max-w-md text-sm text-white/60">
              Centralizá pedidos, leads y conversaciones. La IA responde al cliente con tu catálogo,
              vos solo confirmás la venta.
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-white/40">
            <span>Multi-negocio</span>
            <span>·</span>
            <span>Roles y permisos</span>
            <span>·</span>
            <span>Integración oficial Meta</span>
          </div>
        </div>
      </div>
    </div>
  );
}
