import { UnauthorizedError } from "@shared/domain/errors";
import type { UseCase } from "@shared/domain/use-case";
import { Email } from "../domain/value-objects/email";
import type { AuthUserRepository } from "../domain/ports/auth-user-repository";
import type { PasswordHasher } from "../domain/ports/password-hasher";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  tenants: Array<{ id: string; slug: string; name: string }>;
}

export class LoginUseCase implements UseCase<LoginInput, LoginOutput> {
  constructor(
    private readonly users: AuthUserRepository,
    private readonly hasher: PasswordHasher,
    private readonly listTenants: (userId: string) => Promise<LoginOutput["tenants"]>,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const email = Email.create(input.email);
    const user = await this.users.findByEmail(email.value);
    if (!user) throw new UnauthorizedError("Credenciales inválidas");

    const ok = await this.hasher.verify(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError("Credenciales inválidas");

    const tenants = await this.listTenants(user.id);
    return {
      userId: user.id,
      email: user.email.value,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
      tenants,
    };
  }
}
