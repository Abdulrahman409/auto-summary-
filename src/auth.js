// ── MSAL: silent-first, popup fallback (iframe-safe — never redirect) ──
import { PublicClientApplication } from "@azure/msal-browser";
import { CONFIG } from "./config.js";
let pca = null;
export const initAuth = async () => {
  pca = new PublicClientApplication({
    auth: { clientId: CONFIG.clientId, authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
            redirectUri: window.location.origin + window.location.pathname },
    cache: { cacheLocation: "sessionStorage" },
  });
  await pca.initialize();
  const accts = pca.getAllAccounts();
  if (accts.length) { pca.setActiveAccount(accts[0]); return accts[0]; }
  try { const r = await pca.ssoSilent({ scopes: CONFIG.scopes }); pca.setActiveAccount(r.account); return r.account; }
  catch { return null; }
};
export const signIn = async () => {
  const r = await pca.loginPopup({ scopes: CONFIG.scopes });
  pca.setActiveAccount(r.account); return r.account;
};
export const getToken = async () => {
  try { return (await pca.acquireTokenSilent({ scopes: CONFIG.scopes })).accessToken; }
  catch { return (await pca.acquireTokenPopup({ scopes: CONFIG.scopes })).accessToken; }
};
export const account = () => pca?.getActiveAccount() || null;
