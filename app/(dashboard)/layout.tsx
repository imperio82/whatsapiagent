import { redirect } from "next/navigation";
import { auth } from "@modules/auth/infrastructure/auth-config";
import { Sidebar } from "@components/layout/sidebar";
import { Topbar } from "@components/layout/topbar";
import { HandoffAlerts } from "@components/features/chats/handoff-alerts";
import { QuickStart } from "@components/layout/quick-start";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const activeTenant = session.tenants.find((t) => t.id === session.activeTenantId);
  const tenantName = activeTenant?.name ?? "Sin negocio";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        tenantName={tenantName}
        tenants={session.tenants.map((t) => ({ id: t.id, name: t.name }))}
        activeTenantId={session.activeTenantId}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar userName={session.user.name ?? "Usuario"} userEmail={session.user.email ?? ""} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-6">{children}</div>
        </main>
      </div>
      <HandoffAlerts />
      <QuickStart />
    </div>
  );
}
