import type { VercelRequest, VercelResponse } from "@vercel/node";

function getAllowedOrigins(): string[] {
  const raw = process.env.PROTECTMEWELL_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;
  return getAllowedOrigins().includes(origin);
}

export function setProtectMeWellCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export function handleProtectMeWellPreflight(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  if (req.method === "OPTIONS") {
    setProtectMeWellCors(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}

export function enforceOrigin(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) {
    res.status(403).json({ status: false, error: "origin_not_allowed" });
    return false;
  }
  return true;
}

export const PROTECTMEWELL_BASE_URL = "https://protectmewell.com";

export function getProtectMeWellApiKey(): string {
  const apiKey = process.env.PROTECTMEWELL_API_KEY;
  if (!apiKey) {
    throw new Error("protectmewell_not_configured");
  }
  return apiKey;
}
