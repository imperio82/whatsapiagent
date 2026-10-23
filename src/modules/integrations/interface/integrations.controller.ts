import { NextResponse } from "next/server";
import { authorize } from "@shared/application/authorize";
import { TenantContext } from "@shared/application/tenant-context";
import { prisma } from "@shared/infrastructure/prisma/client";
import {
  DeleteGoogleAppUseCase,
  DisconnectUseCase,
  GetIntegrationsUseCase,
  ListCalendarsUseCase,
  SaveGoogleAppUseCase,
  UpdateConnectionSettingsUseCase,
  scopeSchema,
} from "../application/use-cases";
import { appBaseUrl, buildGoogleAuthUrl, completeGoogleConnection, type ConnectionScope } from "../infrastructure/google/google-auth";
import { createState, verifyState } from "../infrastructure/oauth-state";

const NONCE_COOKIE = "wa_oauth_nonce";
const SETTINGS_PAGE = "/configuracion/integraciones";

/** ?scope=business | user (por defecto, el propio del usuario). */
function scopeFrom(req: Request): ConnectionScope {
  return scopeSchema.catch("user").parse(new URL(req.url).searchParams.get("scope") ?? "user");
}

export class IntegrationsController {
  overview() {
    return new GetIntegrationsUseCase().execute();
  }

  updateSettings(req: Request, body: unknown) {
    return new UpdateConnectionSettingsUseCase().execute(scopeFrom(req), body);
  }

  listCalendars(req: Request) {
    return new ListCalendarsUseCase().execute(scopeFrom(req));
  }

  disconnect(req: Request) {
    return new DisconnectUseCase().execute(scopeFrom(req));
  }

  saveApp(body: unknown) {
    return new SaveGoogleAppUseCase().execute(body);
  }

  deleteApp() {
    return new DeleteGoogleAppUseCase().execute();
  }

  /** Manda al usuario a la pantalla de consentimiento de Google. */
  async startGoogle(req: Request): Promise<NextResponse> {
    const scope = scopeFrom(req);
    if (scope === "business") authorize("tenant.settings");
    const { tenantId, userId } = TenantContext.require();
    const { state, nonce } = createState(tenantId, userId, scope);
    // Para el calendario propio se sugiere la cuenta del usuario (puede elegir otra)
    const user = scope === "user" ? await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }) : null;
    const res = NextResponse.redirect(await buildGoogleAuthUrl(tenantId, scope, state, user?.email));
    res.cookies.set(NONCE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: appBaseUrl().startsWith("https://"),
      path: "/api/v1/integrations",
      maxAge: 600,
    });
    return res;
  }

  /** Vuelta de Google: valida el state y el nonce, guarda los tokens y regresa al panel. */
  async finishGoogle(req: Request): Promise<NextResponse> {
    const back = (result: "ok" | "error", message?: string, scope?: ConnectionScope) => {
      const url = new URL(SETTINGS_PAGE, appBaseUrl());
      url.searchParams.set("google", result);
      if (scope) url.searchParams.set("conexion", scope);
      if (message) url.searchParams.set("mensaje", message);
      const res = NextResponse.redirect(url);
      res.cookies.delete({ name: NONCE_COOKIE, path: "/api/v1/integrations" });
      return res;
    };

    const params = new URL(req.url).searchParams;
    if (params.get("error")) return back("error", params.get("error") === "access_denied" ? "Cancelaste el permiso en Google" : "Google no autorizó la conexión");

    const ctx = TenantContext.require();
    const state = verifyState(params.get("state") ?? "");
    const cookieNonce = req.headers.get("cookie")?.match(new RegExp(`${NONCE_COOKIE}=([^;]+)`))?.[1];
    if (!state || state.tenantId !== ctx.tenantId || state.userId !== ctx.userId || state.nonce !== cookieNonce) {
      return back("error", "El enlace de conexión venció o no es de esta sesión. Intenta de nuevo.");
    }
    const code = params.get("code");
    if (!code) return back("error", "Google no devolvió el código de autorización", state.scope);

    try {
      if (state.scope === "business") authorize("tenant.settings");
      await completeGoogleConnection(ctx.tenantId, ctx.userId, state.scope, code);
      return back("ok", undefined, state.scope);
    } catch (err) {
      console.error("[integrations] no se pudo conectar Google:", err);
      return back("error", err instanceof Error ? err.message : "No se pudo conectar", state.scope);
    }
  }
}
