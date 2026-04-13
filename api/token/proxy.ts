import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyClientCredentials } from "../../lib/auth.js";
import {
  setBaseCorsHeaders,
  handleOptions,
  enforceClientOrigin,
} from "../../lib/cors.js";
import { signProxyJwt } from "../../lib/jwt.js";

interface ProxyTokenBody {
  clientId?: unknown;
  clientSecret?: unknown;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setBaseCorsHeaders(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = (req.body ?? {}) as ProxyTokenBody;
  const client = verifyClientCredentials(body.clientId, body.clientSecret);
  if (!client) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  if (!enforceClientOrigin(req, client)) {
    res.status(403).json({ error: "origin_not_allowed" });
    return;
  }

  try {
    const { token, expiresAt } = signProxyJwt(client.id);
    res.status(200).json({ token, expiresAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[token/proxy] sign failed:", message);
    res.status(500).json({ error: "sign_failed" });
  }
}
