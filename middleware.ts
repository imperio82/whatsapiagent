import { auth } from "@modules/auth/infrastructure/auth-config";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/bienvenida",
  "/login",
  "/register",
  "/api/auth",
  "/api/v1/auth/register",
  "/api/v1/whatsapp/webhook",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  // Sin sesión, la raíz muestra la landing con los planes; con sesión, el panel
  if (pathname === "/" && !req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/bienvenida";
    return NextResponse.rewrite(url);
  }
  if (!req.auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
