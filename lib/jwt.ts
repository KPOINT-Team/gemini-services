import jwt, { JwtPayload } from "jsonwebtoken";

const ONE_HOUR_SECONDS = 60 * 60;

export interface ProxyJwtPayload extends JwtPayload {
  sub: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET is not set or is too short (min 16 chars)");
  }
  return secret;
}

export function signProxyJwt(clientId: string): {
  token: string;
  expiresAt: number;
} {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ONE_HOUR_SECONDS;

  const token = jwt.sign(
    { sub: clientId, iat, exp },
    secret,
    { algorithm: "HS256" }
  );

  return { token, expiresAt: exp * 1000 };
}

export function verifyProxyJwt(token: string): ProxyJwtPayload | null {
  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !decoded.sub) return null;
    return decoded as ProxyJwtPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
