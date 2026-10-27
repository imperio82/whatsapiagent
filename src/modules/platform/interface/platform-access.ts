import { auth } from "@modules/auth/infrastructure/auth-config";
import { NotFoundError, UnauthorizedError } from "@shared/domain/errors";
import { failure, type ApiFailure } from "@shared/interface/http/response";
import type { NextResponse } from "next/server";

/**
 * La plataforma (planes, cobros y costos de todos los negocios) es solo para su dueño: los correos de
 * PLATFORM_ADMIN_EMAILS, que solo se cambian en el servidor. Sin esa variable no entra nadie.
 */
export function isPlatformOwner(user: { email?: string | null } | undefined): boolean {
  if (!user?.email) return false;
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(user.email.toLowerCase());
}

export interface PlatformOwner {
  userId: string;
}

/** Rutas del API de la plataforma. A cualquier otro usuario le responde que no existe, para no delatarla. */
export function withPlatformOwner<R extends NextResponse<unknown>>(
  handler: (req: Request, owner: PlatformOwner) => Promise<R>,
): (req: Request) => Promise<R | NextResponse<ApiFailure>> {
  return async (req: Request) => {
    try {
      const session = await auth();
      if (!session?.user?.id) throw new UnauthorizedError("Sesión requerida");
      if (!isPlatformOwner(session.user)) throw new NotFoundError("No encontrado");
      return await handler(req, { userId: session.user.id });
    } catch (err) {
      return failure(err);
    }
  };
}
