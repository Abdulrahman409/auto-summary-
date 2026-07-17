import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { BRAND as C, CONFIG, FAS, CATS, SCOPES, STRATS } from "./config.js";
import { rating, todayISO, isoWeek, ageDays, dupScreen, TASK_RE, ZGRACE, DUP_LIKELY, CADENCE,
         daysToKickoff, phaseOf, effCadence, hygieneGaps, genTitle } from "./logic.js";
import { initAuth, signIn } from "./auth.js";
import { pickApi } from "./api.js";
import { STR, fmt, dirOf } from "./i18n.js";
import { sha256 } from "js-sha256";

const RATE_C = { Low: C.green, Medium: C.gold, High: C.high, Critical: C.crit };
const api = pickApi();
const TOURS = CONFIG.tournaments || [{ id: "AC27", kicker: "", kickoff: CONFIG.kickoffDate }];
const DTKS = Object.fromEntries(TOURS.map((x) => [x.id, daysToKickoff(x.kickoff)]));
const dtkOf = (r) => DTKS[r?.Tournament] ?? DTKS.AC27 ?? daysToKickoff(CONFIG.kickoffDate);

/* ── atoms ── */
const Chip = ({ bg, children }) => <span className="chip" style={{ background: bg }}>{children}</span>;
const Btn = ({ kind = "primary", small, ...p }) => <button className={`btn btn-${kind} ${small ? "btn-sm" : ""}`} {...p} />;
const Field = ({ label, hint, children }) => (
  <div className="field"><div className="flabel">{label}</div>{children}{hint && <div className="fhint">{hint}</div>}</div>
);
const Sel = ({ value, onChange, options, labels }) => (
  <select value={value} onChange={onChange}><option value="">—</option>
    {options.map((o, i) => <option key={o} value={o}>{labels ? labels[i] : o}</option>)}</select>
);
const Card = ({ accent, children }) => <div className="card" style={accent ? { borderTop: `3px solid ${accent}` } : {}}>{children}</div>;

const rateLabel = (t, r) => t["rate_" + r] || r;
const statLabel = (t, s) => t["stat_" + s] || s;
const flagOf = (t, r) => {
  if (r.Status === "Closed") return null;
  const a = ageDays(r.LastReviewed), cad = effCadence(r.Rating, r.CadenceDays, dtkOf(r));
  if (a > cad + ZGRACE) return <Chip bg={C.crit}>{fmt(t.fl_forgotten, { d: a })}</Chip>;
  if (a > cad) return <Chip bg={C.high}>{t.fl_due}</Chip>;
  return null;
};
const FAV_C = { "Pending validation": C.gold, Validated: C.green, Flagged: C.crit };
const favOf = (r, valMap) => {
  const v = valMap?.[r.RegisterID];
  if (v) return { st: v.Verdict, note: v.ValNote || "" };
  return r.Status === "Closed" ? null : { st: "Pending validation", note: "" };
};
const isBreach = (r) => r.Category === "Safety & Security" && (r.Rating === "High" || r.Rating === "Critical") && r.Status !== "Closed";
const WINDOWS = ["Planning", "Readiness", "Test events", "Tournament time", "Legacy"];
const WIN_KEY = { Planning: "win_Planning", Readiness: "win_Readiness", "Test events": "win_Test", "Tournament time": "win_Tournament", Legacy: "win_Legacy" };
const winLabel = (t, v) => t[WIN_KEY[v]] || v;
const CLOSE_REASONS = ["Mitigated", "Overtaken by events", "Accepted", "Transferred"];
const LVL_C = { National: C.tealDark, City: C.gold, Venue: C.tgreen };
const LVLS = ["National", "City", "Venue"];
const lvlLabel = (t, v) => (v ? t["lvl_" + v] || v : "");
const favLabel = (t, v) => (v === "Pending validation" ? t.fav_pending : v === "Validated" ? t.fav_validated : v === "Flagged" ? t.fav_flagged : v);
const splitDue = (reg) => {
  const due = [], forgotten = [];
  reg.filter((r) => r.Status !== "Closed").forEach((r) => {
    const a = ageDays(r.LastReviewed), cad = effCadence(r.Rating, r.CadenceDays, dtkOf(r));
    if (a > cad + ZGRACE) forgotten.push(r); else if (a > cad) due.push(r);
  });
  return { due, forgotten };
};
const phaseLine = (t, tour) => {
  const tid = tour || Object.keys(DTKS).reduce((a, b) => (DTKS[a] <= DTKS[b] ? a : b));
  const d = DTKS[tid], ph = phaseOf(d);
  return `${tid} · ` + fmt(t.ph_label, { d }) + (ph ? t["ph_" + ph.key] : t.ph_std);
};
const riskLink = (id) => `${location.origin}${location.pathname}${location.search}#${id}`;

/* ── App shell ── */
const TABSETS = {
  all: ["submit", "mine", "fa", "pmo", "exec", "how"],
  fa: ["submit", "mine", "fa", "how"],
  pmo: ["pmo", "how"],
  exec: ["exec"],
};

export default function App({ mode = "all" }) {
  const tabIds = TABSETS[mode] || TABSETS.all;
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("lang") || "en"; } catch { return "en"; } });
  const [tour, setTour] = useState(() => { try { return localStorage.getItem("tour") || ""; } catch { return ""; } });
  const setTourP = (v) => { setTour(v); try { localStorage.setItem("tour", v); } catch {} };
  const t = STR[lang] || STR.en;
  // Landing applies to the public entries (all/fa); pmo.html and exec.html embeds go straight in.
  const canLand = mode === "all" || mode === "fa";
  const [role, setRole] = useState(() => { try { return localStorage.getItem("role") || ""; } catch { return ""; } });
  const [view, setView] = useState(canLand && !role ? "landing" : (TABSETS[mode] || TABSETS.all)[0]);
  const enter = (r, info = {}) => {
    try {
      localStorage.setItem("role", r);
      if (r === "fa") {
        if (info.fa) localStorage.setItem("myFA", info.fa);
        if (info.email) localStorage.setItem("myEmail", info.email);
        if (info.name) localStorage.setItem("myName", info.name); else localStorage.removeItem("myName");
      }
    } catch {}
    setRole(r);
    setView(r === "fa" ? "submit" : r);
  };
  const [pmoOk, setPmoOk] = useState(() => { try { return sessionStorage.getItem("pmoOk") === "1"; } catch { return false; } });
  const tryUnlock = (pw) => {
    if (CONFIG.pmoGate && sha256(pw) === CONFIG.pmoGate.sha256) {
      setPmoOk(true); try { sessionStorage.setItem("pmoOk", "1"); } catch {}
      return true;
    }
    return false;
  };
  const [deep, setDeep] = useState(null);
  const [me, setMe] = useState(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [reg, setReg] = useState([]);
  const [intake, setIntake] = useState([]);
  const [issues, setIssues] = useState([]);
  const [vals, setVals] = useState([]);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState(null);
  const say = (msg, bad) => { setToast({ msg, bad }); setTimeout(() => setToast(null), 4000); };
  const setLangP = (l) => { setLang(l); try { localStorage.setItem("lang", l); } catch {} };
  useEffect(() => { try { document.documentElement.lang = lang; document.documentElement.dir = dirOf(lang); } catch {} }, [lang]);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [r, i, s, v] = await Promise.all([api.listRegister(), api.listIntake(), api.listIssues(), api.listValidations()]);
      setReg(r); setIntake(i); setIssues(s); setVals(v);
    } catch (e) { say(`Load failed — ${e.message}`, true); }
    setBusy(false);
  }, []);

  useEffect(() => { (async () => {
    const m = location.hash.match(/^#(R-\d{3,})/i);
    if (m && tabIds.includes("pmo")) { setDeep(m[1].toUpperCase()); setView("pmo"); setTour(""); }
    if (api.demo) { setMe(api.whoami()); await reload(); return; }
    const acct = await initAuth();
    if (acct) { setMe(api.whoami()); await reload(); } else { setNeedSignIn(true); setBusy(false); }
  })(); }, [reload]);

  const doSignIn = async () => {
    try { await signIn(); setMe(api.whoami()); setNeedSignIn(false); await reload(); }
    catch (e) { say(`Sign-in failed — ${e.message}`, true); }
  };

  const week = isoWeek();
  const tFilter = (x) => !tour || (x.Tournament || "AC27") === tour;
  const regT = reg.filter(tFilter), intakeT = intake.filter(tFilter), issuesT = issues.filter(tFilter);
  const weekIntake = intakeT.filter((s) => isoWeek(new Date(s._created)) === week);
  const kicker = tour ? (TOURS.find((x) => x.id === tour)?.kicker || t.kicker) : (CONFIG.progKicker || t.kicker);
  const valMap = useMemo(() => {
    const m = {};
    [...vals].sort((a, b) => (a._created < b._created ? -1 : 1)).forEach((v) => { m[v.Title] = v; });
    return m;
  }, [vals]);
  const allTabs = { submit: t.nav_submit, mine: t.nav_mine, fa: t.nav_fa, pmo: t.nav_pmo, exec: t.nav_exec, how: t.nav_how };
  const tabs = tabIds.map((id) => [id, allTabs[id]]);
  const hasPMO = tabIds.includes("pmo");

  return (
    <div className="shell" dir={dirOf(lang)}>
      <div className="hdr">
        <div className="wrap">
          <div className="kicker">{kicker}</div>
          <div className="titlerow">
            <div className="apptitle">{t.appTitle1} <span style={{ color: C.gold }}>{lang === "ar" ? "" : "&"}</span> {t.appTitle2}</div>
            <div className="meta">
              {api.demo ? <Chip bg={C.gold}>{t.demoChip}</Chip> : me && <span>{me.name}</span>}
              <span className="row" style={{ gap: 4 }}>
                {[...TOURS.map((x) => x.id), ""].map((id) => (
                  <button key={id || "all"} className="langbtn"
                    style={tour === id ? { background: "#fff", color: C.teal, borderColor: "#fff" } : {}}
                    onClick={() => setTourP(id)}>{id || t.tour_all}</button>
                ))}
              </span>
              <span className="week">{t.week} {week.slice(-2)}</span>
              {canLand && view !== "landing" && <button className="langbtn" onClick={() => setView("landing")}>{t.land_change}</button>}
              <button className="langbtn" onClick={() => setLangP(lang === "en" ? "ar" : "en")}>{lang === "en" ? "عربي" : "EN"}</button>
            </div>
          </div>
          {view !== "landing" && tabs.length > 1 && <div className="tabs">
            {tabs.map(([id, label]) => (
              <button key={id} className={view === id ? "tab on" : "tab"} onClick={() => setView(id)}>{label}</button>
            ))}
          </div>}
        </div>
        <div className="goldrule" />
      </div>

      <div className="wrap body">
        {api.demo && !needSignIn && (
          <div className="demobar">{t.demo_b1}<b>{t.demo_b2}</b>{hasPMO && <>{t.demo_b3}<b>{t.demo_b4}</b>{t.demo_b5}<b>{t.demo_b6}</b></>}{t.demo_b7}</div>
        )}
        {needSignIn ? (
          <Card accent={C.gold}><div className="pad">
            <div className="h1">{t.signin_t}</div>
            <p className="dim">{t.signin_b}</p>
            <Btn onClick={doSignIn}>{t.signin_btn}</Btn>
          </div></Card>
        ) : busy ? <div className="loading">{t.loading}</div> : (
          <>
            {view === "landing" && <Landing t={t} say={say} mode={mode} onEnter={enter} />}
            {view === "submit" && <SubmitView t={t} reg={regT} me={me} say={say} onDone={reload} tour={tour} />}
            {view === "mine" && <MineView t={t} intake={intakeT} me={me} reg={regT} />}
            {view === "pmo" && (!CONFIG.pmoGate?.enabled || pmoOk
              ? <PMO t={t} reg={regT} intake={intakeT} intakeWeek={weekIntake} issues={issuesT} say={say} reload={reload} deep={deep} clearDeep={() => setDeep(null)} tour={tour} valMap={valMap} regAll={reg} />
              : <GateCard t={t} onTry={tryUnlock} say={say} />)}
            {view === "fa" && <FAView t={t} reg={regT} me={me} say={say} reload={reload} valMap={valMap} />}
            {view === "exec" && (!CONFIG.pmoGate?.enabled || pmoOk
              ? <ExecView t={t} reg={regT} regAll={reg} intake={weekIntake} issues={issuesT} onRefresh={reload} tour={tour} valMap={valMap} />
              : <GateCard t={t} onTry={tryUnlock} say={say} />)}
            {view === "how" && <SOPView t={t} />}
          </>
        )}
      </div>

      {toast && <div className={`toast ${toast.bad ? "bad" : ""}`} role="status" aria-live="polite">{toast.msg}</div>}
      <div className="wrap foot">{api.demo ? t.foot_demo : t.foot_prod}</div>
    </div>
  );
}

