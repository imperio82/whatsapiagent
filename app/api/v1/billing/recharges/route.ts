import { BillingController } from "@modules/billing/interface/billing.controller";
import { created, ok } from "@shared/interface/http/response";
import { withRequestContext } from "@shared/interface/http/with-request-context";

const controller = new BillingController();

/** Paquetes, rango del monto libre, formas de pago y las últimas recargas del negocio. */
export const GET = withRequestContext(async () => ok(await controller.rechargeOptions()));

/** { amountCop }: pide una recarga; queda pendiente hasta que se confirme el pago. */
export const POST = withRequestContext(async (req) => created(await controller.requestRecharge(await req.json())));
