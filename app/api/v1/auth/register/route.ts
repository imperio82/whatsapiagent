import { AuthController } from "@modules/auth/interface/auth.controller";
import { created, failure } from "@shared/interface/http/response";

export async function POST(req: Request): Promise<Response> {
  try {
    const controller = new AuthController();
    const body = await req.json();
    // Constancia de aceptación de los términos: la IP del cliente que deja el proxy de Railway
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const result = await controller.registerTenant(body, ip);
    return created(result);
  } catch (err) {
    return failure(err);
  }
}
