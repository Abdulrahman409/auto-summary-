// ── Domain logic (ported from PIP-RSK-01 / APP-RSK-01 v0.9, behaviour-identical) ──
export const CADENCE = { Critical: 7, High: 7, Medium: 30, Low: 30 };
export const ZGRACE = 14, DUP_LIKELY = 70, DUP_POSSIBLE = 45;
export const rating = (s) => (s >= 16 ? "Critical" : s >= 10 ? "High" : s >= 5 ? "Medium" : "Low");
export const pad4 = (n) => String(n).padStart(4, "0");
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isoWeek = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, "0")}`;
};
export const ageDays = (iso) => (iso ? Math.floor((new Date(todayISO()) - new Date(String(iso).slice(0,10))) / 864e5) : 999);
const STOP = new Set(("the a an of to in on at for and or that this is are be there risk may could might will " +
  "في من على إلى عن أن إن هناك خطر مما يؤدي قد كان تكون بسبب").split(" "));
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/g, " ").replace(/\s+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((t) => (t.length > 2 || /[\u0600-\u06FF]/.test(t)) && !STOP.has(t)));
const bigrams = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; };
export const sim = (a, b) => {
  const ta = toks(a), tb = toks(b);
  let inter = 0; ta.forEach((t) => tb.has(t) && inter++);
  const uni = ta.size + tb.size - inter, jac = uni ? inter / uni : 0;
  const na = norm(a), nb = norm(b), ba = bigrams(na), bb = bigrams(nb);
  let bi = 0, sa = 0, sb = 0; ba.forEach((v) => (sa += v)); bb.forEach((v) => (sb += v));
  ba.forEach((v, k) => { if (bb.has(k)) bi += Math.min(v, bb.get(k)); });
  const dice = sa + sb ? (2 * bi) / (sa + sb) : 0;
  return Math.round(100 * (0.55 * jac + 0.45 * dice));
};
export const TASK_RE = /^\s*(need to|we need|we must|must |please|ensure|provide|arrange|procure|hire|buy)/i;
export const dupScreen = (title, event, registerRows) => registerRows
  .filter((r) => r.Status !== "Closed")
  .map((r) => ({ r, sc: sim(`${title} ${event}`, `${r.Title} ${r.EventClause}`) }))
  .sort((a, b) => b.sc - a.sc).slice(0, 3).filter((d) => d.sc >= DUP_POSSIBLE);

export const PHASES = [
  { t: 30, key: "t30", cad: { Critical: 1, High: 2, Medium: 7, Low: 14 } },
  { t: 90, key: "t90", cad: { Critical: 3, High: 3, Medium: 14, Low: 30 } },
];
export const daysToKickoff = (iso) => Math.ceil((new Date(iso) - new Date(todayISO())) / 864e5);
export const phaseOf = (dtk) => (dtk <= 30 ? PHASES[0] : dtk <= 90 ? PHASES[1] : null);
export const effCadence = (rat, stored, dtk) => {
  const base = +stored || CADENCE[rat] || 30;
  const ph = phaseOf(dtk);
  return ph ? Math.min(base, ph.cad[rat] || base) : base;
};
export const hygieneGaps = (r) => {
  const g = [];
  if (!r.RiskOwner) g.push("g_owner");
  if (!r.Scope) g.push("g_scope");
  if (!r.Category) g.push("g_cat");
  if (!(r.Likelihood >= 1 && r.Impact >= 1)) g.push("g_li");
  if (!r.TargetDate) g.push("g_target");
  else if (r.Status !== "Closed" && String(r.TargetDate).slice(0, 10) < todayISO()) g.push("g_past");
  return g;
};

export const genTitle = (event) => {
  let x = String(event || "").replace(/^there is a risk that\s*/i, "").replace(/^هناك خطر أن\s*/, "");
  x = x.replace(/[\s,.;:]+$/g, "").replace(/\s+/g, " ").trim();
  if (!x) return "";
  x = x.charAt(0).toUpperCase() + x.slice(1);
  if (x.length > 72) { x = x.slice(0, 72); const i = x.lastIndexOf(" "); if (i > 40) x = x.slice(0, i); x += "…"; }
  return x;
};
