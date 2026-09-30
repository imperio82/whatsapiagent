import { ValidationError } from "@shared/domain/errors";

const ISO_CURRENCY = /^[A-Z]{3}$/;

export class Money {
  private constructor(public readonly cents: number, public readonly currency: string) {}

  static fromCents(cents: number, currency = "GTQ"): Money {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new ValidationError("El precio debe ser un entero positivo en centavos");
    }
    if (!ISO_CURRENCY.test(currency)) {
      throw new ValidationError("Moneda inválida (esperado código ISO 4217)");
    }
    return new Money(cents, currency);
  }

  static fromMajor(amount: number, currency = "GTQ"): Money {
    return Money.fromCents(Math.round(amount * 100), currency);
  }

  get major(): number {
    return this.cents / 100;
  }
}
