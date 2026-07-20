import{B as e}from"./styles-37AhaKHO.js";const t=i=>String(i??"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a]);function m(i,a,r){const n={Low:e.green,Medium:e.gold,High:e.high,Critical:e.crit},c=Math.max(1,...i.ratings.map(s=>s.n)),l=(s,p,d)=>`
    <div class="tile" style="border-top-color:${d?e.crit:e.teal}">
      <div class="tnum" style="color:${d?e.crit:e.teal}">${t(p)}</div>
      <div class="tlabel">${t(s)}</div>
    </div>`,g=s=>`
    <div class="rrow">
      <div class="rlabel">${t(s.label)}</div>
      <div class="rtrack"><div class="rbar" style="width:${Math.round(100*s.n/c)}%;background:${n[s.k]}"></div></div>
      <div class="rn">${s.n}</div>
    </div>`,o=(s,p)=>`<span class="gchip"><b>${p}</b> ${t(s)}</span>`,x=s=>`
    <div class="brow" style="border-inline-start-color:${s.forgotten?e.crit:e.high}">
      <span class="bid">${t(s.id)}</span>
      <span class="btitle">${t(s.title)}</span>
      <span class="bmeta"><span class="chip" style="background:${n[s.rating]||e.dim}">${t(s.ratingLabel)}</span> ${s.days}d</span>
    </div>`;return`<!doctype html>
<html lang="${r==="rtl"?"ar":"en"}" dir="${r}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t(a.rep_title)} — ${t(i.week)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${r==="rtl"?"'IBM Plex Sans Arabic',":""} 'Barlow', system-ui, sans-serif;
         background: ${e.paper}; color: ${e.ink}; padding: 24px 16px; }
  .page { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid ${e.line}; }
  .hdr { background: ${e.teal}; color: #fff; padding: 18px 26px 14px; }
  .kicker { color: #BFD9D8; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .htitle { font-family: 'Barlow Condensed', ${r==="rtl"?"'IBM Plex Sans Arabic',":""} sans-serif;
            font-weight: 700; font-size: 30px; line-height: 1.1; margin-top: 2px; }
  .hmeta { color: #BFD9D8; font-size: 12px; margin-top: 4px; }
  .goldrule { height: 3px; background: ${e.gold}; }
  .body { padding: 20px 26px 8px; }
  .sec { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${e.gold}; margin: 18px 0 8px; }
  .sec:first-child { margin-top: 0; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .tile { border: 1px solid ${e.line}; border-top: 3px solid ${e.teal}; padding: 10px 12px; background: #fff; }
  .tnum { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 34px; line-height: 1; }
  .tlabel { font-size: 10px; letter-spacing: .07em; text-transform: uppercase; color: ${e.dim}; margin-top: 5px; }
  .gchips { display: flex; flex-wrap: wrap; gap: 8px; }
  .gchip { background: ${e.paper}; border: 1px solid ${e.line}; padding: 6px 12px; font-size: 13px; }
  .gchip b { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; color: ${e.teal}; }
  .rrow { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; }
  .rlabel { width: 90px; font-size: 12px; font-weight: 600; }
  .rtrack { flex: 1; height: 16px; background: ${e.paper}; border: 1px solid ${e.line}; border-radius: 2px; overflow: hidden; }
  .rbar { height: 100%; border-radius: 0 2px 2px 0; min-width: 2px; }
  .rn { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 17px; color: ${e.teal}; min-width: 26px; text-align: end; }
  .brow { display: flex; align-items: baseline; gap: 10px; border-inline-start: 3px solid ${e.high};
          background: ${e.paper}; padding: 7px 10px; margin-bottom: 6px; font-size: 13px; }
  .bid { font-weight: 700; color: ${e.teal}; white-space: nowrap; }
  .btitle { flex: 1; }
  .bmeta { white-space: nowrap; color: ${e.dim}; font-size: 12px; }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 2px; color: #fff; font-size: 10px; font-weight: 700;
          letter-spacing: .04em; text-transform: uppercase; }
  .ok { color: ${e.green}; font-size: 13px; }
  .ptrack { height: 14px; background: ${e.paper}; border: 1px solid ${e.line}; border-radius: 2px; overflow: hidden; margin: 6px 0 4px; }
  .pbar { height: 100%; background: ${e.teal}; border-radius: 0 2px 2px 0; }
  .pline { font-size: 12px; color: ${e.dim}; }
  .foot { border-top: 1px solid ${e.line}; margin-top: 18px; padding: 10px 26px 14px; display: flex;
          justify-content: space-between; flex-wrap: wrap; gap: 6px; color: ${e.dim}; font-size: 10.5px; }
  @media (max-width: 560px) { .tiles { grid-template-columns: 1fr 1fr; } }
  @media print { body { background: #fff; padding: 0; } .page { border: 0; max-width: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div class="kicker">${t(i.kicker)}</div>
    <div class="htitle">${t(a.rep_title)} — ${t(i.week)}</div>
    <div class="hmeta">${t(i.scopeLabel)} · ${t(a.rep_generated)} ${t(i.generated)}${i.demo?" · "+t(a.demoChip):""}</div>
  </div>
  <div class="goldrule"></div>
  <div class="body">
    <div class="tiles">
      ${l(a.ex_open,i.tiles.open,!1)}
      ${l(a.ex_crit,i.tiles.crit,i.tiles.crit>0)}
      ${l(a.k_ontime,i.tiles.reviewedPct+"%",i.tiles.reviewedPct<95)}
      ${l(a.k_forgot,i.tiles.forgotten,i.tiles.forgotten>0)}
    </div>

    <div class="sec">${t(a.rep_gate)}</div>
    <div class="gchips">
      ${o(a.rep_submitted,i.gate.sub)}
      ${o(a.st_admitted,i.gate.adm)}
      ${o(a.st_merged,i.gate.mer)}
      ${o(a.st_issue,i.gate.iss)}
      ${o(a.st_returned,i.gate.ret)}
      ${o(a.rep_openiss,i.gate.openIss)}
    </div>

    <div class="sec">${t(a.rep_ratings)}</div>
    ${i.ratings.map(g).join("")}

    <div class="sec">${t(a.rep_backlog)}</div>
    ${i.backlog.length?i.backlog.map(x).join("")+(i.backlogMore?`<div class="pline">+${i.backlogMore}</div>`:""):`<div class="ok">✓ ${t(a.rep_backlog_none)}</div>`}

    <div class="sec">${t(a.part_title)}</div>
    <div class="ptrack"><div class="pbar" style="width:${Math.round(100*i.part.x/i.part.n)}%"></div></div>
    <div class="pline">${t(i.part.line)}</div>
  </div>
  <div class="foot">
    <span>APP-RSK-01 · Gate · Adjudicate · Tend · Evidence</span>
    <span>${t(i.week)}</span>
  </div>
</div>
</body>
</html>`}export{m as buildWeeklyReport};
