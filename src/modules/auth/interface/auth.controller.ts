import { z } from "zod";
import { RegisterTenantUseCase } from "../application/register-tenant.use-case";
import { BcryptHasher } from "../infrastructure/bcrypt-hasher";

const registerSchema = z.object({
  businessName: z.string().min(2).max(80),
  slug: z.string().min(3).max(32),
  industry: z.string().max(80).optional(),
  agentProfile: z.enum(["RETAIL", "BROKERAGE"]).default("RETAIL"),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Debes aceptar los términos del servicio y la política de datos" }) }),
});

export class AuthController {
  private readonly registerUseCase: RegisterTenantUseCase;

  constructor() {
    this.registerUseCase = new RegisterTenantUseCase(new BcryptHasher());
  }

  async registerTenant(body: unknown, ip: string | null): Promise<{ tenantId: string; userId: string; slug: string }> {
    const { acceptTerms: _accepted, ...input } = registerSchema.parse(body);
    return this.registerUseCase.execute({ ...input, acceptedFromIp: ip });
  }
}
