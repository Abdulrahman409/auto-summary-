// Weekly summary report — self-contained branded HTML (opens anywhere,
// prints to PDF). Pure function: data in, HTML string out. Rating colors are
// the reserved status palette; every mark carries its label and count, so
// identity never rides on color alone (Medium/High hues are CVD-close).
import { BRAND as C } from "./config.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function buildWeeklyReport(d, t, dir) {
  const RATE_C = { Low: C.green, Medium: C.gold, High: C.high, Critical: C.crit };
  const maxRate = Math.max(1, ...d.ratings.map((r) => r.n));
  const tile = (label, value, warn) => `
    <div class="tile" style="border-top-color:${warn ? C.crit : C.teal}">
      <div class="tnum" style="color:${warn ? C.crit : C.teal}">${esc(value)}</div>
      <div class="tlabel">${esc(label)}</div>
    </div>`;
  const rateRow = (r) => `
    <div class="rrow">
      <div class="rlabel">${esc(r.label)}</div>
      <div class="rtrack"><div class="rbar" style="width:${Math.round((100 * r.n) / maxRate)}%;background:${RATE_C[r.k]}"></div></div>
      <div class="rn">${r.n}</div>
    </div>`;
  const gateChip = (label, n) => `<span class="gchip"><b>${n}</b> ${esc(label)}</span>`;
  const backlogRow = (b) => `
    <div class="brow" style="border-inline-start-color:${b.forgotten ? C.crit : C.high}">
      <span class="bid">${esc(b.id)}</span>
      <span class="btitle">${esc(b.title)}</span>
      <span class="bmeta"><span class="chip" style="background:${RATE_C[b.rating] || C.dim}">${esc(b.ratingLabel)}</span> ${b.days}d</span>
    </div>`;

  return `<!doctype html>
<html lang="${dir === "rtl" ? "ar" : "en"}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.rep_title)} — ${esc(d.week)}</title>
<style>
  /* Standalone file, no external requests: brand fonts render when installed
     or when opened by someone who has visited the console; system-ui otherwise. */
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${dir === "rtl" ? "'IBM Plex Sans Arabic'," : ""} 'Barlow', system-ui, sans-serif;
         background: ${C.paper}; color: ${C.ink}; padding: 24px 16px; }
  .page { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid ${C.line}; }
  .hdr { background: ${C.teal}; color: #fff; padding: 18px 26px 14px; }
  .kicker { color: #BFD9D8; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .htitle { font-family: 'Barlow Condensed', ${dir === "rtl" ? "'IBM Plex Sans Arabic'," : ""} sans-serif;
            font-weight: 700; font-size: 30px; line-height: 1.1; margin-top: 2px; }
  .hmeta { color: #BFD9D8; font-size: 12px; margin-top: 4px; }
  .goldrule { height: 3px; background: ${C.gold}; }
  .body { padding: 20px 26px 8px; }
  .sec { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${C.gold}; margin: 18px 0 8px; }
  .sec:first-child { margin-top: 0; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .tile { border: 1px solid ${C.line}; border-top: 3px solid ${C.teal}; padding: 10px 12px; background: #fff; }
  .tnum { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 34px; line-height: 1; }
  .tlabel { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: ${C.dim}; margin-top: 5px; }
  .gchips { display: flex; flex-wrap: wrap; gap: 8px; }
  .gchip { background: ${C.paper}; border: 1px solid ${C.line}; padding: 6px 12px; font-size: 13px; }
  .gchip b { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; color: ${C.teal}; }
  .rrow { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
  .rlabel { width: 90px; font-size: 12px; font-weight: 600; }
  .rtrack { flex: 1; height: 16px; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 2px; overflow: hidden; }
  .rbar { height: 100%; border-radius: 0 2px 2px 0; min-width: 2px; }
  .rn { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 17px; color: ${C.teal}; min-width: 26px; text-align: end; }
  .brow { display: flex; align-items: baseline; gap: 10px; border-inline-start: 3px solid ${C.high};
          background: ${C.paper}; padding: 7px 10px; margin-bottom: 6px; font-size: 13px; }
  .bid { font-weight: 700; color: ${C.teal}; white-space: nowrap; }
  .btitle { flex: 1; }
  .bmeta { white-space: nowrap; color: ${C.dim}; font-size: 12px; }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 2px; color: #fff; font-size: 10px; font-weight: 700;
          letter-spacing: .04em; text-transform: uppercase; }
  .ok { color: ${C.green}; font-size: 13px; }
  .ptrack { height: 14px; background: ${C.paper}; border: 1px solid ${C.line}; border-radius: 2px; overflow: hidden; margin: 6px 0 4px; }
  .pbar { height: 100%; background: ${C.teal}; border-radius: 0 2px 2px 0; }
  .pline { font-size: 12px; color: ${C.dim}; }
  .foot { border-top: 1px solid ${C.line}; margin-top: 18px; padding: 10px 26px 14px; display: flex;
          justify-content: space-between; flex-wrap: wrap; gap: 6px; color: ${C.dim}; font-size: 10.5px; }
  @media (max-width: 560px) { .tiles { grid-template-columns: 1fr 1fr; } }
  @media print { body { background: #fff; padding: 0; } .page { border: 0; max-width: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div class="kicker">${esc(d.kicker)}</div>
    <div class="htitle">${esc(t.rep_title)} — ${esc(d.week)}</div>
    <div class="hmeta">${esc(d.scopeLabel)} · ${esc(t.rep_generated)} ${esc(d.generated)}${d.demo ? " · " + esc(t.demoChip) : ""}</div>
  </div>
  <div class="goldrule"></div>
  <div class="body">
    <div class="tiles">
      ${tile(t.ex_open, d.tiles.open, false)}
      ${tile(t.ex_crit, d.tiles.crit, d.tiles.crit > 0)}
      ${tile(t.k_ontime, d.tiles.reviewedPct + "%", d.tiles.reviewedPct < 95)}
      ${tile(t.k_forgot, d.tiles.forgotten, d.tiles.forgotten > 0)}
    </div>

    <div class="sec">${esc(t.rep_gate)}</div>
    <div class="gchips">
      ${gateChip(t.rep_submitted, d.gate.sub)}
      ${gateChip(t.st_admitted, d.gate.adm)}
      ${gateChip(t.st_merged, d.gate.mer)}
      ${gateChip(t.st_issue, d.gate.iss)}
      ${gateChip(t.st_returned, d.gate.ret)}
      ${gateChip(t.rep_openiss, d.gate.openIss)}
    </div>

    <div class="sec">${esc(t.rep_ratings)}</div>
    ${d.ratings.map(rateRow).join("")}

    <div class="sec">${esc(t.rep_backlog)}</div>
    ${d.backlog.length
      ? d.backlog.map(backlogRow).join("") + (d.backlogMore ? `<div class="pline">+${d.backlogMore}</div>` : "")
      : `<div class="ok">✓ ${esc(t.rep_backlog_none)}</div>`}

    <div class="sec">${esc(t.part_title)}</div>
    <div class="ptrack"><div class="pbar" style="width:${Math.round((100 * d.part.x) / d.part.n)}%"></div></div>
    <div class="pline">${esc(d.part.line)}</div>
  </div>
  <div class="foot">
    <span>APP-RSK-01 · Gate · Adjudicate · Tend · Evidence</span>
    <span>${esc(d.week)}</span>
  </div>
</div>
</body>
</html>`;
}
