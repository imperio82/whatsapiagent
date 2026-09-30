import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, InfrastructureError, ValidationError } from "@shared/domain/errors";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function failure(error: DomainError | ZodError | unknown): NextResponse<ApiFailure> {
  if (error instanceof ZodError) {
    const ve = new ValidationError("Datos inválidos", { issues: error.flatten() });
    return NextResponse.json(
      { ok: false, error: { code: ve.code, message: ve.message, details: ve.details } },
      { status: ve.httpStatus },
    );
  }

  if (error instanceof DomainError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.httpStatus },
    );
  }

  console.error("[UNEXPECTED_ERROR]", error);
  const ie = new InfrastructureError("Error interno");
  return NextResponse.json(
    { ok: false, error: { code: ie.code, message: ie.message } },
    { status: ie.httpStatus },
  );
}
