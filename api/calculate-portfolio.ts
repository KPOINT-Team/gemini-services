import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setProtectMeWellCors,
  handleProtectMeWellPreflight,
  enforceOrigin,
  getProtectMeWellApiKey,
  PROTECTMEWELL_BASE_URL,
} from "../lib/protectmewell.js";

interface PortfolioFormData {
  name?: string;
  location?: string;
  city?: string;
  current_age?: number | string;
  age?: number | string;
  pincode?: number | string;
  annual_income?: number;
  annualIncome?: number;
  premium?: number;
  sum_assured?: number;
}

interface MappedPortfolioPayload {
  name: string;
  location: string;
  current_age: number | string | undefined;
  pincode: number;
  annual_income: number;
  premium: number;
  sum_assured: number;
}

function mapFormDataToApi(formData: PortfolioFormData): MappedPortfolioPayload {
  const rawPincode = formData.pincode != null ? String(formData.pincode).replace(/\s/g, "") : "400001";
  return {
    name: formData.name || "Sayali Ubale",
    location: formData.location || formData.city || "Chennai",
    current_age: formData.current_age ?? formData.age,
    pincode: parseInt(rawPincode, 10),
    annual_income: formData.annual_income ?? (formData.annualIncome || 0) * 100000,
    premium: formData.premium ?? 600000,
    sum_assured: formData.sum_assured ?? 200000,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleProtectMeWellPreflight(req, res)) return;
  setProtectMeWellCors(req, res);

  if (!enforceOrigin(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ status: false, error: "method_not_allowed" });
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
    const formData = (req.body ?? {}) as PortfolioFormData;
    const apiData = mapFormDataToApi(formData);

    const upstream = await fetch(`${PROTECTMEWELL_BASE_URL}/api/v1/k-point/calculation`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiData),
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
        error: errObj.error || "Failed to calculate portfolio",
        details: data,
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[calculate-portfolio] upstream failed:", message);
    res.status(502).json({
      status: false,
      error: "Failed to calculate portfolio",
      details: message,
    });
  }
}
