/**
 * Contrato base de un caso de uso. Recibe un input tipado y devuelve un output tipado.
 * El input/output debe ser DTO plano (sin lógica). Nunca exponer entidades del dominio
 * directamente — usar mappers en infrastructure.
 */
export interface UseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
