import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  setProtectMeWellCors,
  handleProtectMeWellPreflight,
  enforceOrigin,
  getProtectMeWellApiKey,
} from "../lib/protectmewell.js";

// Universal Sompo analysis endpoint (see API REFERENCE Dt 07.10.2025).
const SOMPO_ANALYSIS_URL =
  "https://demo.protectmewell.com/api/v3/universal-sompo/analysis";

// ---------------------------------------------------------------------------
// Intermediate payload shape sent by video7.html (buildPortfolioBody).
// ---------------------------------------------------------------------------
interface LifestyleDetail {
  freq?: string;
  qty?: string;
}
interface LifestyleBranch {
  flag?: string; // "Y" | "N"
  substances?: string[];
  cig?: LifestyleDetail;
  gutkha?: LifestyleDetail;
  narc?: LifestyleDetail;
  beer?: LifestyleDetail;
  wine?: LifestyleDetail;
  hard?: LifestyleDetail;
}
interface Dependants {
  spouse?: boolean;
  children?: number;
  parents?: string; // "N" | "F" | "M" | "B"
}
interface Illness {
  diabetes?: boolean;
  bp?: boolean;
  other?: string;
  none?: boolean;
}
interface IntermediatePayload {
  city?: string;
  pincode?: number | string;
  marital_status?: string; // "Single" | "Married" | ...
  gender?: string; // "Male" | "Female" | "Other"
  dob?: string; // DD/MM/YYYY
  weight?: string | number;
  height?: string | number;
  income_bracket?: string | null; // "<5L" | "5-10L" | "10-25L" | "25L+"
  dependants?: Dependants;
  cover_for?: string[];
  illness?: Illness;
  parents_dependent?: string; // "Y" | "N"
  smoke?: LifestyleBranch;
  drink?: LifestyleBranch;
  spouse_smoke?: LifestyleBranch;
  spouse_drink?: LifestyleBranch;
}

// ---------------------------------------------------------------------------
// Option-label maps: form value -> exact Universal Sompo option string.
// (The API matches these strings exactly; see the parameter option lists.)
// ---------------------------------------------------------------------------
// NOTE on option strings: the Universal Sompo `analysis` endpoint validates each
// habit value against an option table whose spacing is HIGHLY irregular and does
// NOT match the API REFERENCE doc (Dt 07.10.2025). As of the UI update, the form
// (video7.html) emits the EXACT API quantity strings as radio `value=` attributes
// (verified against the live API — each returns 200 in isolation), so the proxy
// passes `detail.qty` through verbatim — no quantity remapping here.
//
// The only value that still needs mapping is the *frequency* for narcotics (the one
// freq-only branch, which has no quantity): the API's sole accepted catch-all is
// "Occasional/ weekly/Monthly". (Note "Daily" is NOT accepted by the API.) Every UI
// frequency choice maps to that single accepted string.
const FREQ_MAP: Record<string, string> = {
  Daily: "Occasional/ weekly/Monthly",
  Occasional: "Occasional/ weekly/Monthly",
  Weekly: "Occasional/ weekly/Monthly",
  Monthly: "Occasional/ weekly/Monthly",
};

