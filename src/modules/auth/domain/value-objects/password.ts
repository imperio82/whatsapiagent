import { ValidationError } from "@shared/domain/errors";

export class Password {
  private constructor(public readonly raw: string) {}

  static create(value: string): Password {
    if (value.length < 8) throw new ValidationError("La contraseña debe tener al menos 8 caracteres");
    if (value.length > 128) throw new ValidationError("Contraseña demasiado larga");
    return new Password(value);
  }
}
