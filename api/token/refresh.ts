import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCorsHeaders, handleOptions } from "../../lib/cors.js";
import { extractBearerToken, verifyJwt, signProxyJwt } from "../../lib/jwt.js";
import { getClientById } from "../../lib/auth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCorsHeaders(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_or_expired_token" });
    return;
  }

  // Re-verify the client still exists and origin is allowed
  const client = getClientById(payload.sub);
  if (!client) {
    res.status(401).json({ error: "client_not_found" });
    return;
  }

  const origin = req.headers.origin;
  if (client.allowedOrigins && client.allowedOrigins.length > 0) {
    if (!origin || !client.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }
  }

  const result = signProxyJwt(client.id);
  res.status(200).json(result);
}
