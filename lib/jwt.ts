import jwt, { JwtPayload } from "jsonwebtoken";

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

export function verifyJwt(token: string): ProxyJwtPayload | null {
  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !decoded.sub) return null;
    return decoded as ProxyJwtPayload;
  } catch {
    return null;
  }
}

export function signProxyJwt(clientId: string): { token: string; expiresAt: number } {
  const secret = getSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 3600; // 1 hour
  const token = jwt.sign({ sub: clientId, iat: nowSec, exp: expSec }, secret, {
    algorithm: "HS256",
  });
  return { token, expiresAt: expSec * 1000 }; // expiresAt in milliseconds
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
