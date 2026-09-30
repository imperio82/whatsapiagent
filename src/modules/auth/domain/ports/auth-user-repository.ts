import type { AuthUser } from "../entities/user";

export interface AuthUserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
}
