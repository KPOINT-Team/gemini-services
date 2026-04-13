import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ClientConfig } from "./auth.js";

/**
 * Set permissive CORS headers for preflight/discovery. The actual origin
 * allowlist is enforced per-client in enforceClientOrigin().
 */
export function setBaseCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * If the client has an allowedOrigins list, enforce it. Returns true if
 * the request passes, false if it should be rejected.
 */
export function enforceClientOrigin(
  req: VercelRequest,
  client: ClientConfig
): boolean {
  if (!client.allowedOrigins || client.allowedOrigins.length === 0) {
    return true; // no restriction configured
  }
  const origin = req.headers.origin;
  if (!origin) return false;
  return client.allowedOrigins.includes(origin);
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === "OPTIONS") {
    setBaseCorsHeaders(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}
