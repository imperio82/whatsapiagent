import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Contexto del tenant + usuario actual durante un request.
 * Se setea en el middleware/handler raíz y los repositorios lo leen
 * para filtrar queries automáticamente. Esto evita pasar tenantId
 * manualmente por todas las capas.
 */
export interface RequestContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  permissions: ReadonlySet<string>;
  isPlatformAdmin: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const TenantContext = {
  run<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
    return storage.run(ctx, fn);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  require(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error(
        "RequestContext no inicializado. Asegurarse de envolver el handler en withRequestContext.",
      );
    }
    return ctx;
  },
};
