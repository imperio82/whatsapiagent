import { Email } from "../value-objects/email";

export interface UserProps {
  id: string;
  email: Email;
  name: string;
  passwordHash: string;
  isPlatformAdmin: boolean;
}

export class AuthUser {
  private constructor(private readonly props: UserProps) {}

  static fromPersistence(p: UserProps): AuthUser {
    return new AuthUser(p);
  }

  get id(): string { return this.props.id; }
  get email(): Email { return this.props.email; }
  get name(): string { return this.props.name; }
  get passwordHash(): string { return this.props.passwordHash; }
  get isPlatformAdmin(): boolean { return this.props.isPlatformAdmin; }
}
