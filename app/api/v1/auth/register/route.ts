import { AuthController } from "@modules/auth/interface/auth.controller";
import { created, failure } from "@shared/interface/http/response";

export async function POST(req: Request): Promise<Response> {
  try {
    const controller = new AuthController();
    const body = await req.json();
    const result = await controller.registerTenant(body);
    return created(result);
  } catch (err) {
    return failure(err);
  }
}
