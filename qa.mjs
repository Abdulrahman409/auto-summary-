// QA harness — renders every exported component server-side in EN and AR
// against real mock data; fails on exceptions, "undefined" leaks, or NaN.
global.window = { location: { search: "", origin: "https://qa.local", pathname: "/", hash: "" } };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
global.sessionStorage = global.localStorage;
Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => {} } }, configurable: true });

// Bundle App.jsx → .qa/app.mjs so node can import it (JSX → automatic runtime).
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: ["src/App.jsx"],
  bundle: true,
  format: "esm",
  outfile: ".qa/app.mjs",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "react-dom", "exceljs", "xlsx", "@azure/msal-browser", "js-sha256"],
});

const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server.node");
const { STR } = await import("./src/i18n.js");
const { mockApi } = await import("./src/api.js");
const App = await import("./.qa/app.mjs");

const reg = await mockApi.listRegister();
const intake = await mockApi.listIntake();
const issues = await mockApi.listIssues();
const vals = await mockApi.listValidations();
const valMap = {};
[...vals].sort((a, b) => (a._created < b._created ? -1 : 1)).forEach((v) => (valMap[v.Title] = v));
const kpi = await mockApi.listKpi();
const me = mockApi.whoami();
const noop = () => {};
const { due, forgotten } = (() => {
  // recreate splitDue result via aged rows
  return { due: reg.filter((r) => r.RegisterID === "R-0729"), forgotten: reg.filter((r) => r.RegisterID === "R-0727") };
})();

store["myFA"] = "Security"; // FAView picks a real FA

const cases = [
  ["App(all)", App.default, { mode: "all" }],
  ["App(fa)", App.default, { mode: "fa" }],
  ["App(pmo)", App.default, { mode: "pmo" }],
  ["App(exec)", App.default, { mode: "exec" }],
];
const perLang = (t) => [
  ["Landing", App.Landing, { t, say: noop, mode: "all", onEnter: noop }],
  ["SubmitView", App.SubmitView, { t, reg, me, say: noop, onDone: noop, tour: "" }],
  ["MineView", App.MineView, { t, intake, me, reg }],
  ["FAView", App.FAView, { t, reg, me, say: noop, reload: noop, valMap }],
  ["PMO", App.PMO, { t, reg, intake, intakeWeek: intake, issues, say: noop, reload: noop, deep: null, clearDeep: noop, tour: "", valMap, regAll: reg }],
  ["Queue", App.Queue, { t, pending: intake.filter((s) => s.Status === "Pending triage"), decided: 0, reg, regAll: reg, say: noop, reload: noop }],
  ["RegisterTab", App.RegisterTab, { t, reg, say: noop, reload: noop, deep: null, clearDeep: noop, valMap }],
  ["ReviewRound", App.ReviewRound, { t, queue: [...forgotten, ...due], say: noop, onExit: noop }],
  ["ReviewRound(empty)", App.ReviewRound, { t, queue: [], say: noop, onExit: noop }],
  ["IssuesTab", App.IssuesTab, { t, issues, say: noop, reload: noop }],
  ["Health", App.Health, { t, reg, intake, issues, say: noop, reload: noop, dueCount: 2, onStartReview: noop, tour: "", valMap, regAll: reg }],
  ["Participation", App.Participation, { t, reg, intake, say: noop, valMap }],
  ["ExecView(all)", App.ExecView, { t, reg, regAll: reg, intake, issues, onRefresh: noop, tour: "", valMap }],
  ["ExecView(GC27)", App.ExecView, { t, reg: reg.filter((r) => r.Tournament === "GC27"), regAll: reg, intake: [], issues, onRefresh: noop, tour: "GC27", valMap }],
  ["TrendChart", App.TrendChart, { t, data: kpi }],
  ["SOPView", App.SOPView, { t }],
  ["GateCard", App.GateCard, { t, onTry: () => false, say: noop }],
];

let fails = 0;
const scan = (name, lang, html) => {
  const bad = [];
  if (/>undefined</.test(html) || /\bundefined\b(?![\w-])/.test(html.replace(/data-[\w-]+="[^"]*"/g, ""))) bad.push("undefined leak");
  if (/>NaN</.test(html)) bad.push("NaN leak");
  if (!html || html.length < 40) bad.push("empty render");
  if (bad.length) { fails++; console.log(`✗ ${name} [${lang}]: ${bad.join(", ")}`); 
    const i = html.search(/undefined|NaN/); if (i >= 0) console.log("   …" + html.slice(Math.max(0, i - 80), i + 40).replace(/\s+/g, " "));
  }
};

for (const [name, C, props] of cases) {
  try { scan(name, "en", renderToString(React.createElement(C, props))); }
  catch (e) { fails++; console.log(`✗ ${name} threw: ${e.message}`); }
}
for (const lang of ["en", "ar"]) {
  for (const [name, C, props] of perLang(STR[lang])) {
    try { scan(name, lang, renderToString(React.createElement(C, props))); }
    catch (e) { fails++; console.log(`✗ ${name} [${lang}] threw: ${e.message}`); }
  }
}
// i18n key parity
const en = Object.keys(STR.en), ar = new Set(Object.keys(STR.ar));
const missingAr = en.filter((k) => !ar.has(k));
const extraAr = Object.keys(STR.ar).filter((k) => !en.includes(k));
if (missingAr.length) { fails++; console.log("✗ AR missing keys:", missingAr.join(", ")); }
if (extraAr.length) console.log("⚠ AR extra keys:", extraAr.join(", "));
console.log(fails ? `\n${fails} FAILURE(S)` : `\nALL CLEAN — ${cases.length + perLang(STR.en).length * 2} renders + key parity`);
process.exit(fails ? 1 : 0);
