import { ValidationError } from "@shared/domain/errors";

export class Email {
  private static readonly RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const v = raw.trim().toLowerCase();
    if (!Email.RE.test(v)) throw new ValidationError("Email inválido");
    return new Email(v);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
