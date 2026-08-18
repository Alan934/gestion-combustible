import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

const PUBLIC_ROUTES = ["/", "/ingresar", "/registro"];

/**
 * Guarda de rutas. Corre en el runtime Edge, por eso sólo verifica la firma del
 * JWT: la validación contra la base la hacen las páginas y las server actions.
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  if (!session && !isPublic) {
    const url = new URL("/ingresar", request.url);
    url.searchParams.set("redirigir", pathname);
    return NextResponse.redirect(url);
  }

  // Un usuario logueado no tiene por qué ver la landing ni el login.
  if (session && isPublic) {
    return NextResponse.redirect(new URL("/panel", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
