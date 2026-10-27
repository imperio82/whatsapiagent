/**
 * Términos del servicio y política de datos (docs/legal). Están publicados en la landing; al registrarse,
 * el negocio los acepta y queda guardada la versión. Si cambia algo importante, subir la versión.
 */
export const LEGAL_VERSION = "1.0";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://atiendoia.com").replace(/\/$/, "");
export const TERMS_URL = `${SITE}/terminos`;
export const PRIVACY_URL = `${SITE}/privacidad`;
