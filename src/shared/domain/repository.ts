/**
 * Contratos genéricos. Cada módulo define repositorios concretos
 * con tipos del dominio.
 */
export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: ID): Promise<void>;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
