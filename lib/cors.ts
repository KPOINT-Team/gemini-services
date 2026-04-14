import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClientById } from "./auth.js";

function getAllAllowedOrigins(): string[] {
  const raw = process.env.CLIENTS_JSON;
  if (!raw) return [];
  try {
    const clients = JSON.parse(raw) as { allowedOrigins?: string[] }[];
    const origins: string[] = [];
    for (const c of clients) {
      if (c.allowedOrigins) origins.push(...c.allowedOrigins);
    }
    return origins;
  } catch {
    return [];
  }
}

export function isOriginAllowed(origin: string): boolean {
  const all = getAllAllowedOrigins();
  if (all.length === 0) return true; // no restrictions configured
  return all.includes(origin);
}

export function setCorsHeaders(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}