/* ── Landing — pick a door; FA identity matched against FA Champions ── */
function Landing({ t, say, mode, onEnter }) {
  const [fa, setFa] = useState(() => { try { return localStorage.getItem("myFA") || ""; } catch { return ""; } });
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("myEmail") || ""; } catch { return ""; } });
  const [champs, setChamps] = useState([]);
  useEffect(() => { api.listChampions().then(setChamps).catch(() => {}); }, []);
  const match = /@/.test(email) ? champs.find((c) => String(c.ChampionEmail || "").toLowerCase() === email.trim().toLowerCase()) : null;
  const matchFA = match ? (match.Title || match.FA || "") : "";
  const verified = !!match && matchFA === fa;
  useEffect(() => { if (matchFA && !fa) setFa(matchFA); }, [matchFA]); // auto-pick FA from a known email
  const ready = fa && /@/.test(email);
  return (
    <>
      <Card accent={C.gold}><div className="pad">
        <div className="h1">{t.land_title}</div>
        <p className="dim">{t.land_sub}</p>
      </div></Card>
      <Card accent={C.teal}><div className="pad">
        <div className="slabel">{t.land_fa_t}</div>
        <div className="fhint" style={{ marginBottom: 8 }}>{t.land_fa_b}</div>
        <div className="grid2">
          <Field label={t.f_fa}><Sel value={fa} onChange={(e) => setFa(e.target.value)} options={FAS} /></Field>
          <Field label={t.land_email}>
            <input type="email" value={email} placeholder={t.land_email_ph} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        {verified && <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{fmt(t.land_verified, { n: match.ChampionName || email })}</div></div>}
        {match && !verified && <div className="warn">{fmt(t.land_otherfa, { fa: matchFA })}{" "}
          <Btn small kind="ghost" onClick={() => setFa(matchFA)}>{fmt(t.land_use, { fa: matchFA })}</Btn></div>}
        {ready && !match && champs.length > 0 && <div className="fhint" style={{ marginBottom: 8 }}>{t.land_unknown}</div>}
        <Btn disabled={!ready} onClick={() => onEnter("fa", { fa, email: email.trim(), name: verified ? match.ChampionName || "" : "" })}>{t.land_go}</Btn>
      </div></Card>
      {mode === "all" && (
        <div className="grid2">
          <Card><div className="pad">
            <div className="slabel">{t.land_pmo_t}</div>
            <p className="dim" style={{ fontSize: 13 }}>{t.land_pmo_b}</p>
            <Btn kind="ghost" onClick={() => onEnter("pmo")}>{t.land_open}</Btn>
          </div></Card>
          <Card><div className="pad">
            <div className="slabel">{t.land_exec_t}</div>
            <p className="dim" style={{ fontSize: 13 }}>{t.land_exec_b}</p>
            <Btn kind="ghost" onClick={() => onEnter("exec")}>{t.land_open}</Btn>
          </div></Card>
        </div>
      )}
    </>
  );
}

/* ── Submit ── */
function SubmitView({ t, reg, me, say, onDone, tour }) {
  const lsv = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const blank = { fa: lsv("myFA") || "", by: lsv("myName") || lsv("myEmail") || me?.name || "", type: "Risk", title: "", cause: "", event: "", consequence: "", cat: "", scope: "", L: "", I: "", strat: "", actions: "", target: "", conf: false, tour: tour || "AC27" };
  // Title is generated automatically from the event clause.
  const [f, setF] = useState(blank);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  // Legacy register upload: rows become INTAKE submissions (pending triage),
  // never register rows — FAs cannot write the register (doctrine).
  const LEG_CAP = 100;
  const legRef = useRef(null);
  const [leg, setLeg] = useState(null);
  const onLegacy = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    setLeg({ phase: "read" });
    try {
      const { parseRegisterFile } = await import("./excel.js");
      const { rows } = await parseRegisterFile(file);
      let skipped = 0; const usable = [];
      const byLine = (lsv("myName") || lsv("myEmail") || me?.name || "FA champion") + " — legacy file";
      rows.forEach((r) => {
        const event = String(r.EventClause || r.Title || "").trim();
        const cons = String(r.Consequence || "").trim();
        if (event.length < 15 || cons.length < 15) { skipped++; return; }
        usable.push({
          title: genTitle(event) || String(r.Title || "").slice(0, 72),
          fa: FAS.includes(r.LeadFA) ? r.LeadFA : (f.fa || lsv("myFA")),
          by: byLine, type: "Risk", cause: r.Cause || "",
          event, consequence: cons,
          cat: CATS.includes(r.Category) ? r.Category : "Operational Delivery",
          scope: SCOPES.includes(r.Scope) ? r.Scope : "Tournament-wide",
          L: r.Likelihood >= 1 && r.Likelihood <= 5 ? r.Likelihood : 3,
          I: r.Impact >= 1 && r.Impact <= 5 ? r.Impact : 3,
          strat: STRATS.includes(r.Strategy) ? r.Strategy : "Reduce",
          actions: String(r.Actions || "").trim() || "Per legacy register.",
          target: String(r.TargetDate || todayISO()).slice(0, 10),
          conf: false, tour: ["AC27", "GC27"].includes(r.Tournament) ? r.Tournament : (tour || "AC27"),
        });
      });
      if (!usable.length) { setLeg({ phase: "none" }); return; }
      setLeg({ phase: "preview", rows: usable.slice(0, LEG_CAP), skipped, capped: usable.length > LEG_CAP });
    } catch (err) { say(`Failed — ${err.message}`, true); setLeg(null); }
  };
  const sendLegacy = async () => {
    const rows = leg.rows;
    for (let i = 0; i < rows.length; i++) {
      setLeg({ phase: "prog", i: i + 1, n: rows.length });
      try { await api.createIntake(rows[i]); }
      catch (err) { say(`Failed — ${err.message}`, true); setLeg(null); return; }
    }
    say(fmt(t.si_done, { n: rows.length }));
    setLeg(null); onDone();
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const score = f.L && f.I ? +f.L * +f.I : null;
  const dups = useMemo(() => f.event.length < 14 ? [] : dupScreen(genTitle(f.event), f.event, reg), [f.event, reg]);
  const top = dups[0];
  const taskish = TASK_RE.test(f.event);
  const autoTitle = genTitle(f.event);
  const errs = [];
  ["tour", "fa", "cat", "scope", "L", "I", "strat", "actions", "target"].forEach((k) => { if (!f[k]) errs.push(k); });
  if (!f.conf && !f.by) errs.push("by");
  ["event", "consequence"].forEach((k) => { if ((f[k] || "").trim().length < 15) errs.push(k); });
  if (!autoTitle) errs.push("title");
  const ready = errs.length === 0;

  const loadExample = () => setF({
    fa: "Transport", by: me?.name || "Demo user", type: "Risk",
    title: "",
    cause: "",
    event: "there is a risk that reduced metro frequency cannot absorb derby-day spectator volumes,",
    consequence: "resulting in platform overcrowding and delayed stadium egress.",
    cat: "Transport & Mobility", scope: "Riyadh", L: "3", I: "4", strat: "Reduce", tour: "AC27", conf: false,
    actions: "Coordinate a maintenance freeze with the metro operator; run a surge bus bridge on derby days.",
    target: todayISO(),
  });

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try { await api.createIntake({ ...f, title: autoTitle, by: f.conf ? "Confidential" : f.by }); setSent(true); setF(blank); onDone(); }
    catch (e) { say(`${t.imp_err.split("{")[0]}${e.message}`, true); }
    setSaving(false);
  };

  if (sent) return (
    <Card accent={C.green}><div className="pad">
      <div className="h1" style={{ color: C.green }}>{t.sent_t}</div>
      <p>{t.sent_b}</p>
      <Btn kind="ghost" onClick={() => setSent(false)}>{t.sent_again}</Btn>
    </div></Card>
  );

  return (
    <>
      <Card accent={C.gold}><div className="pad">
        <div className="rowsplit">
          <div className="slabel">{t.stmt_label}</div>
          {api.demo && <Btn small kind="ghost" onClick={loadExample}>{t.loadExample}</Btn>}
        </div>
        <div className="statement">
          <span style={{ color: f.event.length >= 15 ? C.ink : C.line }}>{f.type === "Issue" ? "" : t.riskThat}{f.event ? f.event.replace(/^there is a risk that\s*/i, "") : t.ph_event} </span>
          <span style={{ color: f.consequence.length >= 15 ? C.ink : C.line }}>{t.resulting}{f.consequence ? f.consequence.replace(/^resulting in\s*/i, "") : t.ph_cons}</span>
        </div>
        {autoTitle && <div className="fhint" style={{ marginTop: 6 }}>{t.title_auto}<b>{autoTitle}</b></div>}
        {taskish && <div className="warn">{t.warn_task}</div>}
      </div></Card>

      {top && (
        <Card accent={top.sc >= DUP_LIKELY ? C.crit : C.gold}><div className="pad">
          <div className="slabel" style={{ color: top.sc >= DUP_LIKELY ? C.crit : C.gold }}>
            {top.sc >= DUP_LIKELY ? t.dup_likely : t.dup_possible} — {top.r.RegisterID}</div>
          <div className="dim">{top.r.Title}</div>
          <div className="fhint">{t.dup_hint}</div>
        </div></Card>
      )}

      <Card><div className="pad">
        <div className="grid2">
          <Field label={t.f_tour}><Sel value={f.tour} onChange={set("tour")} options={TOURS.map((x) => x.id)} /></Field>
          <Field label={t.f_fa}><Sel value={f.fa} onChange={set("fa")} options={FAS} /></Field>
          <Field label={t.f_by}>
            <input value={f.conf ? t.conf_chip : f.by} onChange={set("by")} placeholder={t.f_by_ph} disabled={f.conf} />
            <label className="mini" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={f.conf} onChange={(e) => setF({ ...f, conf: e.target.checked })} />
              {t.conf_label}</label>
            {f.conf && <div className="fhint">{t.conf_hint}</div>}
          </Field>
          <Field label={t.f_type} hint={t.f_type_hint}>
            <Sel value={f.type} onChange={set("type")} options={["Risk", "Issue"]} labels={[t.typeRisk, t.typeIssue]} /></Field>
        </div>
        <Field label={f.type === "Issue" ? t.f_event_i : t.f_event_r}><textarea rows={2} value={f.event} onChange={set("event")} /></Field>
        <Field label={t.f_cons}><textarea rows={2} value={f.consequence} onChange={set("consequence")} /></Field>
        <div className="grid2">
          <Field label={t.f_cat}><Sel value={f.cat} onChange={set("cat")} options={CATS} /></Field>
          <Field label={t.f_scope}><Sel value={f.scope} onChange={set("scope")} options={SCOPES} /></Field>
          <Field label={t.f_L}><Sel value={f.L} onChange={set("L")} options={["1","2","3","4","5"]} />{f.L && <div className="fhint">{t.ldef[+f.L - 1]}</div>}</Field>
          <Field label={t.f_I}><Sel value={f.I} onChange={set("I")} options={["1","2","3","4","5"]} />{f.I && <div className="fhint">{t.idef[+f.I - 1]}</div>}</Field>
        </div>
        {score && <div className="scorebox"><div className="scorenum" style={{ color: RATE_C[rating(score)] }}>{score}</div>
          <Chip bg={RATE_C[rating(score)]}>{rateLabel(t, rating(score))}</Chip>
          {rating(score) === "Critical" && <span className="critnote">{t.critnote}</span>}</div>}
        <div className="grid2">
          <Field label={t.f_strat}><Sel value={f.strat} onChange={set("strat")} options={f.type === "Issue" ? ["Resolve (Issue)", ...STRATS] : STRATS} /></Field>
          <Field label={t.f_target}><input type="date" value={f.target} onChange={set("target")} /></Field>
        </div>
        <Field label={t.f_actions}><textarea rows={2} value={f.actions} onChange={set("actions")} /></Field>
        <div className="row">
          <Btn onClick={submit} disabled={!ready || saving}>{saving ? t.submitting : t.submit}</Btn>
          {!ready && <span className="fhint">{t.needAll}</span>}
        </div>
        <div className="fhint" style={{ marginTop: 8 }}>{t.conf_note}</div>
      </div></Card>

      <Card accent={C.gold}><div className="pad">
        <div className="slabel">{t.si_title}</div>
        <div className="fhint" style={{ marginBottom: 8 }}>{t.si_b}</div>
        {!leg && <Btn kind="gold" onClick={() => legRef.current && legRef.current.click()}>{t.si_btn}</Btn>}
        {leg?.phase === "read" && <div className="fhint">{t.si_reading}</div>}
        {leg?.phase === "none" && <div className="warn">{t.si_none}</div>}
        {leg?.phase === "preview" && (
          <>
            <div className="mini" style={{ marginBottom: 8 }}>
              {fmt(t.si_preview, { n: leg.rows.length, s: leg.skipped })}{leg.capped && <> {fmt(t.si_cap, { n: LEG_CAP })}</>}
            </div>
            <div className="row">
              <Btn onClick={sendLegacy}>{fmt(t.si_confirm, { n: leg.rows.length })}</Btn>
              <Btn kind="quiet" onClick={() => setLeg(null)}>{t.si_cancel}</Btn>
            </div>
          </>
        )}
        {leg?.phase === "prog" && <div className="fhint">{fmt(t.si_prog, { i: leg.i, n: leg.n })}</div>}
        <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} ref={legRef} onChange={onLegacy} />
      </div></Card>
    </>
  );
}

