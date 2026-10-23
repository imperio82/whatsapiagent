/**
 * Simulación de cuota de un crédito (sistema francés, cuota fija). Es un cálculo que el
 * modelo no debe hacer de memoria: el agente llama la herramienta y repite el resultado,
 * siempre como "estimado". La tasa se da efectiva anual, como la cotizan los bancos en Colombia.
 */

export interface LoanInput {
  /** Precio del bien en pesos. */
  price: number;
  /** Cuota inicial en pesos. */
  downPayment: number;
  /** Tasa efectiva anual en porcentaje (ej: 14.5). */
  annualRatePercent: number;
  /** Plazo en meses. */
  months: number;
}

export type LoanResult =
  | { ok: true; financedAmount: number; monthlyPayment: number; totalPaid: number; monthlyRatePercent: number }
  | { ok: false; error: string };

export const MAX_LOAN_MONTHS = 360;

export function simulateLoan({ price, downPayment, annualRatePercent, months }: LoanInput): LoanResult {
  if (!(price > 0)) return { ok: false, error: "El precio debe ser mayor que cero." };
  if (!(downPayment >= 0) || downPayment >= price) {
    return { ok: false, error: "La cuota inicial debe ser menor que el precio." };
  }
  if (!(annualRatePercent >= 0) || annualRatePercent > 100) {
    return { ok: false, error: "La tasa efectiva anual debe estar entre 0 y 100 %." };
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_LOAN_MONTHS) {
    return { ok: false, error: `El plazo debe ser un número entero de meses entre 1 y ${MAX_LOAN_MONTHS}.` };
  }

  const financedAmount = Math.round(price - downPayment);
  const monthlyRate = Math.pow(1 + annualRatePercent / 100, 1 / 12) - 1;
  const payment =
    monthlyRate === 0 ? financedAmount / months : (financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  const monthlyPayment = Math.round(payment);

  return {
    ok: true,
    financedAmount,
    monthlyPayment,
    totalPaid: monthlyPayment * months,
    monthlyRatePercent: Math.round(monthlyRate * 10_000) / 100,
  };
}
