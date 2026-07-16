// ── Excel in/out ──────────────────────────────────────────────────────
// Export: ExcelJS — fully styled LOC workbook (Summary · Register · Issues),
// canonical GATE schema so it round-trips with the pipeline and SharePoint.
// Import: SheetJS — tolerant header mapping for legacy registers.
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { rating, todayISO, ageDays, ZGRACE, CADENCE, genTitle } from "./logic.js";

export const REG_COLS = ["Register ID","Tournament","Title","Cause","Event","Consequence","Lead FA","Contributing FAs","Category","City / Venue Scope","Likelihood","Impact","Score","Rating","Response Strategy","Response Actions","Risk Owner","Target Date","Status","Date Raised","Last Reviewed","Review Cadence (days)","Source Refs","Latest Mitigation Update","History","Residual L","Residual I"];

const d10 = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : "");

const A = (h) => ({ argb: "FF" + h });
const TEAL = "065C5D", GOLD = "C88214", TGREEN = "00937B", GREEN = "007542",
      HIGH = "D97A1A", CRIT = "9C1F1F", GREY = "595959", LINE = "C9C9C9", INK = "1A1A1A";
const RATE_FILL = { Critical: CRIT, High: HIGH, Medium: GOLD, Low: GREEN };
const STAT_FILL = { Open: TGREEN, Mitigating: GOLD, Escalated: CRIT, Closed: GREY, Resolved: GREEN };
const F = (o = {}) => ({ name: "Barlow", size: 9, color: A(INK), ...o });
const fillOf = (h) => ({ type: "pattern", pattern: "solid", fgColor: A(h) });
const thin = { style: "thin", color: A(LINE) };
const BOX = { top: thin, bottom: thin, left: thin, right: thin };

const bandRow = (ws, row, lastCol, text, h, size = 9) => {
  ws.mergeCells(row, 1, row, lastCol);
  const c = ws.getCell(row, 1);
  c.value = text; c.font = F({ bold: true, color: A("FFFFFF"), size });
  c.alignment = { vertical: "middle" };
  for (let i = 1; i <= lastCol; i++) ws.getCell(row, i).fill = fillOf(h === GOLD ? GOLD : TEAL);
  if (h === GOLD) for (let i = 1; i <= lastCol; i++) ws.getCell(row, i).fill = fillOf(GOLD);
};
const goldRule = (ws, row, lastCol) => {
  ws.mergeCells(row, 1, row, lastCol);
  for (let i = 1; i <= lastCol; i++) ws.getCell(row, i).fill = fillOf(GOLD);
  ws.getRow(row).height = 3.5;
};
const chip = (cell, fillHex) => {
  cell.fill = fillOf(fillHex);
  cell.font = F({ bold: true, color: A("FFFFFF") });
  cell.alignment = { horizontal: "center", vertical: "middle" };
};