/* ── My submissions ── */
function MineView({ t, intake, me, reg }) {
  const mine = intake.filter((s) => (s._authorEmail && me?.user ? s._authorEmail.toLowerCase() === String(me.user).toLowerCase() : s._author === me?.name))
    .sort((a, b) => (a._created < b._created ? 1 : -1));
  const chip = (s) => ({
    "Pending triage": <Chip bg={C.dim}>{t.st_pending}</Chip>,
    Admitted: <Chip bg={C.green}>{t.st_admitted} · {s.RegisterID}</Chip>,
    Merged: <Chip bg={C.tgreen}>{t.st_merged} → {s.RegisterID}</Chip>,
    "Converted to issue": <Chip bg={C.gold}>{t.st_issue} · {s.RegisterID}</Chip>,
    Returned: <Chip bg={C.crit}>{t.st_returned}</Chip>,
  }[s.Status] || <Chip bg={C.crit}>{t.st_rejected}</Chip>);
  if (!mine.length) return <div className="empty">{t.mine_empty}</div>;
  return mine.map((s) => (
    <Card key={s._id}><div className="pad">
      <div className="rowsplit">
        <div><div className="mini">{s.EntryType === "Issue" ? t.typeIssue : t.typeRisk} · {String(s._created).slice(0, 10)} · {s.FunctionalArea}</div>
          <div className="cardtitle">{s.Title}</div></div>
        <div className="row">{s.Confidential === "Yes" && <Chip bg={C.dim}>{t.conf_chip}</Chip>}{s.Rating && <Chip bg={RATE_C[s.Rating]}>{s.Score} · {rateLabel(t, s.Rating)}</Chip>}{chip(s)}</div>
      </div>
      {s.Status === "Returned" && s.TriageNotes && <div className="warn">{fmt(t.mine_returned, { note: s.TriageNotes })}</div>}
      {s.Status === "Merged" && <div className="fhint">{fmt(t.mine_mergecredit, { id: s.RegisterID })}</div>}
      {(s.Status === "Admitted" || s.Status === "Merged") && (() => {
        const l = (reg || []).find((r) => r.RegisterID === s.RegisterID);
        return l?.MitigationUpdate ? <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{t.mine_latest}</div><div style={{ fontSize: 13 }}>{l.MitigationUpdate}</div></div> : null;
      })()}
    </div></Card>
  ));
}

/* ── PMO console ── */
function PMO({ t, reg, intake, intakeWeek, issues, say, reload, deep, clearDeep, tour, valMap, regAll }) {
  const [tab, setTab] = useState(deep ? "register" : "queue");
  const [reviewing, setReviewing] = useState(false);
  // The queue drains ALL pending intake, whatever week it arrived; weekly
  // stats (decided count, participation, summary) stay scoped to this week.
  const wk = intakeWeek || intake;
  const pending = intake.filter((s) => s.Status === "Pending triage");
  const openReg = reg.filter((r) => r.Status !== "Closed");
  const openIss = issues.filter((i) => i.Status === "Open");
  const { due, forgotten } = splitDue(reg);
  const rvQueue = [...forgotten, ...due].sort((a, b) => (b.Score || 0) - (a.Score || 0));
  const tabs = [["queue", `${t.pmo_queue} (${pending.length})`], ["register", `${t.pmo_reg} (${openReg.length})`],
    ["issues", `${t.pmo_iss} (${openIss.length})`], ["health", t.pmo_health]];
  if (reviewing) return <ReviewRound t={t} queue={rvQueue} say={say} onExit={() => { setReviewing(false); reload(); }} />;
  return (
    <>
      <div className="subtabs">
        {tabs.map(([id, l]) => (
          <button key={id} className={tab === id ? "stab on" : "stab"} onClick={() => setTab(id)}>{l}</button>))}
      </div>
      {tab === "queue" && <Queue t={t} pending={pending} decided={wk.filter((s) => s.Status !== "Pending triage").length} reg={reg} regAll={regAll} say={say} reload={reload} />}
      {tab === "register" && <RegisterTab t={t} reg={reg} say={say} reload={reload} deep={deep} clearDeep={clearDeep} valMap={valMap} />}
      {tab === "issues" && <IssuesTab t={t} issues={issues} say={say} reload={reload} />}
      {tab === "health" && <Health t={t} reg={reg} intake={wk} issues={issues} say={say} reload={reload}
        dueCount={rvQueue.length} onStartReview={() => setReviewing(true)} tour={tour} valMap={valMap} regAll={regAll} />}
    </>
  );
}

function Queue({ t, pending, decided, reg, regAll, say, reload }) {
  const [note, setNote] = useState({});
  const [merge, setMerge] = useState({});
  const [lvl, setLvl] = useState({});
  const decide = async (s, decision) => {
    const target = (merge[s._id] ?? (dupScreen(s.Title, s.EventClause, reg)[0]?.r.RegisterID || "")).trim().toUpperCase();
    if (decision === "Return" && !(note[s._id] || "").trim()) return say(t.t_neednote, true);
    try {
      // decide() gets the FULL register: the next R-#### must be unique across
      // tournaments even when the PMO header filter is on.
      const r = await api.decide(s, decision, { target, note: note[s._id] || "", level: lvl[s._id] || "" }, regAll || reg);
      const mailNote = decision === "Return" ? (r.mailed === true ? " " + t.ret_mail_ok : r.mailed === false ? " " + t.ret_mail_no : "") : "";
      say(decision === "Admit" ? fmt(t.t_admitted, { id: r.riskId }) + (r.breach ? ` · ${t.stat_Escalated}` : "") : decision === "Merge" ? fmt(t.t_merged, { id: r.target }) :
          decision === "Convert-Issue" ? fmt(t.t_logged, { id: r.issueId }) : fmt(t.t_recorded, { d: decision }) + mailNote);
      reload();
    } catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); }
  };
  if (!pending.length) return <div className="empty">{fmt(t.q_clear, { d: decided })}</div>;
  return (
    <>
      <div className="mini" style={{ marginBottom: 10 }}>{fmt(t.q_stats, { d: decided, p: pending.length })}</div>
      {pending.map((s) => {
        const dups = dupScreen(s.Title, s.EventClause, reg);
        const top = dups[0];
        return (
          <Card key={s._id} accent={top && top.sc >= DUP_LIKELY ? C.gold : C.teal}><div className="pad">
            <div className="rowsplit">
              <div><div className="mini">{s.FunctionalArea} · {s.Confidential === "Yes" ? t.conf_chip : s.RaisedBy} · {s.EntryType === "Issue" ? t.typeIssue : t.typeRisk}{s.Confidential === "Yes" && <> <Chip bg={C.dim}>{t.conf_chip}</Chip></>}</div>
                <div className="cardtitle">{s.Title}</div></div>
              <Chip bg={RATE_C[rating(s.Likelihood * s.Impact)]}>{s.Likelihood * s.Impact} · {rateLabel(t, rating(s.Likelihood * s.Impact))}</Chip>
            </div>
            <p className="cec">{s.Cause ? s.Cause + " " : ""}<b>{s.EventClause}</b> {s.Consequence}</p>
            <div className="mini">{s.Category} · {s.Scope} · {s.Strategy} · {String(s.TargetDate || "").slice(0, 10)}</div>
            {TASK_RE.test(s.EventClause) && <div className="warn">{t.warn_task}</div>}
            {s.Category === "Safety & Security" && ["High", "Critical"].includes(rating(s.Likelihood * s.Impact)) &&
              <div className="warn" style={{ borderColor: C.crit, background: "#FBEAEA", color: C.crit }}>{t.appetite_chip}</div>}
            {dups.length > 0 && <div className="dupbox"><div className="slabel" style={{ color: C.gold }}>{t.q_matches}</div>
              {dups.map((d) => <div key={d.r.RegisterID}><b>{d.r.RegisterID}</b> ({d.sc}) — {d.r.Title} <span className="dim">· {rateLabel(t, d.r.Rating)} · {statLabel(t, d.r.Status)}</span></div>)}</div>}
            <div className="grid2" style={{ marginTop: 8 }}>
              <input placeholder={fmt(t.q_merge_ph, { id: top ? top.r.RegisterID : "R-0728" })}
                value={merge[s._id] ?? (top ? top.r.RegisterID : "")} onChange={(e) => setMerge({ ...merge, [s._id]: e.target.value })} />
              <input placeholder={t.q_note_ph} value={note[s._id] || ""} onChange={(e) => setNote({ ...note, [s._id]: e.target.value })} />
              <select value={lvl[s._id] || ""} onChange={(e) => setLvl({ ...lvl, [s._id]: e.target.value })}>
                <option value="">{t.lvl_label} —</option>
                {LVLS.map((l) => <option key={l} value={l}>{lvlLabel(t, l)}</option>)}
              </select>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <Btn small onClick={() => decide(s, "Admit")}>{t.b_admit}</Btn>
              <Btn small kind="gold" onClick={() => decide(s, "Merge")}>{t.b_merge}</Btn>
              <Btn small kind="ghost" onClick={() => decide(s, "Convert-Issue")}>{t.b_issue}</Btn>
              <Btn small kind="quiet" onClick={() => decide(s, "Return")}>{t.b_return}</Btn>
              <Btn small kind="danger" onClick={() => decide(s, "Reject-NotRisk")}>{t.b_notrisk}</Btn>
              <Btn small kind="danger" onClick={() => decide(s, "Reject-Scope")}>{t.b_outscope}</Btn>
            </div>
          </div></Card>
        );
      })}
    </>
  );
}

