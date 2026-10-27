/** Pesos por dólar para pasar el costo de IA a pesos; se ajusta con USD_COP_RATE. */
export function usdCopRate(): number {
  const rate = Number(process.env.USD_COP_RATE);
  return Number.isFinite(rate) && rate > 0 ? rate : 3_185;
}
