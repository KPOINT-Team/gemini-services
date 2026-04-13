import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCorsHeaders, handleOptions } from "../../lib/cors.js";
import { verifyClientCredentials } from "../../lib/auth.js";
import { signProxyJwt } from "../../lib/jwt.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  setCorsHeaders(req, res);

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { clientId, clientSecret } = (req.body ?? {}) as {
    clientId?: unknown;
    clientSecret?: unknown;
  };

  if (typeof clientId !== "string" || typeof clientSecret !== "string") {
    res.status(400).json({ error: "missing_credentials" });
    return;
  }

  const client = verifyClientCredentials(clientId, clientSecret);
  if (!client) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const result = signProxyJwt(client.id);
  res.status(200).json(result);
}
