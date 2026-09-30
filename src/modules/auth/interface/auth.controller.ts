import { z } from "zod";
import { RegisterTenantUseCase } from "../application/register-tenant.use-case";
import { BcryptHasher } from "../infrastructure/bcrypt-hasher";

const registerSchema = z.object({
  businessName: z.string().min(2).max(80),
  slug: z.string().min(3).max(32),
  industry: z.string().max(80).optional(),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(2).max(80),
  password: z.string().min(8).max(128),
});

export class AuthController {
  private readonly registerUseCase: RegisterTenantUseCase;

  constructor() {
    this.registerUseCase = new RegisterTenantUseCase(new BcryptHasher());
  }

  async registerTenant(body: unknown): Promise<{ tenantId: string; userId: string; slug: string }> {
    const input = registerSchema.parse(body);
    return this.registerUseCase.execute(input);
  }
}
