// ── APP-RSK-01 configuration — the only file you edit ─────────────────
// Demo mode: open the app with ?demo=1 to run on in-memory sample data,
// no Entra registration and no SharePoint needed. Remove for production.
export const CONFIG = {
  // Entra ID (Azure AD) app registration — SPA platform
  tenantId: "YOUR-TENANT-ID",          // Directory (tenant) ID
  clientId: "YOUR-CLIENT-ID",          // Application (client) ID
  // SharePoint site hosting the PLT-RSK-01 lists (Central Planning Hub)
  spHostname: "asiancup2027.sharepoint.com",
  spSitePath: "/sites/centralplanninghub", // site containing the six lists
  lists: { intake: "Risk Intake", register: "Risk Register", issues: "Issues Log", kpi: "Risk KPI Snapshots", champions: "FA Champions", validations: "FA Validations" },
  kickoffDate: "2027-01-07",   // AC27 fallback; per-tournament dates below
  tournaments: [
    { id: "AC27", kicker: "AFC Asian Cup Saudi Arabia 2027 · Local Organising Committee", kickoff: "2027-01-07" },
    { id: "GC27", kicker: "27th Arabian Gulf Cup · Local Organising Committee", kickoff: "2026-09-21" }, // TODO: GC27 venue/scope plan
  ],
  progKicker: "AC27 · GC27 Tournament Programme · Local Organising Committee",
  scopes: ["User.Read", "Sites.ReadWrite.All", "Mail.Send"],  // delegated; ReadWrite needs admin consent
  // PMO triage gate — SHA-256 of the team password (no plaintext stored).
  // To change: open the app, press F12, type  pmoHash("NewPassword")  and paste the result here.
  pmoGate: { enabled: true, sha256: "b3d1d27c52bf6e4005fec2d2a0224d3acd0cc710fdb31052ac5c954aac3c1e48" },
};
export const BRAND = {
  teal:"#065C5D", tealDark:"#04393A", tgreen:"#00937B", green:"#007542",
  gold:"#C88214", high:"#D97A1A", crit:"#9C1F1F",
  ink:"#10201F", paper:"#F7F5F0", line:"#E3E0D8", dim:"#6B6A63",
};
export const FAS = ["Access and Accreditation Management","Accommodation","Administration (Facility management and Admin)","Broadcast","Catering","Ceremonies and Events Operations","Cleaning & Waste","Commercial Operations","Competition Management","Corporate Planing","Cybersecurity","Dressing and Signage","Event Experience","Event Planning","Fan ID","Fan Operations","Finance","Football Technology","Health and Safety","Host Country Integration","Human Resources","IT and Digital Services","Language Services","Event Legal","Logistics","Maps and Plans","Marketing","Media","Media Operations","Medical Services","Operational Readiness","Outsource","Overlay Infrastructure","Power Infrastructure","Procurement and Contracts","Tournament PMO","Operation PMO","Protocol and Guest Management","Referee Services","Security","Special Events","Sustainability & Legacy","Teams Services","Technical Services","Ticketing","Tournament City Operations","Training Sites","Transport","Venue IT","Venue Management","Visa","Volunteer Management","Workforce Operations"];
export const CATS = ["Safety & Security","Operational Delivery","Venue & Infrastructure","Transport & Mobility","Technology & Systems","Workforce & Volunteers","Commercial & Financial","Reputation & Communications","Legal, Governance & Compliance","External & Environmental"];
export const TOURS = ["AC27", "GC27"];
export const SCOPES = ["Riyadh","Jeddah","Al Khobar","Multi-city","Tournament-wide"];
export const STRATS = ["Avoid","Reduce","Transfer","Accept","Escalate"];
export const LDEF = ["Rare — exceptional circumstances (<10%)","Unlikely — could occur (10–30%)","Possible — might occur (30–50%)","Likely — probably occurs (50–75%)","Almost Certain — expected (>75%)"];
export const IDEF = ["Negligible — absorbed within the FA","Minor — localised, resolved on the day","Moderate — visible to client groups, MOC coordination","Major — match-day failure / safety / reputation, ELT attention","Severe — threat to match delivery or life safety, crisis response"];
