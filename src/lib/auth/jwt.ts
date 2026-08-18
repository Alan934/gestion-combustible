import { jwtVerify, SignJWT } from "jose";

/**
 * Firma y verificación del token de sesión. Este módulo se mantiene libre de
 * dependencias de Node (nada de `pg` ni `bcryptjs`) para poder usarlo también
 * desde el middleware, que corre en el runtime Edge.
 */

export const SESSION_COOKIE = "gc_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET falta o es demasiado corto. Generá uno con: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}