/* ── Register ── */
function RegisterTab({ t, reg, say, reload, deep, clearDeep, valMap }) {
  const [q, setQ] = useState(""); const [fr, setFr] = useState(""); const [open, setOpen] = useState(null);
  const [upd, setUpd] = useState({}); const [ls, setLs] = useState({}); const [cl, setCl] = useState({}); const [clz, setClz] = useState({});
  useEffect(() => {
    if (!deep || !reg.length) return;
    const row = reg.find((r) => r.RegisterID === deep);
    if (row) { setQ(deep); setOpen(row._id); }
    clearDeep();
  }, [deep, reg, clearDeep]);
  const rows = reg.filter((r) => (!fr || r.Rating === fr) &&
    (!q || `${r.RegisterID} ${r.Title} ${r.LeadFA} ${r.Scope} ${r.Tournament || ""}`.toLowerCase().includes(q.toLowerCase())));
  const act = async (r, patch, hist, msg) => {
    try { await api.touchRisk(r, patch, hist); say(msg); reload(); }
    catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); }
  };
  const copy = async (r) => {
    const u = riskLink(r.RegisterID);
    try { await navigator.clipboard.writeText(u); say(t.copied); }
    catch { say(fmt(t.copy_fail, { u }), true); }
  };
  const rescore = (r) => {
    const cur = ls[r._id] || { L: r.Likelihood, I: r.Impact };
    const changed = +cur.L !== +r.Likelihood || +cur.I !== +r.Impact;
    return (
      <div className="row" style={{ margin: "8px 0" }}>
        <span className="flabel" style={{ marginBottom: 0 }}>{t.resc_label}</span>
        <select value={cur.L} onChange={(e) => setLs({ ...ls, [r._id]: { ...cur, L: e.target.value } })} style={{ width: 64 }}>
          {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <span className="mini">×</span>
        <select value={cur.I} onChange={(e) => setLs({ ...ls, [r._id]: { ...cur, I: e.target.value } })} style={{ width: 64 }}>
          {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <Chip bg={RATE_C[rating(cur.L * cur.I)]}>{cur.L * cur.I}</Chip>
        <Btn small kind="ghost" disabled={!changed} onClick={() => {
          const nr = rating(cur.L * cur.I);
          act(r, { Likelihood: +cur.L, Impact: +cur.I, CadenceDays: CADENCE[nr] },
            `rescored ${r.Likelihood}x${r.Impact} -> ${cur.L}x${cur.I} (${nr})`, fmt(t.resc_saved, { id: r.RegisterID }));
        }}>{t.resc_save}</Btn>
      </div>
    );
  };
  const classify = (r) => {
    const cur = cl[r._id] || { strat: r.Strategy || "", lvl: r.RiskLevel || "", win: r.RiskWindow || "", ext: r.ExternalParties || "", rl: r.ResidualL || "", ri: r.ResidualI || "" };
    const changed = cur.strat !== (r.Strategy || "") || cur.lvl !== (r.RiskLevel || "") || cur.win !== (r.RiskWindow || "")
      || cur.ext !== (r.ExternalParties || "") || String(cur.rl) !== String(r.ResidualL || "") || String(cur.ri) !== String(r.ResidualI || "");
    return (
      <div className="row" style={{ margin: "8px 0" }}>
        <span className="flabel" style={{ marginBottom: 0 }}>{t.cls_label}</span>
        <select value={cur.strat} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, strat: e.target.value } })} style={{ width: "auto" }}>
          <option value="">{t.f_strat} —</option>
          {STRATS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <select value={cur.lvl} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, lvl: e.target.value } })} style={{ width: "auto" }}>
          <option value="">{t.lvl_label} —</option>
          {LVLS.map((x) => <option key={x} value={x}>{lvlLabel(t, x)}</option>)}</select>
        <select value={cur.win} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, win: e.target.value } })} style={{ width: "auto" }}>
          <option value="">{t.win_label} —</option>
          {WINDOWS.map((x) => <option key={x} value={x}>{winLabel(t, x)}</option>)}</select>
        <span className="flabel" style={{ marginBottom: 0 }}>{t.res_label}</span>
        <select value={cur.rl} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, rl: e.target.value } })} style={{ width: 58 }}>
          <option value="">—</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <span className="mini">×</span>
        <select value={cur.ri} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, ri: e.target.value } })} style={{ width: 58 }}>
          <option value="">—</option>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <input placeholder={t.ext_ph} value={cur.ext} onChange={(e) => setCl({ ...cl, [r._id]: { ...cur, ext: e.target.value } })} style={{ flex: 1, minWidth: 180 }} />
        <Btn small kind="ghost" disabled={!changed} onClick={() => {
          const patch = {}; const parts = [];
          if (cur.strat !== (r.Strategy || "")) { patch.Strategy = cur.strat; parts.push(`strategy ${r.Strategy || "—"} -> ${cur.strat}`); }
          if (cur.lvl !== (r.RiskLevel || "")) { patch.RiskLevel = cur.lvl; parts.push(`level ${r.RiskLevel || "—"} -> ${cur.lvl}`); }
          if (cur.win !== (r.RiskWindow || "")) { patch.RiskWindow = cur.win; parts.push(`window ${r.RiskWindow || "—"} -> ${cur.win}`); }
          if (cur.ext !== (r.ExternalParties || "")) { patch.ExternalParties = cur.ext; parts.push(`external parties updated`); }
          if (String(cur.rl) !== String(r.ResidualL || "") || String(cur.ri) !== String(r.ResidualI || "")) {
            patch.ResidualL = +cur.rl || null; patch.ResidualI = +cur.ri || null;
            parts.push(`residual ${cur.rl || "—"}x${cur.ri || "—"}`);
          }
          act(r, patch, "classification: " + parts.join(" · "), fmt(t.cls_saved, { id: r.RegisterID }));
        }}>{t.cls_save}</Btn>
      </div>
    );
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder={t.r_search} value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <select value={fr} onChange={(e) => setFr(e.target.value)}><option value="">{t.r_all}</option>
          {Object.keys(RATE_C).map((r) => <option key={r} value={r}>{rateLabel(t, r)}</option>)}</select>
      </div>
      {rows.map((r) => (
        <Card key={r._id}><div className="pad-s">
          <button className="rowbtn" onClick={() => setOpen(open === r._id ? null : r._id)}>
            <span><b style={{ color: C.teal }}>{r.RegisterID}</b> &nbsp;{r.Title}</span>
            <span className="row"><Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip>
              <Chip bg={r.Status === "Closed" ? C.dim : r.Status === "Escalated" ? C.crit : C.tgreen}>{statLabel(t, r.Status)}</Chip>{flagOf(t, r)}</span>
          </button>
          {open === r._id && (
            <div className="expand">
              <p className="cec">{r.Cause ? r.Cause + " " : ""}<b>{r.EventClause}</b> {r.Consequence}</p>
              <div className="row" style={{ margin: "4px 0" }}>
                {isBreach(r) && <Chip bg={C.crit}>{t.appetite_chip}</Chip>}
                {r.RiskLevel && <Chip bg={LVL_C[r.RiskLevel]}>{lvlLabel(t, r.RiskLevel)}</Chip>}
                {r.RiskWindow && <Chip bg={C.dim}>{winLabel(t, r.RiskWindow)}</Chip>}
                {r.ResidualL >= 1 && r.ResidualI >= 1 && <Chip bg={C.tgreen}>{t.res_chip} {r.ResidualL * r.ResidualI}</Chip>}
                {(() => { const v = favOf(r, valMap); return v ? <>
                  <Chip bg={FAV_C[v.st] || C.dim}>{favLabel(t, v.st)}</Chip>
                  {v.st === "Flagged" && v.note && <span className="mini" style={{ color: C.crit }}>{v.note}</span>}
                </> : null; })()}
              </div>
              <div className="mini">{t.r_lead}: <b>{r.LeadFA}</b>{r.ContributingFAs && <> · {t.r_with} {r.ContributingFAs}</>} · {r.Scope} · {t.r_owner} {r.RiskOwner}</div>
              <div className="mini">{t.r_lastrev} {String(r.LastReviewed || "").slice(0, 10)} · {t.r_sources}: {r.SourceRefs}{r.ExternalParties && <> · {t.ext_label}: {r.ExternalParties}</>}{r.ClosureReason && <> · {t.close_reason}: {t["cr_" + String(r.ClosureReason).split(" ")[0]] || r.ClosureReason}</>}</div>
              {r.MitigationUpdate && <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{t.mit_latest}</div><div style={{ fontSize: 13 }}>{r.MitigationUpdate}</div></div>}
              <div className="row" style={{ margin: "8px 0" }}>
                <input placeholder={t.mit_ph} value={upd[r._id] || ""} onChange={(e) => setUpd({ ...upd, [r._id]: e.target.value })} style={{ flex: 1, minWidth: 220 }} />
                <Btn small kind="ghost" onClick={() => { const x = (upd[r._id] || "").trim(); if (!x) return say(t.mit_first, true);
                  act(r, { MitigationUpdate: `${todayISO()}: ${x}` }, `mitigation update — ${x}`, fmt(t.mit_posted, { id: r.RegisterID }));
                  setUpd({ ...upd, [r._id]: "" }); }}>{t.mit_post}</Btn>
              </div>
              {rescore(r)}
              {classify(r)}
              <pre className="hist">{r.History}</pre>
              <div className="row">
                <Btn small onClick={() => act(r, {}, "reviewed — no change", fmt(t.m_reviewed, { id: r.RegisterID }))}>{t.a_review}</Btn>
                {r.Status !== "Closed" && <Btn small kind="gold" onClick={() => act(r, { Status: "Escalated" }, "escalated", fmt(t.m_escalated, { id: r.RegisterID }))}>{t.a_escalate}</Btn>}
                {r.Status !== "Closed" ? (clz[r._id] !== undefined ? (
                  <>
                    <select value={clz[r._id]} onChange={(e) => setClz({ ...clz, [r._id]: e.target.value })} style={{ width: "auto" }}>
                      <option value="">{t.close_reason} —</option>
                      {CLOSE_REASONS.map((x) => <option key={x} value={x}>{t["cr_" + x.split(" ")[0]]}</option>)}
                    </select>
                    <Btn small kind="danger" onClick={() => { const rs = clz[r._id]; if (!rs) return say(t.close_need, true);
                      act(r, { Status: "Closed", ClosureReason: rs }, `closed — ${rs}`, fmt(t.m_closed, { id: r.RegisterID }));
                      const c = { ...clz }; delete c[r._id]; setClz(c); }}>{t.close_confirm}</Btn>
                    <Btn small kind="quiet" onClick={() => { const c = { ...clz }; delete c[r._id]; setClz(c); }}>{t.close_cancel}</Btn>
                  </>
                ) : <Btn small kind="danger" onClick={() => setClz({ ...clz, [r._id]: "" })}>{t.a_close}</Btn>)
                  : <Btn small kind="ghost" onClick={() => act(r, { Status: "Open" }, "reopened", fmt(t.m_reopened, { id: r.RegisterID }))}>{t.a_reopen}</Btn>}
                <Btn small kind="quiet" onClick={() => copy(r)}>{t.copy_link}</Btn>
              </div>
            </div>
          )}
        </div></Card>
      ))}
      {!rows.length && <div className="empty">{t.r_none}</div>}
    </>
  );
}

