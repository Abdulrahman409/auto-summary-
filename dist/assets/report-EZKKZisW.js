import{s as e}from"./styles-BbHTtclm.js";var t=e=>String(e??``).replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#39;`})[e]);function n(n,r,i){let a={Low:e.green,Medium:e.gold,High:e.high,Critical:e.crit},o=Math.max(1,...n.ratings.map(e=>e.n)),s=(n,r,i)=>`
    <div class="tile" style="border-top-color:${i?e.crit:e.teal}">
      <div class="tnum" style="color:${i?e.crit:e.teal}">${t(r)}</div>
      <div class="tlabel">${t(n)}</div>
    </div>`,c=e=>`
    <div class="rrow">
      <div class="rlabel">${t(e.label)}</div>
      <div class="rtrack"><div class="rbar" style="width:${Math.round(100*e.n/o)}%;background:${a[e.k]}"></div></div>
      <div class="rn">${e.n}</div>
    </div>`,l=(e,n)=>`<span class="gchip"><b>${n}</b> ${t(e)}</span>`;return`<!doctype html>
<html lang="${i===`rtl`?`ar`:`en`}" dir="${i}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t(r.rep_title)} — ${t(n.week)}</title>
<style>
  /* Standalone file, no external requests: brand fonts render when installed
     or when opened by someone who has visited the console; system-ui otherwise. */
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ${i===`rtl`?`'IBM Plex Sans Arabic',`:``} 'Barlow', system-ui, sans-serif;
         background: ${e.paper}; color: ${e.ink}; padding: 24px 16px; }
  .page { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid ${e.line}; }
  .hdr { background: ${e.teal}; color: #fff; padding: 18px 26px 14px; }
  .kicker { color: #BFD9D8; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .htitle { font-family: 'Barlow Condensed', ${i===`rtl`?`'IBM Plex Sans Arabic',`:``} sans-serif;
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
    <div class="kicker">${t(n.kicker)}</div>
    <div class="htitle">${t(r.rep_title)} — ${t(n.week)}</div>
    <div class="hmeta">${t(n.scopeLabel)} · ${t(r.rep_generated)} ${t(n.generated)}${n.demo?` · `+t(r.demoChip):``}</div>
  </div>
  <div class="goldrule"></div>
  <div class="body">
    <div class="tiles">
      ${s(r.ex_open,n.tiles.open,!1)}
      ${s(r.ex_crit,n.tiles.crit,n.tiles.crit>0)}
      ${s(r.k_ontime,n.tiles.reviewedPct+`%`,n.tiles.reviewedPct<95)}
      ${s(r.k_forgot,n.tiles.forgotten,n.tiles.forgotten>0)}
    </div>

    <div class="sec">${t(r.rep_gate)}</div>
    <div class="gchips">
      ${l(r.rep_submitted,n.gate.sub)}
      ${l(r.st_admitted,n.gate.adm)}
      ${l(r.st_merged,n.gate.mer)}
      ${l(r.st_issue,n.gate.iss)}
      ${l(r.st_returned,n.gate.ret)}
      ${l(r.rep_openiss,n.gate.openIss)}
    </div>

    <div class="sec">${t(r.rep_ratings)}</div>
    ${n.ratings.map(c).join(``)}

    <div class="sec">${t(r.rep_backlog)}</div>
    ${n.backlog.length?n.backlog.map(n=>`
    <div class="brow" style="border-inline-start-color:${n.forgotten?e.crit:e.high}">
      <span class="bid">${t(n.id)}</span>
      <span class="btitle">${t(n.title)}</span>
      <span class="bmeta"><span class="chip" style="background:${a[n.rating]||e.dim}">${t(n.ratingLabel)}</span> ${n.days}d</span>
    </div>`).join(``)+(n.backlogMore?`<div class="pline">+${n.backlogMore}</div>`:``):`<div class="ok">✓ ${t(r.rep_backlog_none)}</div>`}

    <div class="sec">${t(r.part_title)}</div>
    <div class="ptrack"><div class="pbar" style="width:${Math.round(100*n.part.x/n.part.n)}%"></div></div>
    <div class="pline">${t(n.part.line)}</div>
  </div>
  <div class="foot">
    <span>APP-RSK-01 · Gate · Adjudicate · Tend · Evidence</span>
    <span>${t(n.week)}</span>
  </div>
</div>
</body>
</html>`}export{n as buildWeeklyReport};