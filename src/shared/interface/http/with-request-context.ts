import { auth } from "@modules/auth/infrastructure/auth-config";
import { UnauthorizedError } from "@shared/domain/errors";
import { TenantContext, type RequestContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import { failure, type ApiFailure } from "./response";
import type { NextResponse } from "next/server";

/**
 * Envuelve un route handler de Next.js con el contexto de request:
 * - Valida sesión (NextAuth v5)
 * - Resuelve el tenant activo desde el token
 * - Carga permisos efectivos del miembro
 * - Hace todo disponible vía TenantContext.require()
 */
export function withRequestContext<R extends NextResponse<unknown>>(
  handler: (req: Request) => Promise<R>,
): (req: Request) => Promise<R | NextResponse<ApiFailure>> {
  return async (req: Request) => {
    try {
      const session = await auth();
      if (!session?.user?.id) throw new UnauthorizedError("Sesión requerida");

      const tenantId = session.activeTenantId;
      if (!tenantId) throw new UnauthorizedError("Tenant activo requerido");

      const membership = await prisma.membership.findUnique({
        where: { userId_tenantId: { userId: session.user.id, tenantId } },
        include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        throw new UnauthorizedError("Membresía inactiva");
      }

      const permissions = new Set<string>();
      for (const mr of membership.roles) {
        for (const rp of mr.role.permissions) permissions.add(rp.permission.key);
      }

      const ctx: RequestContext = {
        userId: session.user.id,
        tenantId,
        membershipId: membership.id,
        permissions,
        isPlatformAdmin: session.user.isPlatformAdmin ?? false,
      };

      return await TenantContext.run(ctx, () => handler(req));
    } catch (err) {
      return failure(err);
    }
  };
}