/* ── Guided review round ── */
function ReviewRound({ t, queue, say, onExit }) {
  const [i, setI] = useState(0);
  const [li, setLi] = useState(null);
  const [upd, setUpd] = useState("");
  const [done, setDone] = useState(0);
  if (!queue.length) return (
    <Card accent={C.green}><div className="pad"><div className="h1" style={{ color: C.green }}>{t.rv_title}</div>
      <p className="dim">{t.rv_none}</p><Btn kind="ghost" onClick={onExit}>{t.rv_exit}</Btn></div></Card>
  );
  if (i >= queue.length) return (
    <Card accent={C.green}><div className="pad"><div className="h1" style={{ color: C.green }}>{t.rv_title}</div>
      <p>{fmt(t.rv_done, { n: done })}</p><Btn onClick={onExit}>{t.rv_exit}</Btn></div></Card>
  );
  const r = queue[i];
  const cur = li || { L: r.Likelihood, I: r.Impact };
  const next = () => { setI(i + 1); setLi(null); setUpd(""); };
  const confirm = async () => {
    const parts = []; const patch = {};
    if (+cur.L !== +r.Likelihood || +cur.I !== +r.Impact) {
      const nr = rating(cur.L * cur.I);
      Object.assign(patch, { Likelihood: +cur.L, Impact: +cur.I, CadenceDays: CADENCE[nr] });
      parts.push(`rescored ${r.Likelihood}x${r.Impact} -> ${cur.L}x${cur.I} (${nr})`);
    }
    if (upd.trim()) { patch.MitigationUpdate = `${todayISO()}: ${upd.trim()}`; parts.push(`mitigation update — ${upd.trim()}`); }
    const hist = "review round: " + (parts.length ? parts.join(" · ") : "confirmed — no change");
    try { await api.touchRisk(r, patch, hist); setDone(done + 1); say(fmt(t.m_reviewed, { id: r.RegisterID })); next(); }
    catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); }
  };
  const escalate = async () => {
    try { await api.touchRisk(r, { Status: "Escalated" }, "review round: escalated"); setDone(done + 1);
      say(fmt(t.m_escalated, { id: r.RegisterID })); next(); }
    catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); }
  };
  return (
    <Card accent={C.teal}>
      <div className="rvbar"><b>{t.rv_title}</b><span>{fmt(t.rv_progress, { i: i + 1, n: queue.length })}</span></div>
      <div className="pad">
        <div className="rowsplit">
          <div><b style={{ color: C.teal }}>{r.RegisterID}</b> <span className="cardtitle">{r.Title}</span>
            <div className="mini">{r.LeadFA} · {r.Scope} · {t.r_owner} {r.RiskOwner} · {t.r_lastrev} {String(r.LastReviewed || "").slice(0, 10)}</div></div>
          <span className="row"><Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip>{flagOf(t, r)}</span>
        </div>
        <p className="cec">{r.Cause ? r.Cause + " " : ""}<b>{r.EventClause}</b> {r.Consequence}</p>
        {r.MitigationUpdate && <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{t.mit_latest}</div><div style={{ fontSize: 13 }}>{r.MitigationUpdate}</div></div>}
        <div className="row" style={{ margin: "10px 0" }}>
          <span className="flabel" style={{ marginBottom: 0 }}>{t.resc_label}</span>
          <select value={cur.L} onChange={(e) => setLi({ ...cur, L: e.target.value })} style={{ width: 64 }}>
            {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <span className="mini">×</span>
          <select value={cur.I} onChange={(e) => setLi({ ...cur, I: e.target.value })} style={{ width: 64 }}>
            {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          <Chip bg={RATE_C[rating(cur.L * cur.I)]}>{cur.L * cur.I} · {rateLabel(t, rating(cur.L * cur.I))}</Chip>
        </div>
        <textarea rows={2} placeholder={t.rv_upd} value={upd} onChange={(e) => setUpd(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <Btn onClick={confirm}>{t.rv_confirm}</Btn>
          <Btn kind="gold" onClick={escalate}>{t.a_escalate}</Btn>
          <Btn kind="quiet" onClick={next}>{t.rv_skip}</Btn>
          <Btn kind="ghost" onClick={onExit}>{t.rv_exit}</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ── Issues ── */
function IssuesTab({ t, issues, say, reload }) {
  const [iu, setIu] = useState({});
  const doAct = async (fn, msg) => { try { await fn(); say(msg); reload(); } catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); } };
  if (!issues.length) return <div className="empty">{t.iss_none}</div>;
  return issues.map((i) => {
    const overdue = i.Status === "Open" && i.TargetDate && String(i.TargetDate).slice(0, 10) < todayISO();
    return (
      <Card key={i._id} accent={overdue ? C.crit : undefined}><div className="pad">
        <div className="rowsplit">
          <div><div className="mini">{i.IssueID} · {i.FA}{i.ParentRiskID && <> · {t.iss_parent} {i.ParentRiskID}</>} · {String(i.TargetDate || "").slice(0, 10)}</div>
            <div className="cardtitle">{i.Title}</div><div className="dim" style={{ fontSize: 13 }}>{i.Description}</div></div>
          <div className="row">
            {overdue && <Chip bg={C.crit}>{t.ov_chip}</Chip>}
            {i.RiskLevel && <Chip bg={LVL_C[i.RiskLevel]}>{lvlLabel(t, i.RiskLevel)}</Chip>}
            {i.Status === "Open" && <select value={i.RiskLevel || ""} onChange={(e) => doAct(() => api.setIssueLevel(i, e.target.value), fmt(t.iss_lvl_saved, { id: i.IssueID }))} style={{ width: "auto" }}>
              <option value="">{t.lvl_label} —</option>
              {LVLS.map((l) => <option key={l} value={l}>{lvlLabel(t, l)}</option>)}</select>}
            <Chip bg={i.Status === "Open" ? C.gold : i.Status === "Resolved" ? C.green : C.dim}>{statLabel(t, i.Status)}</Chip>
            {i.Status === "Open" && <Btn small onClick={() => doAct(() => api.resolveIssue(i), fmt(t.iss_resolved, { id: i.IssueID }))}>{t.iss_resolve}</Btn>}
            {i.Status !== "Closed" && <Btn small kind="quiet" onClick={() => doAct(() => api.closeIssue(i), fmt(t.iss_closed, { id: i.IssueID }))}>{t.iss_close}</Btn>}
          </div>
        </div>
        {i.IssueUpdate && <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{t.mit_latest}</div><div style={{ fontSize: 13 }}>{i.IssueUpdate}</div></div>}
        {i.Status === "Open" && <div className="row" style={{ marginTop: 8 }}>
          <input placeholder={t.iss_upd_ph} value={iu[i._id] || ""} onChange={(e) => setIu({ ...iu, [i._id]: e.target.value })} style={{ flex: 1, minWidth: 220 }} />
          <Btn small kind="ghost" onClick={() => { const x = (iu[i._id] || "").trim(); if (!x) return say(t.iss_upd_first, true);
            doAct(() => api.issueUpdate(i, x), fmt(t.iss_upd_posted, { id: i.IssueID })); setIu({ ...iu, [i._id]: "" }); }}>{t.iss_upd_post}</Btn>
        </div>}
      </div></Card>
    );
  });
}

/* ── Health ── */
function Health({ t, reg, intake, issues, say, reload, dueCount, onStartReview, tour, valMap, regAll }) {
  const fileRef = useRef(null);
  const [imp, setImp] = useState(null);
  const onFile = async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    setImp(t.imp_read);
    try {
      // ExcelJS/xlsx load on demand — they stay out of the main bundle.
      const { parseRegisterFile } = await import("./excel.js");
      const { rows, report } = await parseRegisterFile(file);
      if (!rows.length) { setImp(fmt(t.imp_none, { r: report.notes[0] || "—" })); return; }
      rows.forEach((r) => { if (!["AC27", "GC27"].includes(r.Tournament)) r.Tournament = tour || "AC27"; });
      const res = await api.importRegister(rows, reg, (i, n) => setImp(fmt(t.imp_ing, { i, t: n })));
      setImp(fmt(t.imp_done, { a: res.imported, b: res.skippedDup,
        c: (res.skippedSim ? fmt(t.imp_sim, { n: res.skippedSim }) : "") + (res.assignedIds ? fmt(t.imp_ids, { n: res.assignedIds }) : ""),
        d: res.failed ? fmt(t.imp_fail, { n: res.failed }) : "" }));
      say(fmt(t.imp_toast, { n: res.imported })); reload();
    } catch (err) { setImp(fmt(t.imp_err, { e: err.message })); }
  };
  const open = reg.filter((r) => r.Status !== "Closed");
  const byRate = {}; open.forEach((r) => (byRate[r.Rating] = (byRate[r.Rating] || 0) + 1));
  const decided = intake.filter((s) => s.Status !== "Pending triage");
  const cnt = (st) => intake.filter((s) => s.Status === st).length;
  const dupRate = decided.length ? Math.round((100 * cnt("Merged")) / decided.length) : 0;
  const { due, forgotten } = splitDue(reg);
  const inCad = open.length - due.length - forgotten.length;
  const kpiRev = open.length ? Math.round((100 * inCad) / open.length) : 100;
  const hygiene = open.map((r) => ({ r, g: hygieneGaps(r) })).filter((x) => x.g.length);
  const subst = open.filter((r) => {
    const m = String(r.MitigationUpdate || "");
    return /^\d{4}-\d{2}-\d{2}/.test(m) && ageDays(m.slice(0, 10)) <= effCadence(r.Rating, r.CadenceDays, dtkOf(r));
  });
  const substPct = open.length ? Math.round((100 * subst.length) / open.length) : 100;
  const captureNow = async () => {
    const base = regAll || reg;
    const openA = base.filter((r) => r.Status !== "Closed");
    const { due: dA, forgotten: fA } = splitDue(base);
    const nr = (k) => openA.filter((r) => r.Rating === k).length;
    const inC = openA.length - dA.length - fA.length;
    try {
      await api.captureKpi(isoWeek(), {
        OpenTotal: openA.length, CriticalN: nr("Critical"), HighN: nr("High"), MediumN: nr("Medium"), LowN: nr("Low"),
        ReviewedPct: openA.length ? Math.round((100 * inC) / openA.length) : 100,
        ForgottenN: fA.length, EscalatedN: openA.filter((r) => r.Status === "Escalated").length,
        IssuesOpen: issues.filter((i) => i.Status === "Open").length,
      });
      say(fmt(t.cap_done, { w: isoWeek() }));
    } catch (e) { say(`Failed — ${e.message}`, true); }
  };
  const KPI = ({ label, value, ok }) => (
    <div className="kpi" style={{ borderTopColor: ok ? C.green : C.crit }}>
      <div className="kpinum" style={{ color: ok ? C.green : C.crit }}>{value}</div>
      <div className="kpilabel">{label}</div></div>
  );
  const dl = () => {
    const md = [`# Weekly summary — ${isoWeek()}`,
      `Submissions ${intake.length} · admitted ${cnt("Admitted")} · merged ${cnt("Merged")} · issues ${cnt("Converted to issue")} · returned ${cnt("Returned")}`,
      `Open ${open.length} (${Object.entries(byRate).map(([k, v]) => `${k}:${v}`).join(" · ")}) · duplicates ${dupRate}% · reviewed on time ${kpiRev}% · forgotten ${forgotten.length}`,
      ...forgotten.map((z) => `- FORGOTTEN ${z.RegisterID} (${z.Rating}) ${z.Title} — ${ageDays(z.LastReviewed)}d since review`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `weekly_summary_${isoWeek()}.md`; a.click();
  };
  return (
    <>
      <div className="mini" style={{ marginBottom: 8 }}>{phaseLine(t, tour)}</div>
      <div className="kpis">
        <KPI label={t.k_dup} value={`${dupRate}%`} ok={dupRate < 10} />
        <KPI label={t.k_ontime} value={`${kpiRev}%`} ok={kpiRev >= 95} />
        <KPI label={t.k_forgot} value={forgotten.length} ok={!forgotten.length} />
        <KPI label={t.k_open} value={open.length} ok />
      </div>
      <Card><div className="pad">
        <div className="cardtitle">{t.h_week}</div>
        <div className="dim">{fmt(t.h_line, { s: intake.length, a: cnt("Admitted"), m: cnt("Merged"),
          i: cnt("Converted to issue"), r: cnt("Returned"), oi: issues.filter((x) => x.Status === "Open").length })}</div>
        {[...due, ...forgotten].map((r) => <div key={r._id} className="mini">
          <b style={{ color: forgotten.includes(r) ? C.crit : C.high }}>{forgotten.includes(r) ? t.h_forgot : t.h_due}</b> — {r.RegisterID} ({rateLabel(t, r.Rating)}) {r.Title} · {ageDays(r.LastReviewed)}d</div>)}
      </div></Card>
      <div className="fhint" style={{ marginBottom: 8 }}>{fmt(t.k_subst, { p: substPct })}</div>
      <Participation t={t} reg={reg} intake={intake} say={say} valMap={valMap} />
      <Card accent={hygiene.length ? C.gold : C.green}><div className="pad">
        <div className="slabel">{t.hy_title}</div>
        {!hygiene.length ? <div className="dim" style={{ fontSize: 13 }}>{t.hy_ok}</div> : (
          <>
            <div className="mini" style={{ marginBottom: 6 }}>{fmt(t.hy_n, { n: hygiene.length })}</div>
            {hygiene.map(({ r, g }) => <div key={r._id} className="mini">
              <b style={{ color: C.teal }}>{r.RegisterID}</b> {r.Title} — <span style={{ color: C.crit }}>{g.map((k) => t[k]).join(" · ")}</span></div>)}
          </>
        )}
      </div></Card>
      <div className="row">
        <Btn kind="gold" onClick={onStartReview} disabled={!dueCount}>{fmt(t.b_review, { n: dueCount })}</Btn>
        <Btn onClick={async () => { try { (await import("./excel.js")).exportRegister(reg, issues); } catch (e) { say(`Failed — ${e.message}`, true); } }}>{t.b_dlx}</Btn>
        <Btn kind="gold" onClick={() => fileRef.current && fileRef.current.click()}>{t.b_upx}</Btn>
        <Btn kind="ghost" onClick={dl}>{t.b_dls}</Btn>
        <Btn kind="quiet" onClick={captureNow}>{t.cap_btn}</Btn>
        <input type="file" accept=".xlsx,.xls" style={{ display: "none" }} ref={fileRef} onChange={onFile} />
      </div>
      {imp && <div className="fhint" style={{ marginTop: 8 }}>{imp}</div>}
      <div className="fhint" style={{ marginTop: 6 }}>{t.imp_hint}</div>
    </>
  );
}

/* ── Trend chart (hand-rolled SVG) ── */
function TrendChart({ t, data }) {
  if (!data.length) return null;
  const n = data.length, W = 600, H = 168, x0 = 26, bw = ((W - x0 - 10) / n) * 0.55;
  const step = (W - x0 - 10) / n;
  const maxOpen = Math.max(...data.map((d) => d.OpenTotal || 1), 1);
  const yBase = 122, band = 88;
  const yOf = (v) => yBase - (v / maxOpen) * band;
  const pctY = (p) => yBase - (p / 100) * band;
  const order = [["LowN", C.green], ["MediumN", C.gold], ["HighN", C.high], ["CriticalN", C.crit]];
  const pts = data.map((d, i) => `${x0 + i * step + step / 2},${pctY(d.ReviewedPct || 0)}`).join(" ");
  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img">
      <line x1={x0} y1={pctY(95)} x2={W - 8} y2={pctY(95)} stroke={C.tgreen} strokeDasharray="5 4" strokeWidth="1.4" />
      <text x={W - 8} y={pctY(95) - 4} fontSize="9" textAnchor="end" fill={C.tgreen}>{t.tr_target}</text>
      {data.map((d, i) => {
        const x = x0 + i * step + (step - bw) / 2;
        let y = yBase;
        return (
          <g key={d.Title}>
            {order.map(([k, col]) => {
              const v = d[k] || 0; if (!v) return null;
              const h = (v / maxOpen) * band; y -= h;
              return <rect key={k} x={x} y={y} width={bw} height={h} fill={col} />;
            })}
            <text x={x + bw / 2} y={y - 4} fontSize="10" fontWeight="700" textAnchor="middle" fill={C.teal}>{d.OpenTotal}</text>
            {(d.ForgottenN || 0) > 0 && <rect x={x} y={yBase + 3} width={bw} height={3} fill={C.crit} />}
            <text x={x + bw / 2} y={H - 26} fontSize="8.5" textAnchor="middle">{String(d.Title).slice(-3)}</text>
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke={C.tealDark} strokeWidth="2" />
      {data.map((d, i) => <circle key={i} cx={x0 + i * step + step / 2} cy={pctY(d.ReviewedPct || 0)} r="2.6" fill={C.tealDark} />)}
      <text x={x0} y={H - 8} fontSize="9" fill={C.dim}>▬ {t.tr_ontime}   ·   ▮ {t.tr_forgot}</text>
    </svg>
  );
}

/* ── Executive view ── */
function ExecView({ t, reg, regAll, intake, issues, onRefresh, tour, valMap }) {
  const [city, setCity] = useState("");
  const [sel, setSel] = useState(null);
  const [kpi, setKpi] = useState([]);
  const captured = useRef(false);

  useEffect(() => {
    if (api.demo) return;
    const id = setInterval(onRefresh, 300000);
    return () => clearInterval(id);
  }, [onRefresh]);
  const stamp = useMemo(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), [reg]);

  const allOpen = reg.filter((r) => r.Status !== "Closed");
  const open = allOpen.filter((r) => !city || r.Scope === city);
  const byRate = (k) => open.filter((r) => r.Rating === k).length;
  const esc = open.filter((r) => r.Status === "Escalated");
  const { due, forgotten } = splitDue(city ? open : reg);
  const inCad = open.length - due.filter((r) => open.includes(r)).length - forgotten.filter((r) => open.includes(r)).length;
  const kpiRev = open.length ? Math.round((100 * inCad) / open.length) : 100;
  const cnt = (st) => intake.filter((s) => s.Status === st).length;
  const closedWk = reg.filter((r) => {
    if (r.Status !== "Closed") return false;
    const m = String(r.History || "").match(/(\d{4}-\d{2}-\d{2})[^\n]*closed/g);
    return m ? ageDays(m[m.length - 1].slice(0, 10)) <= 7 : false;
  }).length;

  // capture weekly KPI snapshot — programme-wide (all tournaments), deduped per week
  useEffect(() => {
    if (captured.current || !(regAll || []).length) return;
    captured.current = true;
    const openA = regAll.filter((r) => r.Status !== "Closed");
    const { due: dA, forgotten: fA } = splitDue(regAll);
    const nr = (k) => openA.filter((r) => r.Rating === k).length;
    const inC = openA.length - dA.length - fA.length;
    api.captureKpi(isoWeek(), {
      OpenTotal: openA.length, CriticalN: nr("Critical"), HighN: nr("High"), MediumN: nr("Medium"), LowN: nr("Low"),
      ReviewedPct: openA.length ? Math.round((100 * inC) / openA.length) : 100,
      ForgottenN: fA.length, EscalatedN: openA.filter((r) => r.Status === "Escalated").length,
      IssuesOpen: issues.filter((i) => i.Status === "Open").length,
    }).then(() => api.listKpi()).then((rows) => setKpi(rows.sort((a, b) => (a.Title < b.Title ? -1 : 1)).slice(-8)))
      .catch(() => {});
  }, [regAll, issues]);

  const heat = {};
  open.forEach((r) => { if (r.Likelihood >= 1 && r.Impact >= 1) { const k = `${r.Likelihood}-${r.Impact}`; heat[k] = (heat[k] || 0) + 1; } });
  const band = (s) => (s >= 16 ? C.crit : s >= 10 ? C.high : s >= 5 ? C.gold : C.green);
  const cellRisks = sel ? open.filter((r) => r.Likelihood === sel.L && r.Impact === sel.I) : [];
  const top = [...open].sort((a, b) => ((b.Status === "Escalated") - (a.Status === "Escalated")) || ((b.Score || 0) - (a.Score || 0))).slice(0, 6);

  const byFA = {};
  open.forEach((r) => { const k = r.LeadFA || "—";
    byFA[k] = byFA[k] || { Critical: 0, High: 0, Medium: 0, Low: 0, t: 0 };
    byFA[k][r.Rating] = (byFA[k][r.Rating] || 0) + 1; byFA[k].t++; });
  const fas = Object.entries(byFA).sort((a, b) => b[1].t - a[1].t).slice(0, 6);
  const maxT = fas.length ? fas[0][1].t : 1;
  const scopes = {};
  allOpen.forEach((r) => { const k = r.Scope || "—"; scopes[k] = (scopes[k] || 0) + 1; });

  const Big = ({ n, label, warn }) => (
    <div className="kpi" style={{ borderTopColor: warn ? C.crit : C.teal }}>
      <div className="kpinum" style={{ color: warn ? C.crit : C.teal }}>{n}</div>
      <div className="kpilabel">{label}</div></div>
  );

  // ── Decision drivers ──
  const ks = [...kpi].sort((a, b) => (a.Title < b.Title ? -1 : 1));
  const lastK = ks[ks.length - 1], prevK = ks[ks.length - 2];
  const Delta = ({ label, cur, prev, goodUp }) => {
    const d = cur - prev;
    const col = d === 0 ? C.dim : (d > 0) === !!goodUp ? C.green : C.crit;
    return <span className="mini" style={{ marginInlineEnd: 14 }}>{label} <b>{cur}</b>{" "}
      <b style={{ color: col }}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"}{d !== 0 ? Math.abs(d) : ""}</b></span>;
  };
  const overdueTD = (r) => r.TargetDate && String(r.TargetDate).slice(0, 10) < todayISO();
  const attn = open
    .filter((r) => r.Status === "Escalated" || isBreach(r) || (["High", "Critical"].includes(r.Rating) && overdueTD(r)))
    .sort((a, b) => (b.Score || 0) - (a.Score || 0)).slice(0, 8);
  const withRes = open.filter((r) => r.ResidualL >= 1 && r.ResidualI >= 1 && r.Score > 0);
  const mitAvg = withRes.length
    ? Math.round((100 * withRes.reduce((s, r) => s + Math.max(0, (r.Score - r.ResidualL * r.ResidualI) / r.Score), 0)) / withRes.length) : 0;
  const mitCov = open.length ? Math.round((100 * withRes.length) / open.length) : 0;
  const valPct = open.length
    ? Math.round((100 * open.filter((r) => favOf(r, valMap)?.st === "Validated").length) / open.length) : 100;

  return (
    <>
      <div className="rowsplit" style={{ marginBottom: 6 }}>
        <div className="h1" style={{ margin: 0 }}>{t.ex_title} <span style={{ color: C.gold }}>— {tour || t.tour_all}</span></div>
        <div className="row">
          <select value={city} onChange={(e) => { setCity(e.target.value); setSel(null); }}>
            <option value="">{t.ex_allcities}</option>
            {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="mini">{fmt(t.ex_live, { t: stamp })}</span>
          <Btn small kind="quiet" onClick={onRefresh}>{t.ex_refresh}</Btn>
        </div>
      </div>
      <div className="mini" style={{ marginBottom: 8 }}>{phaseLine(t, tour)}</div>

      <div className="kpis">
        <Big n={open.length} label={t.ex_open} />
        <Big n={byRate("Critical")} label={t.ex_crit} warn={byRate("Critical") > 0} />
        <Big n={esc.length} label={t.ex_esc} warn={esc.length > 0} />
        <Big n={forgotten.length} label={t.ex_forgot} warn={forgotten.length > 0} />
      </div>

      <div className="exgrid">
        <Card><div className="pad">
          <div className="slabel">{t.ex_heat}</div>
          <div className="hm">
            <div className="hm-corner">{t.ex_axis}</div>
            {[1,2,3,4,5].map((i) => <div key={"h"+i} className="hm-ax">{i}</div>)}
            {[5,4,3,2,1].map((L) => (
              <React.Fragment key={"r"+L}>
                <div className="hm-ax">{L}</div>
                {[1,2,3,4,5].map((I) => {
                  const n = heat[`${L}-${I}`] || 0;
                  const isSel = sel && sel.L === L && sel.I === I;
                  return <div key={`${L}-${I}`}
                    className={`hm-cell ${n ? "clickable" : ""} ${isSel ? "sel" : ""}`}
                    role={n ? "button" : undefined} tabIndex={n ? 0 : undefined}
                    aria-label={`L${L} × I${I}: ${n}`}
                    onClick={() => n && setSel(isSel ? null : { L, I })}
                    onKeyDown={(e) => { if (n && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSel(isSel ? null : { L, I }); } }}
                    style={{ background: band(L * I), opacity: n ? 1 : 0.28 }}>{n || ""}</div>;
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {Object.keys(RATE_C).map((k) => <Chip key={k} bg={RATE_C[k]}>{rateLabel(t, k)}</Chip>)}
          </div>
        </div></Card>

        <Card><div className="pad">
          {sel ? (
            <>
              <div className="rowsplit"><div className="slabel">{fmt(t.ex_cell, { L: sel.L, I: sel.I })}</div>
                <Btn small kind="quiet" onClick={() => setSel(null)}>{t.ex_clear}</Btn></div>
              {cellRisks.map((r) => (
                <div key={r._id} className="soprow">
                  <div style={{ minWidth: 58 }}><Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip></div>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: C.teal }}>{r.RegisterID}</b> {r.Title}
                    {!tour && <> <Chip bg={C.teal}>{r.Tournament || "AC27"}</Chip></>}
                    <div className="mini">{r.LeadFA} · {r.Scope} · {t.r_owner} {r.RiskOwner}</div>
                    {r.MitigationUpdate && <div className="mini" style={{ color: C.tgreen }}>↳ {String(r.MitigationUpdate).slice(0, 140)}</div>}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="slabel">{t.ex_top}</div>
              {top.map((r) => (
                <div key={r._id} className="soprow">
                  <div style={{ minWidth: 58 }}><Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip></div>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: C.teal }}>{r.RegisterID}</b> {r.Title}
                    {!tour && <> <Chip bg={C.teal}>{r.Tournament || "AC27"}</Chip></>}
                    {isBreach(r) && <> <Chip bg={C.crit}>{t.appetite_chip}</Chip></>}
                    {r.RiskLevel && <> <Chip bg={LVL_C[r.RiskLevel]}>{lvlLabel(t, r.RiskLevel)}</Chip></>}
                    {r.Status === "Escalated" && <> <Chip bg={C.crit}>{t.stat_Escalated}</Chip></>}
                    <div className="mini">{r.LeadFA} · {r.Scope} · {t.r_owner} {r.RiskOwner}</div>
                    {r.MitigationUpdate && <div className="mini" style={{ color: C.tgreen }}>↳ {String(r.MitigationUpdate).slice(0, 140)}</div>}
                  </div>
                </div>
              ))}
              {!top.length && <div className="empty">{t.ex_empty}</div>}
            </>
          )}
        </div></Card>
      </div>

      <Card accent={C.teal}><div className="pad">
        <div className="slabel">{t.dd_title}</div>
        {prevK && lastK && (
          <div style={{ marginBottom: 10 }}>
            <span className="flabel" style={{ marginInlineEnd: 10 }}>{t.dd_wow}</span>
            <Delta label={t.ex_open} cur={+lastK.OpenTotal || 0} prev={+prevK.OpenTotal || 0} />
            <Delta label={t.ex_crit} cur={+lastK.CriticalN || 0} prev={+prevK.CriticalN || 0} />
            <Delta label={t.ex_esc} cur={+lastK.EscalatedN || 0} prev={+prevK.EscalatedN || 0} />
            <Delta label={t.k_ontime} cur={+lastK.ReviewedPct || 0} prev={+prevK.ReviewedPct || 0} goodUp />
          </div>
        )}
        <div className="flabel">{t.dd_attn}</div>
        {attn.length ? attn.map((r) => (
          <div key={r._id} className="soprow">
            <div style={{ minWidth: 58 }}><Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip></div>
            <div style={{ flex: 1 }}>
              <b style={{ color: C.teal }}>{r.RegisterID}</b> {r.Title}
              {!tour && <> <Chip bg={C.teal}>{r.Tournament || "AC27"}</Chip></>}
              {r.Status === "Escalated" && <> <Chip bg={C.crit}>{statLabel(t, "Escalated")}</Chip></>}
              {isBreach(r) && <> <Chip bg={C.crit}>{t.appetite_chip}</Chip></>}
              {["High", "Critical"].includes(r.Rating) && overdueTD(r) && <> <Chip bg={C.high}>{t.dd_over}</Chip></>}
              <div className="mini">{r.LeadFA} · {t.r_owner} {r.RiskOwner} · {String(r.TargetDate || "").slice(0, 10)}</div>
            </div>
          </div>
        )) : <div className="fhint">{t.dd_attn_none}</div>}
        <div className="mini" style={{ marginTop: 10 }}><b>{t.dd_mit}:</b> {withRes.length ? fmt(t.dd_mit_v, { p: mitAvg, c: mitCov }) : t.dd_mit_none}</div>
        <div className="mini"><b>{t.dd_val}:</b> {fmt(t.dd_val_v, { p: valPct })}</div>
      </div></Card>

      {kpi.length > 1 && (
        <Card><div className="pad">
          <div className="rowsplit"><div className="slabel">{fmt(t.tr_title, { n: kpi.length })}</div>
            <span className="fhint">{t.tr_note}</span></div>
          <TrendChart t={t} data={kpi} />
        </div></Card>
      )}

      <Card><div className="pad">
        <div className="slabel">{t.ex_week}</div>
        <div className="dim" style={{ fontSize: 14 }}>
          {fmt(t.ex_line, { s: intake.length, a: cnt("Admitted"), m: cnt("Merged"), r: cnt("Returned"),
            c: closedWk, p: kpiRev, oi: issues.filter((i) => i.Status === "Open").length })}
        </div>
        {forgotten.length > 0 && <div className="warn" style={{ marginTop: 8 }}>
          {t.ex_attn}{forgotten.map((r) => `${r.RegisterID} (${ageDays(r.LastReviewed)}d)`).join(" · ")}</div>}
      </div></Card>

      <Card><div className="pad">
        <div className="slabel">{t.ex_exp}</div>
        {fas.map(([fa, v]) => (
          <div key={fa} className="barrow">
            <div className="barlabel">{fa}</div>
            <div className="bar">
              {["Critical","High","Medium","Low"].map((k) => v[k] ? <div key={k} className="barseg"
                style={{ width: `${(v[k] / maxT) * 100}%`, background: RATE_C[k] }} title={`${rateLabel(t, k)}: ${v[k]}`} /> : null)}
            </div>
            <div className="barn">{v.t}</div>
          </div>
        ))}
        <div className="mini" style={{ marginTop: 8 }}>
          {t.ex_city}{Object.entries(scopes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </div>
      </div></Card>
    </>
  );
}

/* ── How it works ── */
function SOPView({ t }) {
  const Step = ({ d, tt, body }) => (
    <div className="soprow"><div className="sopday">{d}</div>
      <div><b>{tt}</b><div className="dim" style={{ fontSize: 13 }}>{body}</div></div></div>
  );
  const St = ({ bg, label, body }) => (
    <div className="row" style={{ marginBottom: 8 }}><Chip bg={bg}>{label}</Chip>
      <span className="dim" style={{ fontSize: 13 }}>{body}</span></div>
  );
  return (
    <>
      <Card accent={C.teal}><div className="pad">
        <div className="h1">{t.how_week_t}</div>
        <Step d={t.d_sun} tt={t.how_sun_t} body={t.how_sun_b} />
        <Step d={t.d_mon} tt={t.how_mon_t} body={t.how_mon_b} />
        <Step d={t.d_tue} tt={t.how_tue_t} body={t.how_tue_b} />
        <Step d={t.d_wed} tt={t.how_wed_t} body={t.how_wed_b} />
        <Step d={t.d_thu} tt={t.how_thu_t} body={t.how_thu_b} />
      </div></Card>
      <Card accent={C.teal}><div className="pad">
        <div className="h1">{t.how_fw_t}</div>
        <Step d="🥇" tt={t.how_gold_t} body={t.how_gold_b} />
        <Step d="🥈" tt={t.how_silver_t} body={t.how_silver_b} />
        <Step d="🥉" tt={t.how_bronze_t} body={t.how_bronze_b} />
        <div className="fhint" style={{ marginTop: 8 }}>{t.how_appetite}</div>
      </div></Card>
      <Card accent={C.crit}><div className="pad">
        <div className="slabel" style={{ color: C.crit }}>{t.how_esc_t}</div>
        <Step d="1" tt={t.how_esc_1.split(" (")[0]} body={t.how_esc_1} />
        <Step d="2" tt={t.how_esc_2.split(".")[0]} body={t.how_esc_2} />
        <Step d="3" tt={t.how_esc_3.split(" —")[0].slice(0, 60)} body={t.how_esc_3} />
        <Step d="4" tt={t.how_esc_4.split(":")[0]} body={t.how_esc_4} />
        <div className="fhint" style={{ marginTop: 8 }}>{t.how_cont}</div>
      </div></Card>
      <Card accent={C.gold}><div className="pad">
        <div className="slabel">{t.how_write_t}</div>
        <div className="statement">{t.how_stmt}</div>
        <p className="dim" style={{ fontSize: 13, marginTop: 8 }}>{t.how_write_b1}<b>{t.typeIssue}</b>{t.how_write_b2}</p>
        <div className="warn">{t.how_urgent}</div>
      </div></Card>
      <Card><div className="pad">
        <div className="slabel">{t.how_status_t}</div>
        <St bg={C.dim} label={t.st_pending} body={t.how_pending} />
        <St bg={C.green} label={t.st_admitted} body={t.how_admitted} />
        <St bg={C.tgreen} label={t.st_merged} body={t.how_merged} />
        <St bg={C.gold} label={t.st_issue} body={t.how_issue} />
        <St bg={C.crit} label={t.st_returned} body={t.how_returned} />
        <div className="fhint" style={{ marginTop: 10 }}>{t.how_health}</div>
      </div></Card>
    </>
  );
}

/* ── PMO gate ── */
function GateCard({ t, onTry, say }) {
  const [pw, setPw] = useState("");
  const go = () => { if (!onTry(pw)) { say(t.gate_bad, true); setPw(""); } };
  return (
    <Card accent={C.gold}><div className="pad">
      <div className="h1">{t.gate_t}</div>
      <p className="dim">{t.gate_b}</p>
      <div className="row">
        <input type="password" value={pw} placeholder={t.gate_ph} autoFocus
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} style={{ maxWidth: 260 }} />
        <Btn onClick={go}>{t.gate_btn}</Btn>
      </div>
    </div></Card>
  );
}

/* ── FA view — champions validate risks recorded on their behalf ── */
function FAView({ t, reg, me, say, reload, valMap }) {
  const [fa, setFa] = useState(() => { try { return localStorage.getItem("myFA") || ""; } catch { return ""; } });
  const [pendOnly, setPendOnly] = useState(true);
  const [note, setNote] = useState({});
  const pick = (v) => { setFa(v); try { localStorage.setItem("myFA", v); } catch {} };
  const mineReg = reg.filter((r) => r.Status !== "Closed" &&
    (r.LeadFA === fa || String(r.ContributingFAs || "").includes(fa)));
  const rows = pendOnly ? mineReg.filter((r) => favOf(r, valMap)?.st !== "Validated") : mineReg;
  const verdict = async (r, status) => {
    const n = (note[r._id] || "").trim();
    if (status === "Flagged" && !n) return say(t.fa_flagfirst, true);
    try { await api.addValidation({ RegisterID: r.RegisterID, FA: fa, Verdict: status, Note: n });
      say(fmt(status === "Validated" ? t.fa_validated_t : t.fa_flagged_t, { id: r.RegisterID })); reload(); }
    catch (e) { say(e.status === 403 ? t.t_norights : `Failed — ${e.message}`, true); }
  };
  return (
    <>
      <Card accent={C.teal}><div className="pad">
        <div className="grid2">
          <Field label={t.fa_pick}><Sel value={fa} onChange={(e) => pick(e.target.value)} options={FAS} /></Field>
          <Field label=" ">
            <label className="mini" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={pendOnly} onChange={(e) => setPendOnly(e.target.checked)} />
              {t.fa_pendingOnly}</label></Field>
        </div>
        <div className="fhint">{t.fa_intro}</div>
      </div></Card>
      {fa && !rows.length && <div className="empty">{t.fa_none}</div>}
      {fa && rows.map((r) => (
        <Card key={r._id} accent={FAV_C[favOf(r, valMap)?.st] || C.line}><div className="pad">
          <div className="rowsplit">
            <div><b style={{ color: C.teal }}>{r.RegisterID}</b> <span className="cardtitle">{r.Title}</span>
              <div className="mini">{r.LeadFA === fa ? t.r_lead : t.r_with}: {fa} · {r.Scope} · {t.r_owner} {r.RiskOwner}</div></div>
            <span className="row">{isBreach(r) && <Chip bg={C.crit}>{t.appetite_chip}</Chip>}{r.RiskLevel && <Chip bg={LVL_C[r.RiskLevel]}>{lvlLabel(t, r.RiskLevel)}</Chip>}<Chip bg={RATE_C[r.Rating]}>{r.Score}</Chip>
              {(() => { const v = favOf(r, valMap); return <Chip bg={FAV_C[v?.st] || C.dim}>{favLabel(t, v?.st || "Pending validation")}</Chip>; })()}</span>
          </div>
          <p className="cec">{r.Cause ? r.Cause + " " : ""}<b>{r.EventClause}</b> {r.Consequence}</p>
          {r.MitigationUpdate && <div className="updbox"><div className="slabel" style={{ color: C.tgreen }}>{t.mit_latest}</div><div style={{ fontSize: 13 }}>{r.MitigationUpdate}</div></div>}
          {favOf(r, valMap)?.st !== "Validated" && (
            <>
              <input placeholder={t.fa_flagph} value={note[r._id] || ""} onChange={(e) => setNote({ ...note, [r._id]: e.target.value })} style={{ marginTop: 6 }} />
              <div className="row" style={{ marginTop: 8 }}>
                <Btn small onClick={() => verdict(r, "Validated")}>{t.fa_validate}</Btn>
                <Btn small kind="danger" onClick={() => verdict(r, "Flagged")}>{t.fa_flag}</Btn>
              </div>
            </>
          )}
        </div></Card>
      ))}
    </>
  );
}

/* ── Participation & compliance (PMO Health) ── */
function Participation({ t, reg, intake, say, valMap }) {
  const [showSilent, setShowSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitted = new Set(intake.map((s) => s.FunctionalArea).filter(Boolean));
  const silent = FAS.filter((f) => !submitted.has(f));
  const open = reg.filter((r) => r.Status !== "Closed");
  const pendVal = open.filter((r) => favOf(r, valMap)?.st === "Pending validation");
  const flagged = open.filter((r) => favOf(r, valMap)?.st === "Flagged");
  const remind = async () => {
    setBusy(true);
    try {
      const champs = await api.listChampions();
      const needFA = new Set([...silent, ...pendVal.map((r) => r.LeadFA)]);
      const targets = champs.filter((c) => needFA.has(c.Title || c.FA) && (c.ChampionEmail || "").includes("@"));
      if (!needFA.size) { say(t.remind_none); setBusy(false); return; }
      if (api.demo) { say(fmt(t.remind_demo, { n: targets.length })); setBusy(false); return; }
      let sent = 0;
      for (const c of targets) {
        const fa = c.Title || c.FA;
        const pend = pendVal.filter((r) => r.LeadFA === fa).map((r) => `- ${r.RegisterID} ${r.Title}`).join("\n");
        try {
          await api.sendMail(c.ChampionEmail, `AC27 Risk — weekly reminder (${fa})`,
            `${silent.includes(fa) ? "Your FA has not submitted this week. Intake closes Sunday 12:00.\n\n" : ""}` +
            `${pend ? "Risks awaiting your FA validation:\n" + pend + "\n\n" : ""}` +
            `Open the Risk Console → FA view to validate, or Submit a risk.`);
          sent++;
        } catch { /* skip */ }
      }
      say(fmt(t.remind_done, { s: sent, m: needFA.size - targets.length }));
    } catch (e) { say(`Failed — ${e.message}`, true); }
    setBusy(false);
  };
  return (
    <Card accent={silent.length || pendVal.length ? C.gold : C.green}><div className="pad">
      <div className="rowsplit">
        <div className="slabel">{t.part_title}</div>
        <Btn small kind="gold" disabled={busy} onClick={remind}>{t.b_remind}</Btn>
      </div>
      <div className="mini" style={{ marginBottom: 4 }}>
        <b style={{ color: C.teal }}>{fmt(t.part_line, { x: submitted.size, n: FAS.length })}</b>
        {" · "}{fmt(t.part_valpend, { n: pendVal.length })}
        {flagged.length > 0 && <> · <span style={{ color: C.crit }}>{fmt(t.part_flagged, { n: flagged.length })}</span></>}
      </div>
      {silent.length > 0 && (
        <div className="mini">{t.part_silent} <button className="langbtn" style={{ color: C.teal, borderColor: C.line }}
          onClick={() => setShowSilent(!showSilent)}>{showSilent ? t.part_hide : `${t.part_show} (${silent.length})`}</button>
          {showSilent && <div style={{ marginTop: 6 }}>{silent.join(" · ")}</div>}</div>
      )}
    </div></Card>
  );
}

export { Landing, SubmitView, MineView, FAView, PMO, Queue, RegisterTab, ReviewRound, IssuesTab, Health, Participation, ExecView, TrendChart, SOPView, GateCard };
