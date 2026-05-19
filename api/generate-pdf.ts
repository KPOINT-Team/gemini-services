import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setProtectMeWellCors,
  handleProtectMeWellPreflight,
  enforceOrigin,
  getProtectMeWellApiKey,
  PROTECTMEWELL_BASE_URL,
} from "../lib/protectmewell.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleProtectMeWellPreflight(req, res)) return;
  setProtectMeWellCors(req, res);

  if (!enforceOrigin(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ status: false, error: "method_not_allowed" });
    return;
  }

  const { hash } = (req.body ?? {}) as { hash?: unknown };
  if (typeof hash !== "string" || hash.length === 0) {
    res.status(400).json({ status: false, error: "Hash is required for PDF generation" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = getProtectMeWellApiKey();
  } catch {
    res.status(500).json({ status: false, error: "server_not_configured" });
    return;
  }

  try {
    const upstream = await fetch(`${PROTECTMEWELL_BASE_URL}/api/v1/k-point/generate_pdf`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hash }),
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      const errObj = (data && typeof data === "object" ? data : {}) as { error?: string };
      res.status(upstream.status).json({
        status: false,
        error: errObj.error || "Failed to generate PDF",
        details: data,
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[generate-pdf] upstream failed:", message);
    res.status(502).json({
      status: false,
      error: "Failed to generate PDF",
      details: message,
    });
  }
}
