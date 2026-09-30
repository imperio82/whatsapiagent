import { ForbiddenError, UnauthorizedError } from "@shared/domain/errors";
import { TenantContext } from "./tenant-context";

/**
 * Guard de permisos para usar dentro de casos de uso o controllers.
 * Wildcard `recurso.*` matchea cualquier acción sobre el recurso.
 */
export function authorize(...required: string[]): void {
  const ctx = TenantContext.get();
  if (!ctx) throw new UnauthorizedError("Sesión no iniciada");
  if (ctx.isPlatformAdmin) return;

  const has = required.every((req) => {
    if (ctx.permissions.has(req)) return true;
    const [resource] = req.split(".");
    return ctx.permissions.has(`${resource}.*`) || ctx.permissions.has("*");
  });

  if (!has) {
    throw new ForbiddenError("No tenés permisos suficientes", { required });
  }
}

export function hasPermission(key: string): boolean {
  const ctx = TenantContext.get();
  if (!ctx) return false;
  if (ctx.isPlatformAdmin) return true;
  if (ctx.permissions.has(key) || ctx.permissions.has("*")) return true;
  const [resource] = key.split(".");
  return ctx.permissions.has(`${resource}.*`);
}