export const buildRegisterWorkbook = (rows, issues) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AC27 Risk Console";
  const now = new Date();
  const stamp = `${todayISO()} ${now.toTimeString().slice(0, 5)}`;
  const open = rows.filter((r) => r.Status !== "Closed");
  const nRate = (k) => open.filter((r) => r.Rating === k).length;
  let inCad = 0, forgotten = 0;
  open.forEach((r) => { const a = ageDays(r.LastReviewed), cad = +r.CadenceDays || 30;
    if (a <= cad) inCad++; else if (a > cad + ZGRACE) forgotten++; });
  const kpiRev = open.length ? Math.round((100 * inCad) / open.length) : 100;

  // ── Summary ──
  const sm = wb.addWorksheet("Summary", { properties: { tabColor: A(GOLD) }, views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 } });
  [2, 30, 12, 3, 30, 12].forEach((w, i) => (sm.getColumn(i + 1).width = w));
  bandRow(sm, 1, 6, "AFC ASIAN CUP SAUDI ARABIA 2027  ·  LOCAL ORGANISING COMMITTEE  ·  PMO — RISK & REPORTING", TEAL);
  sm.getRow(1).height = 20;
  sm.mergeCells("A2:D2");
  sm.getCell("A2").value = "RISK REGISTER — EXPORT";
  sm.getCell("A2").font = F({ bold: true, size: 17, color: A(TEAL) });
  sm.mergeCells("E2:F2");
  sm.getCell("E2").value = `Exported ${stamp}`;
  sm.getCell("E2").font = F({ size: 9, color: A(GREY) });
  sm.getCell("E2").alignment = { horizontal: "right", vertical: "middle" };
  sm.getRow(2).height = 24;
  goldRule(sm, 3, 6);
  const put = (r, col, label, value, fillHex) => {
    const lc = sm.getCell(r, col), vc = sm.getCell(r, col + 1);
    lc.value = label; vc.value = value;
    lc.border = BOX; vc.border = BOX;
    vc.font = F({ bold: true, size: 11, color: A(TEAL) });
    vc.alignment = { horizontal: "center", vertical: "middle" };
    if (fillHex) chip(lc, fillHex); else lc.font = F({ bold: true });
  };
  put(5, 2, "Open risks", open.length); put(5, 5, "Reviewed on time", `${kpiRev}%`);
  put(6, 2, "Critical", nRate("Critical"), CRIT); put(6, 5, "Escalated", open.filter((r) => r.Status === "Escalated").length);
  put(7, 2, "High", nRate("High"), HIGH); put(7, 5, "Forgotten (overdue 14d+)", forgotten);
  put(8, 2, "Medium", nRate("Medium"), GOLD); put(8, 5, "Open issues", (issues || []).filter((i) => i.Status === "Open").length);
  put(9, 2, "Low", nRate("Low"), GREEN); put(9, 5, "Total rows (incl. closed)", rows.length);
  sm.mergeCells("B11:F11");
  sm.getCell("B11").value = "Generated from the AC27 Risk Console. Health rule: never row count — duplicates caught early, everything reviewed on time, nothing forgotten.";
  sm.getCell("B11").font = F({ size: 8.5, italic: true, color: A(GREY) });
  sm.getCell("B11").alignment = { wrapText: true, vertical: "top" };

  // ── Register ──
  const nCols = REG_COLS.length;
  const ws = wb.addWorksheet("Register", {
    properties: { tabColor: A(TEAL) },
    views: [{ state: "frozen", xSplit: 2, ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "4:4" },
  });
  [11, 10, 32, 30, 30, 30, 20, 18, 20, 13, 9, 7, 7, 9, 14, 32, 20, 11, 11, 11, 11, 8, 18, 32, 36, 9, 9]
    .forEach((w, i) => (ws.getColumn(i + 1).width = w));
  bandRow(ws, 1, nCols, "AFC ASIAN CUP SAUDI ARABIA 2027  ·  LOCAL ORGANISING COMMITTEE  ·  PMO — RISK & REPORTING", TEAL);
  ws.getRow(1).height = 20;
  ws.mergeCells(2, 1, 2, 15);
  ws.getCell(2, 1).value = "RISK REGISTER";
  ws.getCell(2, 1).font = F({ bold: true, size: 15, color: A(TEAL) });
  ws.mergeCells(2, 16, 2, nCols);
  ws.getCell(2, 16).value = `${open.length} open / ${rows.length} total  ·  exported ${stamp}`;
  ws.getCell(2, 16).font = F({ size: 9, color: A(GREY) });
  ws.getCell(2, 16).alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(2).height = 22;
  goldRule(ws, 3, nCols);
  REG_COLS.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h; c.fill = fillOf(TEAL); c.border = BOX;
    c.font = F({ bold: true, color: A("FFFFFF"), size: 8.5 });
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  ws.getRow(4).height = 30;
  const WRAP = new Set([3, 4, 5, 6, 16, 23, 24, 25]);
  const CENTER = new Set([2, 11, 12, 13, 18, 20, 21, 22, 26, 27]);
  rows.forEach((r, ri) => {
    const vals = [r.RegisterID, r.Tournament || "", r.Title, r.Cause, r.EventClause, r.Consequence, r.LeadFA, r.ContributingFAs,
      r.Category, r.Scope, r.Likelihood, r.Impact, r.Score, r.Rating, r.Strategy, r.Actions, r.RiskOwner,
      d10(r.TargetDate), r.Status, d10(r.DateRaised), d10(r.LastReviewed), r.CadenceDays, r.SourceRefs,
      r.MitigationUpdate || "", r.History];
    const row = ws.getRow(5 + ri);
    vals.forEach((v, ci) => {
      const c = row.getCell(ci + 1);
      c.value = v === undefined || v === null ? "" : v;
      c.border = BOX; c.font = F();
      c.alignment = { vertical: "top", wrapText: WRAP.has(ci + 1), horizontal: CENTER.has(ci + 1) ? "center" : "left" };
      if (ci + 1 === 1) c.font = F({ bold: true, color: A(TEAL) });
      if (ci + 1 === 14 && RATE_FILL[v]) chip(c, RATE_FILL[v]);
      if (ci + 1 === 19 && STAT_FILL[v]) chip(c, STAT_FILL[v]);
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: nCols } };

  // ── Issues ──
  const IC = ["Issue ID", "Date Logged", "FA", "Title", "Description", "Parent Risk ID", "Owner", "Status", "Target Date", "Source Ref"];
  const is = wb.addWorksheet("Issues", { properties: { tabColor: A(TGREEN) }, views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  [10, 12, 20, 30, 44, 13, 22, 11, 12, 14].forEach((w, i) => (is.getColumn(i + 1).width = w));
  bandRow(is, 1, IC.length, "AFC ASIAN CUP SAUDI ARABIA 2027  ·  LOCAL ORGANISING COMMITTEE  ·  PMO — RISK & REPORTING", TEAL);
  is.getRow(1).height = 20;
  is.mergeCells(2, 1, 2, IC.length);
  is.getCell(2, 1).value = "ISSUES LOG";
  is.getCell(2, 1).font = F({ bold: true, size: 15, color: A(TEAL) });
  is.getRow(2).height = 22;
  goldRule(is, 3, IC.length);
  IC.forEach((h, i) => {
    const c = is.getCell(4, i + 1);
    c.value = h; c.fill = fillOf(GOLD); c.border = BOX;
    c.font = F({ bold: true, color: A("FFFFFF"), size: 8.5 });
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  });
  is.getRow(4).height = 24;
  (issues || []).forEach((it, ri) => {
    const vals = [it.IssueID, d10(it._created || it.date || ""), it.FA, it.Title, it.Description,
      it.ParentRiskID, it.IssueOwner || it.Owner || "", it.Status, d10(it.TargetDate), it.SourceRef];
    vals.forEach((v, ci) => {
      const c = is.getCell(5 + ri, ci + 1);
      c.value = v ?? ""; c.border = BOX; c.font = F();
      c.alignment = { vertical: "top", wrapText: ci === 4 || ci === 3 };
      if (ci === 7 && STAT_FILL[v]) chip(c, STAT_FILL[v]);
    });
  });
  return wb;
};

export const exportRegister = async (rows, issues) => {
  try {
    const wb = buildRegisterWorkbook(rows, issues);
    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `register_${todayISO()}.xlsx`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { console.error("export failed", e); }
};

// header aliases → internal field (normalised: lowercase, alphanumerics only)
const ALIAS = {
  RegisterID: ["registerid","riskid","id","ref","reference","riskref","riskno","risknumber","\u0627\u0644\u0645\u0639\u0631\u0641","\u0627\u0644\u0631\u0642\u0645","\u0631\u0642\u0645\u0627\u0644\u062e\u0637\u0631","\u0627\u0644\u0645\u0631\u062c\u0639"],
  Tournament: ["tournament","competition","programme","program","البطولة","المسابقة"],
  Title: ["title","risktitle","riskissuetitle","risk","riskname","description","riskdescription","\u0627\u0644\u0639\u0646\u0648\u0627\u0646","\u0627\u0644\u062e\u0637\u0631","\u0639\u0646\u0648\u0627\u0646\u0627\u0644\u062e\u0637\u0631","\u0627\u0633\u0645\u0627\u0644\u062e\u0637\u0631"],
  Cause: ["cause","causebecauseof","rootcause","\u0627\u0644\u0633\u0628\u0628","\u0627\u0644\u0623\u0633\u0628\u0627\u0628"],
  EventClause: ["event","eventclause","riskevent","eventthereisariskthat","\u0627\u0644\u062d\u062f\u062b","\u0648\u0635\u0641\u0627\u0644\u062e\u0637\u0631","\u0627\u0644\u0648\u0635\u0641"],
  Consequence: ["consequence","consequenceresultingin","effect","impactdescription","\u0627\u0644\u0646\u062a\u064a\u062c\u0629","\u0627\u0644\u062a\u0628\u0639\u0627\u062a","\u0627\u0644\u0639\u0648\u0627\u0642\u0628","\u0627\u0644\u0627\u062b\u0631\u0627\u0644\u0646\u0627\u062a\u062c","\u0627\u0644\u0623\u062b\u0631\u0627\u0644\u0646\u0627\u062a\u062c"],
  LeadFA: ["leadfa","functionalarea","fa","department","area","team","\u0627\u0644\u0627\u062f\u0627\u0631\u0629","\u0627\u0644\u0625\u062f\u0627\u0631\u0629","\u0627\u0644\u062c\u0647\u0629","\u0627\u0644\u0627\u062f\u0627\u0631\u0629\u0627\u0644\u0648\u0638\u064a\u0641\u064a\u0629","\u0627\u0644\u0625\u062f\u0627\u0631\u0629\u0627\u0644\u0648\u0638\u064a\u0641\u064a\u0629","\u0627\u0644\u0642\u0633\u0645"],
  ContributingFAs: ["contributingfas","contributors"],
  Category: ["category","riskcategory","type","\u0627\u0644\u0641\u0626\u0629","\u0627\u0644\u062a\u0635\u0646\u064a\u0641","\u0627\u0644\u0646\u0648\u0639"],
  Scope: ["cityvenuescope","scope","location","city","venue","site","\u0627\u0644\u0646\u0637\u0627\u0642","\u0627\u0644\u0645\u062f\u064a\u0646\u0629","\u0627\u0644\u0645\u0648\u0642\u0639"],
  Likelihood: ["likelihood","likelihood15","probability","prob","l","\u0627\u0644\u0627\u062d\u062a\u0645\u0627\u0644\u064a\u0629","\u0627\u0644\u0627\u062d\u062a\u0645\u0627\u0644"],
  Impact: ["impact","impact15","severity","i","\u0627\u0644\u0623\u062b\u0631","\u0627\u0644\u0627\u062b\u0631","\u0627\u0644\u0634\u062f\u0629","\u0627\u0644\u062a\u0623\u062b\u064a\u0631"],
  Score: ["score","riskscore","rag","exposure","\u0627\u0644\u062f\u0631\u062c\u0629","\u0627\u0644\u0646\u0642\u0627\u0637"],
  Rating: ["rating","riskrating","level","risklevel","priority","\u0627\u0644\u0645\u0633\u062a\u0648\u0649","\u062f\u0631\u062c\u0629\u0627\u0644\u062e\u0637\u0648\u0631\u0629","\u0627\u0644\u062e\u0637\u0648\u0631\u0629"],
  Strategy: ["responsestrategy","strategy","treatment","responsetype","\u0627\u0644\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629","\u0627\u0633\u062a\u0631\u0627\u062a\u064a\u062c\u064a\u0629\u0627\u0644\u0627\u0633\u062a\u062c\u0627\u0628\u0629"],
  Actions: ["responseactions","proposedresponseactions","mitigation","mitigationactions","mitigations","actions","responseplan","controls","controlmeasures","\u0627\u0644\u0627\u062c\u0631\u0627\u0621\u0627\u062a","\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a","\u062e\u0637\u0629\u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629","\u0627\u0644\u0636\u0648\u0627\u0628\u0637","\u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629"],
  RiskOwner: ["riskowner","owner","actionowner","responsible","\u0627\u0644\u0645\u0627\u0644\u0643","\u0627\u0644\u0645\u0633\u0624\u0648\u0644","\u0645\u0627\u0644\u0643\u0627\u0644\u062e\u0637\u0631"],
  TargetDate: ["targetdate","duedate","target","deadline","\u0627\u0644\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641","\u0627\u0644\u0645\u0648\u0639\u062f","\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642"],
  Status: ["status","riskstatus","state","\u0627\u0644\u062d\u0627\u0644\u0629","\u0627\u0644\u0648\u0636\u0639"],
  DateRaised: ["dateraised","raised","created","dateidentified","identified","dateadded","opendate","\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u062a\u0633\u062c\u064a\u0644","\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u062a\u062d\u062f\u064a\u062f","\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u0627\u062f\u0631\u0627\u062c","\u062a\u0627\u0631\u064a\u062e\u0627\u0644\u0625\u062f\u0631\u0627\u062c"],
  LastReviewed: ["lastreviewed","reviewed","lastreview","lastupdated","reviewdate","\u0627\u062e\u0631\u0645\u0631\u0627\u062c\u0639\u0629","\u0622\u062e\u0631\u0645\u0631\u0627\u062c\u0639\u0629","\u0627\u062e\u0631\u062a\u062d\u062f\u064a\u062b","\u0622\u062e\u0631\u062a\u062d\u062f\u064a\u062b"],
  CadenceDays: ["reviewcadencedays","cadence","reviewfrequency"],
  SourceRefs: ["sourcerefs","source","references","origin","\u0627\u0644\u0645\u0635\u062f\u0631","\u0627\u0644\u0645\u0635\u0627\u062f\u0631","\u0627\u0644\u0645\u0631\u062c\u0639\u064a\u0629"],
  MitigationUpdate: ["latestmitigationupdate","mitigationupdate","latestupdate","progressupdate","statusupdate","progress","update","\u0627\u0644\u062a\u062d\u062f\u064a\u062b","\u0627\u062e\u0631\u0645\u0633\u062a\u062c\u062f\u0627\u062a","\u0622\u062e\u0631\u0645\u0633\u062a\u062c\u062f\u0627\u062a","\u062a\u062d\u062f\u064a\u062b\u0627\u0644\u0645\u0639\u0627\u0644\u062c\u0629","\u0627\u062e\u0631\u062a\u062d\u062f\u064a\u062b\u0644\u0644\u0645\u0639\u0627\u0644\u062c\u0629"],
  History: ["history","log","auditlog","comments","notes","\u0627\u0644\u0633\u062c\u0644","\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a","\u0627\u0644\u062a\u0627\u0631\u064a\u062e"],
};
const norm = (h) => String(h || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
const RATE_WORDS = { critical: "Critical", veryhigh: "Critical", high: "High", medium: "Medium", moderate: "Medium", low: "Low", verylow: "Low" };

export const parseRegisterFile = async (file) => {
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const ws = wb.Sheets["Register"] || wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const report = { total: raw.length, dropped: 0, notes: [] };
  if (!raw.length) { report.notes.push("sheet has no data rows"); return { rows: [], report }; }

  // build header → field map
  const map = {};
  const headers = Object.keys(raw[0]);
  for (const h of headers) {           // pass 1: exact alias
    const n = norm(h);
    for (const [field, aliases] of Object.entries(ALIAS)) {
      if (n === norm(field) || aliases.includes(n)) { if (!(field in map)) map[field] = h; break; }
    }
  }
  for (const h of headers) {           // pass 2: fuzzy containment for the unmapped
    if (Object.values(map).includes(h)) continue;
    const n = norm(h); if (n.length < 4) continue;
    let best = null, bestLen = 0;
    for (const [field, aliases] of Object.entries(ALIAS)) {
      if (field in map) continue;
      for (const a of [norm(field), ...aliases]) {
        if (a.length >= 4 && (n.includes(a) || a.includes(n)) && a.length > bestLen) { best = field; bestLen = a.length; }
      }
    }
    if (best) map[best] = h;
  }
  if (!map.Title && !map.EventClause) { report.notes.push("no column recognisable as a risk title or description"); return { rows: [], report }; }

  const rows = [];
  for (const src of raw) {
    const g = (f) => (map[f] !== undefined ? src[map[f]] : "");
    let title = String(g("Title")).trim();
    if (!title) title = genTitle(String(g("EventClause")));
    if (!title) { report.dropped++; continue; }
    let L = parseInt(g("Likelihood")), I = parseInt(g("Impact"));
    if (!(L >= 1 && L <= 5)) L = "";
    if (!(I >= 1 && I <= 5)) I = "";
    let score = L && I ? L * I : parseInt(g("Score")) || "";
    let rate = L && I ? rating(L * I) : RATE_WORDS[norm(g("Rating"))] || (score ? rating(score) : "");
    const AR_ST = { "مفتوح": "Open", "قيدالمعالجة": "Mitigating", "مصعد": "Escalated", "مُصعّد": "Escalated", "مغلق": "Closed", "مُغلق": "Closed" };
    const rawSt = norm(g("Status"));
    const status = AR_ST[rawSt] || ["Open","Mitigating","Escalated","Closed"].find((s) => rawSt.startsWith(norm(s))) || "Open";
    rows.push({
      RegisterID: String(g("RegisterID")).trim(),
      Tournament: String(g("Tournament")).trim().toUpperCase(),
      Tournament: ["AC27","GC27"].find((x) => norm(g("Tournament")).includes(x.toLowerCase())) || "",
      Title: title, Cause: String(g("Cause")).trim(), EventClause: String(g("EventClause")).trim(),
      Consequence: String(g("Consequence")).trim(), LeadFA: String(g("LeadFA")).trim(),
      ContributingFAs: String(g("ContributingFAs")).trim(), Category: String(g("Category")).trim(),
      Scope: String(g("Scope")).trim(), Likelihood: L, Impact: I, Score: score, Rating: rate,
      Strategy: String(g("Strategy")).trim(), Actions: String(g("Actions")).trim(),
      RiskOwner: String(g("RiskOwner")).trim(), TargetDate: d10(g("TargetDate")),
      Status: status, DateRaised: d10(g("DateRaised")), LastReviewed: d10(g("LastReviewed")),
      CadenceDays: parseInt(g("CadenceDays")) || (rate ? CADENCE[rate] : 30),
      SourceRefs: String(g("SourceRefs")).trim() || "Excel migration",
      MitigationUpdate: String(g("MitigationUpdate")).trim(),
      History: String(g("History")).trim(),
      ResidualL: parseInt(g("ResidualL")) || "",
      ResidualI: parseInt(g("ResidualI")) || "",
    });
  }
  report.mapped = Object.keys(map).length;
  if (report.dropped) report.notes.push(`${report.dropped} row(s) without a title dropped`);
  return { rows, report };
};