// annual income bracket -> API label
const INCOME_MAP: Record<string, string> = {
  "<5L": "<=5 Lakhs",
  "5-10L": ">5 Lakhs and <=10 Lakhs",
  "10-25L": ">10 Lakhs and <=25 Lakhs",
  "25L+": ">25 Lakhs",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NONE = "None";

function freqLabel(d?: LifestyleDetail): string {
  if (!d || !d.freq) return NONE;
  return FREQ_MAP[d.freq] || d.freq;
}

// A lifestyle value for one person = the quantity verbatim if this branch has one
// (the UI already emits exact API strings), else the mapped frequency.
// `hasQty` distinguishes quantity-bearing branches (cig/gutkha/beer/wine/liquor)
// from the freq-only branch (narcotics).
function lifestyleValue(
  branch: LifestyleBranch | undefined,
  key: keyof LifestyleBranch,
  hasQty: boolean,
): string {
  if (!branch || branch.flag !== "Y") return NONE;
  if (!(branch.substances || []).includes(key as string)) return NONE;
  const detail = branch[key] as LifestyleDetail | undefined;
  if (!detail) return NONE;
  if (hasQty && detail.qty) return detail.qty; // pass UI's exact API string through
  return freqLabel(detail); // freq-only (e.g. narcotics)
}

function parentsCount(code?: string): number {
  if (code === "B") return 2;
  if (code === "F" || code === "M") return 1;
  return 0;
}

// Build a per-person array [Self, Spouse?, ...Kids(pad), ...Parents(parentPad)].
// Self + Spouse carry real values; children are padded with `pad` and parents with
// `parentPad` (defaults to `pad`). Parents need their own padding for fields like
// DOB, where the upstream requires a parent to be older than the child placeholder.
function perPerson<T>(
  self: T,
  spouse: T | null,
  kids: number,
  parents: number,
  pad: T,
  parentPad: T = pad,
): T[] {
  const out: T[] = [self];
  if (spouse !== null) out.push(spouse);
  for (let i = 0; i < kids; i++) out.push(pad);
  for (let i = 0; i < parents; i++) out.push(parentPad);
  return out;
}

function buildSompoBody(p: IntermediatePayload) {
  const dep = p.dependants || {};

  // Who enters the quote is driven by `cover_for` (who the user wants insured), not
  // `dependants` (who merely relies on them). A person can be a dependant without
  // being covered — e.g. parents declared as dependants while the user only wants to
  // cover Self; those parents are then NOT in this quote and need no DOB/details.
  // `dependants` still supplies the details (kid count, which parents) for whoever
  // IS covered. NOTE: the upstream requires the Dependent_*/count fields to match the
  // per-person array lengths, so these counts must be cover-driven (see return block).
  const coverFor = p.cover_for || [];
  const covers = (who: string) => coverFor.includes(who);

  const hasSpouse = covers("Spouse");
  const kids = covers("Children") ? Number(dep.children) || 0 : 0;
  const parents = covers("Parents") ? parentsCount(dep.parents) : 0;

  const smoke = p.smoke || {};
  const drink = p.drink || {};
  const spSmoke = p.spouse_smoke || {};
  const spDrink = p.spouse_drink || {};

  // ---- Lifestyle per-person arrays (Self, Spouse, kids None, parents None) ----
  const lt = (
    selfBranch: LifestyleBranch,
    spouseBranch: LifestyleBranch,
    key: keyof LifestyleBranch,
    hasQty: boolean,
  ) =>
    perPerson(
      lifestyleValue(selfBranch, key, hasQty),
      hasSpouse ? lifestyleValue(spouseBranch, key, hasQty) : null,
      kids,
      parents,
      NONE,
    );

  const smoker = lt(smoke, spSmoke, "cig", true);
  const tobacco = lt(smoke, spSmoke, "gutkha", true);
  const narcotics = lt(smoke, spSmoke, "narc", false); // freq-only
  const alcohol = lt(drink, spDrink, "beer", true);
  const wine = lt(drink, spDrink, "wine", true);
  const liquor = lt(drink, spDrink, "hard", true);

  // Whether anyone has any smoking/drinking habit.
  const anyHabit =
    smoke.flag === "Y" ||
    drink.flag === "Y" ||
    (hasSpouse && (spSmoke.flag === "Y" || spDrink.flag === "Y"));

  // ---- Demographics per-person arrays ----
  // We only collect Self (+ derive Spouse where possible). Children/parents get
  // placeholder demographics so array lengths line up with the family composition.
  const PLACEHOLDER_DOB = "01/01/2015"; // ~child age (kids placeholder)
  // The upstream validates parent age into a 37..55 window (rejects "<=36" and
  // ">55"). Parent DOB is not collected by the form, so use a placeholder squarely
  // mid-window (~age 45). Verified accepted by the live API.
  const PLACEHOLDER_PARENT_DOB = "01/01/1981";
  const PLACEHOLDER_W = 60;
  const PLACEHOLDER_H = 160;

  const selfGender = p.gender || "Male";
  const spouseGender = selfGender === "Male" ? "Female" : "Male";

  const gender = perPerson(
    selfGender,
    hasSpouse ? spouseGender : null,
    kids,
    parents,
    "Male",
  );
  const dob = perPerson(
    p.dob || "",
    hasSpouse ? p.dob || "" : null, // spouse DOB not collected — reuse self as placeholder
    kids,
    parents,
    PLACEHOLDER_DOB,
    PLACEHOLDER_PARENT_DOB, // parents must be >36 per upstream validation
  );
  const weight = perPerson(
    Number(p.weight) || PLACEHOLDER_W,
    hasSpouse ? PLACEHOLDER_W : null,
    kids,
    parents,
    PLACEHOLDER_W,
  );
  const height = perPerson(
    Number(p.height) || PLACEHOLDER_H,
    hasSpouse ? PLACEHOLDER_H : null,
    kids,
    parents,
    PLACEHOLDER_H,
  );

  // ---- Health / PED ----
  // pedDeclared is free-text ("mention those details"), so any wording is fine
  // here. The `lifestyle` array, however, only accepts the exact enum:
  // None, Hypertension, Diabetes - Type 1, Diabetes - Type 2.
  const illness = p.illness || {};
  const pedParts: string[] = [];
  if (illness.diabetes) pedParts.push("Diabetes");
  if (illness.bp) pedParts.push("Hypertension");
  if (illness.other) pedParts.push(illness.other);
  const hasPed = pedParts.length > 0;

  // lifestyle (diseases) per-person — Self carries ONE declared value from the
  // API's enum, rest None. The form only captures a diabetes boolean (no
  // Type 1/2 split), so map it to "Diabetes - Type 1". Each person can carry
  // only one value, so prefer diabetes, then hypertension. (illness.other is
  // free-text and not a valid lifestyle enum value, so it's omitted here — it
  // still reaches the API via pedDeclared.)
  let lifestyleDisease = NONE;
  if (illness.diabetes) lifestyleDisease = "Diabetes - Type 1";
  else if (illness.bp) lifestyleDisease = "Hypertension";
  const lifestyle = perPerson(
    lifestyleDisease,
    hasSpouse ? NONE : null,
    kids,
    parents,
    NONE,
  );

  const rawPincode =
    p.pincode != null ? String(p.pincode).replace(/\s/g, "") : "400001";

  return {
    city: (p.city || "Mumbai").toString(),
    pincode: parseInt(rawPincode, 10),
    marital_status: p.marital_status || "Single",
    // IMPORTANT: the upstream binds the Dependent_*/count fields to the per-person
    // arrays — Dependent_parents_count must equal the number of parents actually
    // present in the gender/dob/... arrays, or it returns 400 "failed in Model
    // Premium Updation" (verified against the live API). The arrays only contain
    // COVERED people, so these counts are necessarily cover-driven too. A dependant
    // who isn't covered simply isn't in this quote.
    FamilyFloater: hasSpouse || kids > 0 ? "Yes" : "No",
    doYouHaveDependents: hasSpouse || kids > 0 || parents > 0 ? "Yes" : "No",
    Dependent_Spouse: hasSpouse ? "Yes" : "No",
    Kids_count: kids,
    Dependent_parents_count: parents,
    gender,
    wishToCoverFamily: hasSpouse || kids > 0 || parents > 0 ? "Yes" : "No",
    dob,
    weight,
    height,
    annualIncome: p.income_bracket ? INCOME_MAP[p.income_bracket] || "" : "",

    ped: hasPed ? "Yes" : "No",
    pedDeclared: hasPed ? pedParts.join(", ") : "",

    tobaccoAndAlcohol: anyHabit ? "Yes" : "No",
    smoker,
    alcohol,
    wine,
    liquor,
    tobacco,
    narcotics,

    // Only "Yes" when a recognised lifestyle enum value is present; illness.other
    // alone (free text) does not populate the lifestyle array.
    LifestyleDiseases: lifestyleDisease !== NONE ? "Yes" : "No",
    lifestyle,

    AnyExistingHealthInsurance: "No",
    ExistingSumInsured: 0,
    WomenProposerDiscount: "No",
    OrganDonorDiscount: "No",
    ExistingCustomer: "No",
    SelfNotCover: "No",
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
    const formData = (req.body ?? {}) as IntermediatePayload;
    const sompoBody = buildSompoBody(formData);

    console.log("[calculate-portfolio] -> universal-sompo", JSON.stringify(sompoBody));

    // The upstream host (demo.protectmewell.com) intermittently fails to connect
    // (DNS/transient network errors surface as a thrown "fetch failed"). Retry the
    // request a few times on a THROWN error only — an HTTP response (even 4xx/5xx)
    // is a real answer and is never retried here.
    const MAX_ATTEMPTS = 4;
    let upstream: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        upstream = await fetch(SOMPO_ANALYSIS_URL, {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sompoBody),
        });
        break;
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[calculate-portfolio] upstream connect failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }
    }
    if (!upstream) throw lastErr ?? new Error("upstream_unreachable");

    const text = await upstream.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      const errObj = (data && typeof data === "object" ? data : {}) as {
        error?: string;
      };
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
