// HARON NET SAS4 WEB — Multi-Portal SAS4 + Full FTTH Suite + Saved Pages
const FTTH_ORIGIN = "https://admin.ftth.iq";
const FTTH_CLIENT_APP = "53d57a7f-3f89-4e9d-873b-3d071bc6dd9f";
const FTTH_USER_ROLE = "0";
const FTTH_CFG = {"macLockOp": 0, "macUnlockOp": 1, "payWallet": "Wallet", "payCard": "Tabadul", "changeImmediate": 0, "changeNext": 1};

const ftthTrafficSnaps = {};
const ftthSubIdMap = {};
const ftthZoneMap = {};
const ftthZoneIdMap = {};
const ftthIsTrialMap = {};
let ftthLastExtra = {
  partnerName: "", partnerId: "", balance: 0, commission: 0,
  totalCredit: 0, remainingCredit: 0, currency: "IQD",
  monthlyRevenue: 0, openTasks: 0, completedTasks: 0, dueToday: 0,
  openRequests: 0, unreadNotif: 0, zones: []
};
window.ftthSelectedZone = "";
let _ftthDetState = null;
let _ftthOnbState = null;
let _ftthPurState = null;
let _ftthTaskConnState = null;

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtIqdNum(v, cur = "IQD") {
  const n = Number(v || 0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + (cur ? " " + cur : "");
}
function ftthSafeUptime(sec) {
  if (typeof fmtUptime === "function") return fmtUptime(sec);
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "ي " : "") + (h ? h + "س " : "") + m + "د";
}
function ftthSafeBytes(b) {
  if (typeof fmtBytes === "function") return fmtBytes(b);
  const n = Number(b || 0);
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(2) + " GB";
}
function ftthSafeCopy(txt, btn) {
  if (typeof copyText === "function") return copyText(txt, btn);
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(() => {});
  if (btn) { const old = btn.textContent; btn.textContent = "✓ تم النسخ"; setTimeout(() => { btn.textContent = old; }, 1100); }
}
function getPortalType() { return localStorage.getItem("sas4_portal_type") || "sas4"; }
function isFtthMode() { return getPortalType() === "ftth"; }
function isFtthUrl(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s.includes("ftth.iq") || s === "ftth" || s.includes("earthlink");
}
function normalizeFtthBase(raw) {
  let s = String(raw || "").trim();
  if (!s || s.toLowerCase() === "ftth" || !isFtthUrl(s)) return FTTH_ORIGIN + "/api";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { return "https://" + new URL(s).host + "/api"; }
  catch (_) { return FTTH_ORIGIN + "/api"; }
}
function ftthMonthRangeGmt() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return [from.toISOString(), to.toISOString()];
}

function resolveSas4LoginCandidates(rawInput) {
  let raw = String(rawInput || "").trim() || gs("sas4_login_url", "https://reseller.nbtel.iq/api.php?action=login");
  let s = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch) || ch === "\u200E" || ch === "\u200F") continue;
    if (ch === "\\") { s += "/"; continue; }
    if (code >= 0x0660 && code <= 0x0669) { s += String(code - 0x0660); continue; }
    if (code >= 0x06F0 && code <= 0x06F9) { s += String(code - 0x06F0); continue; }
    s += ch;
  }
  if (!s) return [];
  let explicitScheme = null;
  const lead = s.match(/^(?:https?:?\/+)+/i);
  if (lead) {
    const found = lead[0].match(/https?/gi);
    explicitScheme = found ? found[found.length - 1].toLowerCase() : "https";
    s = s.slice(lead[0].length);
  }
  const noFrag = s.split("#")[0];
  const qIdx = noFrag.indexOf("?");
  const hostAndPath = qIdx >= 0 ? noFrag.slice(0, qIdx) : noFrag;
  const queryPart = qIdx >= 0 ? noFrag.slice(qIdx) : "";
  const slashIdx = hostAndPath.indexOf("/");
  const authority = (slashIdx >= 0 ? hostAndPath.slice(0, slashIdx) : hostAndPath).replace(/^\/+|\/+$/g, "");
  if (!authority) return [];
  const rawPath = slashIdx >= 0 ? hostAndPath.slice(slashIdx) : "";
  const cleanPath = rawPath.replace(/\/+/g, "/").replace(/\/+$/, "");
  const lowerPath = cleanPath.toLowerCase();
  const schemes = explicitScheme === "http" ? ["http", "https"] : ["https", "http"];
  const seen = new Set(), out = [];
  const add = (ep, base) => { if (!seen.has(ep)) { seen.add(ep); out.push([ep, base.replace(/\/+$/, "")]); } };
  const rootReserved = new Set(["admin", "login", "dashboard", "users", "user", "index.html", "index.php", "auth", "ucp"]);
  for (const sch of schemes) {
    const origin = sch + "://" + authority;
    if (queryPart || (lowerPath.endsWith(".php") && !lowerPath.endsWith("index.php"))) {
      add(origin + cleanPath + queryPart, origin + "/admin/api/index.php/api");
    } else if (lowerPath.endsWith("/login") && (lowerPath.includes("/api/") || lowerPath.includes("index.php"))) {
      add(origin + cleanPath, origin + cleanPath.slice(0, -6));
    } else if (lowerPath.endsWith("/index.php/api")) {
      add(origin + cleanPath + "/login", origin + cleanPath);
    } else if (lowerPath.endsWith("/admin/api")) {
      add(origin + cleanPath + "/index.php/api/login", origin + cleanPath + "/index.php/api");
      add(origin + cleanPath + "/login", origin + cleanPath);
    } else if (lowerPath.endsWith("/api")) {
      add(origin + cleanPath + "/login", origin + cleanPath);
      add(origin + "/admin/api/index.php/api/login", origin + "/admin/api/index.php/api");
    } else {
      const segs = cleanPath.split("/").filter(Boolean);
      if (segs.length && !rootReserved.has(segs[0].toLowerCase())) {
        const sub = "/" + segs[0];
        add(origin + sub + "/admin/api/index.php/api/login", origin + sub + "/admin/api/index.php/api");
      }
      if (authority.toLowerCase().includes("reseller")) {
        add(origin + "/api.php?action=login", origin + "/admin/api/index.php/api");
      }
      add(origin + "/admin/api/index.php/api/login", origin + "/admin/api/index.php/api");
      add(origin + "/api/index.php/api/login", origin + "/api/index.php/api");
      add(origin + "/admin/api/login", origin + "/admin/api");
      add(origin + "/api/login", origin + "/api");
      add(origin + "/api.php?action=login", origin + "/admin/api/index.php/api");
    }
  }
  return out;
}

function extractHostLabel(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).host; }
  catch (_) { return String(url || "").replace(/^https?:\/\//i, "").split("/")[0] || "صفحة"; }
}
function getSavedPages() {
  try {
    const arr = JSON.parse(localStorage.getItem("sas4_saved_pages") || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}
function upsertSavedPage(loginUrl, apiBase, username, password, portalType) {
  const cleanUrl = String(loginUrl || "").trim();
  const cleanUser = String(username || "").trim();
  if (!cleanUrl || !cleanUser) return;
  const host = extractHostLabel(cleanUrl);
  const id = (host + "|" + cleanUser).toLowerCase();
  const list = getSavedPages().filter(x => x.id !== id);
  list.unshift({
    id, label: (portalType === "ftth" ? "FTTH • " : "") + host,
    loginUrl: cleanUrl, apiBase: apiBase || "",
    username: cleanUser, password: password || "",
    portalType: portalType || (isFtthUrl(cleanUrl) ? "ftth" : "sas4"),
    ts: Date.now()
  });
  localStorage.setItem("sas4_saved_pages", JSON.stringify(list.slice(0, 15)));
  renderSavedPagesUI();
}
function removeSavedPage(id, ev) {
  if (ev) ev.stopPropagation();
  localStorage.setItem("sas4_saved_pages", JSON.stringify(getSavedPages().filter(x => x.id !== id)));
  renderSavedPagesUI();
}
async function switchToSavedPage(id) {
  const item = getSavedPages().find(x => x.id === id);
  if (!item) return;
  const uEl = document.getElementById("username");
  const pEl = document.getElementById("password");
  const lEl = document.getElementById("loginUrl");
  if (uEl) uEl.value = item.username;
  if (pEl) pEl.value = item.password;
  if (lEl) lEl.value = item.loginUrl;
  ss("sas4_user", item.username); ss("sas4_pass", item.password); ss("sas4_login_url", item.loginUrl);
  const sm = document.getElementById("settingsModal");
  if (sm) sm.style.display = "none";
  const ok = await doLogin(false);
  if (ok) {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("appView").style.display = "block";
  }
}
function renderSavedPagesUI() {
  const list = getSavedPages();
  const containers = [document.getElementById("savedPagesLoginBox"), document.getElementById("savedPagesSettingsBox")].filter(Boolean);
  containers.forEach(box => {
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div style="font-size:12px;color:#94A3B8;margin:8px 0 6px">الصفحات المحفوظة (تبديل سريع):</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:6px">` +
      list.map(p => {
        const isF = p.portalType === "ftth";
        const bCol = isF ? "#34D399" : "#38BDF8";
        return `<div onclick="switchToSavedPage('${p.id.replace(/'/g, "\\'")}')" style="display:inline-flex;align-items:center;gap:6px;background:#0F172A;border:1px solid ${bCol}55;border-radius:10px;padding:6px 10px;font-size:12px;cursor:pointer">
          <span style="color:${bCol};font-weight:700">${isF ? "FTTH" : "SAS4"}</span>
          <span style="color:#E2E8F0" dir="ltr">${escHtml(p.username)}</span>
          <span style="color:#64748B;font-size:11px" dir="ltr">${escHtml(extractHostLabel(p.loginUrl))}</span>
          <span onclick="removeSavedPage('${p.id.replace(/'/g, "\\'")}', event)" style="color:#F87171;padding:0 3px;font-weight:800">×</span>
        </div>`;
      }).join("") + `</div>`;
  });
}
function selectPortalPreset(kind) {
  const lEl = document.getElementById("loginUrl");
  const tkBox = document.getElementById("ftthTokenWrap");
  if (!lEl) return;
  if (kind === "ftth") {
    lEl.value = FTTH_ORIGIN;
    if (tkBox) tkBox.style.display = "block";
    setStatus("وضع FTTH: أدخل بيانات بوابة admin.ftth.iq (أو الصق التوكن عند تفعيل 2FA)", "#34D399");
  } else {
    if (isFtthUrl(lEl.value)) lEl.value = "https://reseller.nbtel.iq/api.php?action=login";
    if (tkBox) tkBox.style.display = "none";
    setStatus("وضع SAS4: أدخل أي رابط بوابة SAS4 (دومين أو IP)", "#38BDF8");
  }
}

function decodeJwtPayload(jwt) {
  try {
    const parts = String(jwt || "").replace(/^Bearer\s+/i, "").trim().split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(pad);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) { return null; }
}
function extractFtthAccountId(jwt) {
  const p = decodeJwtPayload(jwt) || {};
  return String(p.account_id || p.accountId || p.partner_id || p.partnerId || p.sub || "").trim();
}
function isFtthJwtExpiring(jwt, bufferSec = 120) {
  const p = decodeJwtPayload(jwt);
  if (!p || !p.exp) return false;
  return (Date.now() / 1000) >= (Number(p.exp) - bufferSec);
}
function normalizeIsoDate(iso) {
  if (!iso || iso === "null") return "—";
  return String(iso).replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "").slice(0, 19);
}
function computeDaysLeftFromIso(iso) {
  if (!iso || iso === "—") return 0;
  const t = Date.parse(String(iso).replace(" ", "T"));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}
function ftthExtractErr(res, fallback = "فشلت العملية") {
  if (!res) return fallback;
  const j = res.json;
  if (j) {
    if (j.error_description) return j.error_description;
    if (j.message) return j.message;
    if (j.title) return j.title;
    if (j.detail) return j.detail;
    if (Array.isArray(j.errors) && j.errors.length) {
      const e0 = j.errors[0];
      return typeof e0 === "string" ? e0 : (e0.message || e0.errorMessage || JSON.stringify(e0));
    }
    if (j.errors && typeof j.errors === "object") {
      const vals = Object.values(j.errors).flat();
      if (vals.length) return String(vals[0]);
    }
    if (j.error && typeof j.error === "string") return j.error;
  }
  return (res.text && res.text.trim().slice(0, 180)) || `${fallback} (HTTP ${res.status || 0})`;
}

let _ftthAuthPromise = null;
window._ftthLastError = "";

async function ftthProxyFetch(method, targetUrl, headersExtra = {}, body = null) {
  let proxy = (gs("sas4_proxy", "") || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(proxy)) proxy = "https://flat-flower-e68bsas4-proxy.haronmardin.workers.dev";
  const h = Object.assign({
    "Accept": "application/json, text/plain, */*",
    "X-Target-Url": targetUrl,
    "X-Client-App": FTTH_CLIENT_APP,
    "X-User-Role": FTTH_USER_ROLE
  }, headersExtra);
  const opts = { method, headers: h };
  if (method !== "GET" && method !== "HEAD" && body !== null && body !== undefined) {
    opts.body = body;
  }
  try {
    const res = await fetch(proxy + "/proxy", opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, text, json };
  } catch (e) {
    return { ok: false, status: 0, text: e.message || "خطأ في الاتصال بالإنترنت أو البروكسي", json: null };
  }
}

async function ftthRefreshAccessToken() {
  const rt = localStorage.getItem("ftth_refresh_token") || "";
  if (!rt) return false;
  const base = normalizeFtthBase(gs("sas4_login_url", FTTH_ORIGIN));
  const attempts = [
    [base + "/auth/Contractor/token", ""],
    [base + "/auth/Contractor/token", "earthlink-portals"],
    ["https://sso.ftth.iq/auth/realms/Partners/protocol/openid-connect/token", "earthlink-portals"]
  ];
  for (const [ep, cid] of attempts) {
    const form = new URLSearchParams({
      grant_type: "refresh_token", scope: "openid profile", refresh_token: rt, client_id: cid
    }).toString();
    const r = await ftthProxyFetch("POST", ep, { "Content-Type": "application/x-www-form-urlencoded" }, form);
    if (r.ok && r.json && r.json.access_token) {
      const at = r.json.access_token.trim();
      const nrt = (r.json.refresh_token || rt).trim();
      ss("sas4_token", at);
      localStorage.setItem("ftth_refresh_token", nrt);
      const accId = extractFtthAccountId(at);
      if (accId) localStorage.setItem("ftth_account_id", accId);
      window._ftthLastError = "";
      return true;
    }
  }
  return false;
}

async function ftthReloginWithSavedCreds() {
  const u = (gs("sas4_user", "") || "").trim();
  const p = gs("sas4_pass", "") || "";
  if (!u || !p) return false;
  const base = normalizeFtthBase(gs("sas4_login_url", FTTH_ORIGIN));
  const attempts = [
    [base + "/auth/Contractor/token", ""],
    [base + "/auth/Contractor/token", "earthlink-portals"],
    ["https://sso.ftth.iq/auth/realms/Partners/protocol/openid-connect/token", "earthlink-portals"]
  ];
  for (const [ep, cid] of attempts) {
    const form = new URLSearchParams({
      grant_type: "password", scope: "openid profile", username: u, password: p, client_id: cid
    }).toString();
    const r = await ftthProxyFetch("POST", ep, { "Content-Type": "application/x-www-form-urlencoded" }, form);
    if (r.ok && r.json && r.json.access_token && !r.json.second_factor_required) {
      const at = r.json.access_token.trim();
      const rt = (r.json.refresh_token || "").trim();
      ss("sas4_token", at);
      if (rt) localStorage.setItem("ftth_refresh_token", rt);
      const accId = extractFtthAccountId(at);
      if (accId) localStorage.setItem("ftth_account_id", accId);
      window._ftthLastError = "";
      return true;
    }
  }
  return false;
}

async function ftthEnsureToken(forceRefresh = false) {
  let tok = gs("sas4_token", "");
  if (!forceRefresh && tok && !isFtthJwtExpiring(tok, 90)) return tok;
  if (!_ftthAuthPromise) {
    _ftthAuthPromise = (async () => {
      if (await ftthRefreshAccessToken()) return gs("sas4_token", "");
      if (await ftthReloginWithSavedCreds()) return gs("sas4_token", "");
      window._ftthLastError = "انتهت جلسة FTTH وتعذر تجديدها تلقائياً — أعد تسجيل الدخول";
      return "";
    })().finally(() => { _ftthAuthPromise = null; });
  }
  return await _ftthAuthPromise;
}

async function ftthApiReq(method, path, bodyObj = null, isFormData = false, retryAuth = true) {
  const tok = await ftthEnsureToken(false);
  if (!tok) return { ok: false, status: 401, json: null, text: window._ftthLastError || "انتهت جلسة FTTH" };
  const base = normalizeFtthBase(gs("sas4_login_url", FTTH_ORIGIN));
  const fullUrl = /^https?:\/\//i.test(path) ? path : (base + "/" + path.replace(/^\/+/, ""));
  const headers = { "Authorization": "Bearer " + tok };
  let body = null;
  if (isFormData) {
    body = bodyObj;
  } else if (bodyObj !== null && bodyObj !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  }
  const r = await ftthProxyFetch(method, fullUrl, headers, body);
  if (r.status === 401 && retryAuth) {
    const newTok = await ftthEnsureToken(true);
    if (newTok) return ftthApiReq(method, path, bodyObj, isFormData, false);
  }
  if (!r.ok && !window._ftthLastError) {
    window._ftthLastError = `HTTP ${r.status}: ${ftthExtractErr(r, "تعذر الجلب من بوابة FTTH")}`;
  }
  if (r.ok && Array.isArray(r.json)) r.json = { items: r.json };
  return r;
}
function ftthApiGet(path) { return ftthApiReq("GET", path, null, false); }
function ftthApiPostJson(path, obj) { return ftthApiReq("POST", path, obj || {}, false); }
function ftthApiPostEmpty(path) { return ftthApiReq("POST", path, "", false); }
function ftthApiPutJson(path, obj) { return ftthApiReq("PUT", path, obj || {}, false); }

async function ftthCompressImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1280;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const sc = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * sc); h = Math.round(h * sc);
      }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(b => resolve(b || file), "image/jpeg", 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function ftthUploadFile(blob, fileName) {
  const fd = new FormData();
  fd.append("file", blob, fileName || "upload.jpg");
  const r = await ftthApiReq("POST", "files", fd, true);
  const id = (r.json && (r.json.id || (r.json.model && r.json.model.id))) || "";
  if (r.ok && id) return { ok: true, id: String(id).trim() };
  return { ok: false, error: ftthExtractErr(r, "فشل رفع الملف") };
}

async function ftthLogin(lurl, user, pass, silent = false) {
  const cleanUrl = (lurl || FTTH_ORIGIN).trim();
  const base = normalizeFtthBase(cleanUrl);
  const manualTok = (document.getElementById("ftthManualToken")?.value || "").trim().replace(/^Bearer\s+/i, "");

  if (manualTok && manualTok.split(".").length >= 2) {
    const accId = extractFtthAccountId(manualTok);
    localStorage.setItem("sas4_portal_type", "ftth");
    ss("sas4_token", manualTok); ss("sas4_api_base", base);
    if (accId) localStorage.setItem("ftth_account_id", accId);
    upsertSavedPage(cleanUrl, base, user || "FTTH", pass, "ftth");
    updatePortalBrandBadge();
    return { ok: true, msg: "تم تفعيل جلسة FTTH بالتوكن بنجاح" };
  }
  if (localStorage.getItem("ftth_refresh_token") && gs("sas4_user") === user) {
    if (await ftthRefreshAccessToken()) {
      localStorage.setItem("sas4_portal_type", "ftth");
      ss("sas4_api_base", base);
      upsertSavedPage(cleanUrl, base, user, pass, "ftth");
      updatePortalBrandBadge();
      return { ok: true, msg: "تم استعادة جلسة FTTH" };
    }
  }
  if (!user || !pass) return { ok: false, msg: "أدخل اسم المستخدم وكلمة المرور لـ FTTH (أو الصق التوكن)." };

  const attempts = [
    [base + "/auth/Contractor/token", ""],
    [base + "/auth/Contractor/token", "earthlink-portals"],
    ["https://sso.ftth.iq/auth/realms/Partners/protocol/openid-connect/token", "earthlink-portals"]
  ];
  let lastErr = "تعذر تسجيل الدخول لبوابة FTTH";
  for (const [ep, cid] of attempts) {
    const form = new URLSearchParams({
      grant_type: "password", scope: "openid profile", username: user, password: pass, client_id: cid
    }).toString();
    try {
      const r = await ftthProxyFetch("POST", ep, { "Content-Type": "application/x-www-form-urlencoded" }, form);
      if (r.ok && r.json && r.json.access_token) {
        if (r.json.second_factor_required) {
          return { ok: false, msg: "الحساب يتطلب تحقق ثنائي (2FA) — الصق Access Token من متصفح admin.ftth.iq بالأسفل." };
        }
        const at = r.json.access_token.trim();
        const rt = (r.json.refresh_token || "").trim();
        const accId = extractFtthAccountId(at);
        localStorage.setItem("sas4_portal_type", "ftth");
        ss("sas4_token", at);
        localStorage.setItem("ftth_refresh_token", rt);
        if (accId) localStorage.setItem("ftth_account_id", accId);
        ss("sas4_api_base", base);
        upsertSavedPage(cleanUrl, base, user, pass, "ftth");
        updatePortalBrandBadge();
        return { ok: true, msg: "تم تسجيل الدخول إلى FTTH بنجاح" };
      } else if (r.json) {
        const d = r.json.error_description || r.json.message || r.json.error || "";
        if (d) lastErr = d;
      }
    } catch (e) { lastErr = e.message || lastErr; }
  }
  return { ok: false, msg: lastErr };
}

function updatePortalBrandBadge() {
  const bt = document.querySelector(".brand-title");
  if (bt) bt.textContent = isFtthMode() ? "HARON NET • FTTH" : "HARON NET • SAS4";
  const chrome = document.getElementById("ftthDashChrome");
  const debt = document.getElementById("debtCard");
  if (chrome) chrome.style.display = isFtthMode() ? "block" : "none";
  if (debt) debt.style.display = isFtthMode() ? "none" : "flex";
}

function renderFtthChrome() {
  const box = document.getElementById("ftthDashChrome");
  if (!box) return;
  if (!isFtthMode()) { box.style.display = "none"; return; }
  box.style.display = "block";
  const ex = ftthLastExtra;
  const badge = (n, col) => n > 0 ? `<span class="ftth-badge" style="background:${col}">${n}</span>` : "";
  const zonesHtml = (ex.zones && ex.zones.length)
    ? `<div class="ftth-zones-row">
        <button type="button" class="ftth-zchip ${!window.ftthSelectedZone ? 'on' : ''}" onclick="setFtthZoneFilter('')">الكل (${allSubs.length})</button>
        ${ex.zones.map(z => {
          const cnt = allSubs.filter(s => (s.nas || "") === z.name).length;
          const active = window.ftthSelectedZone === z.name ? "on" : "";
          return `<button type="button" class="ftth-zchip ${active}" onclick="setFtthZoneFilter('${z.name.replace(/'/g, "\\'")}')">${escHtml(z.name)}${cnt ? " (" + cnt + ")" : ""}</button>`;
        }).join("")}
      </div>`
    : "";

  const errHtml = window._ftthLastError
    ? `<div style="background:#450A0A;border:1px solid #EF444466;border-radius:12px;padding:10px;margin-bottom:8px;font-size:12px;color:#FCA5A5">
        <div style="font-weight:800;margin-bottom:6px">⚠ ${escHtml(window._ftthLastError)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button type="button" class="btn btn-sm btn-amber" onclick="window._ftthLastError='';refreshAll()">إعادة المحاولة</button>
          <button type="button" class="btn btn-sm btn-ghost" onclick="logout();location.reload()">تسجيل الدخول مجدداً</button>
        </div>
      </div>`
    : "";
  box.innerHTML = errHtml + `
    <div class="ftth-hero-strip">
      <div>
        <div style="font-size:13px;font-weight:800;color:#F8FAFC">${escHtml(ex.partnerName || "بوابة وكيل FTTH")}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px">إيرادات الشهر: <b style="color:#4ADE80" dir="ltr">${fmtIqdNum(ex.monthlyRevenue, ex.currency)}</b> • الائتمان المتبقي: <b style="color:#38BDF8" dir="ltr">${fmtIqdNum(ex.remainingCredit, ex.currency)}</b></div>
      </div>
      <span style="font-size:11px;background:#064E3B;color:#34D399;border:1px solid #10B98155;padding:3px 8px;border-radius:99px;font-weight:700">FTTH</span>
    </div>
    <div class="ftth-tiles-grid">
      <button type="button" class="ftth-tile" style="border-color:#10B98155" onclick="openFtthOnboardingModal()">
        <span class="ftth-tile-ic" style="color:#34D399">＋</span><span>مشترك جديد</span>
      </button>
      <button type="button" class="ftth-tile" style="border-color:#38BDF855" onclick="openFtthTasksModal()">
        ${badge(ex.openTasks, "#0284C7")}<span class="ftth-tile-ic" style="color:#38BDF8">⚙</span><span>مهام الربط</span>
      </button>
      <button type="button" class="ftth-tile" style="border-color:#F59E0B55" onclick="openFtthTicketsModal()">
        <span class="ftth-tile-ic" style="color:#FBBF24">🎫</span><span>التذاكر</span>
      </button>
      <button type="button" class="ftth-tile" style="border-color:#A855F755" onclick="openFtthRequestsModal()">
        ${badge(ex.openRequests, "#9333EA")}<span class="ftth-tile-ic" style="color:#C084FC">📋</span><span>الطلبات</span>
      </button>
      <button type="button" class="ftth-tile" style="border-color:#22C55E55" onclick="openFtthWalletModal()">
        <span class="ftth-tile-ic" style="color:#4ADE80">💳</span><span>المحفظة</span>
      </button>
      <button type="button" class="ftth-tile" style="border-color:#F43F5E55" onclick="openFtthNotifModal()">
        ${badge(ex.unreadNotif, "#E11D48")}<span class="ftth-tile-ic" style="color:#FB7185">🔔</span><span>الإشعارات</span>
      </button>
    </div>
    ${zonesHtml}
  `;
}

function setFtthZoneFilter(zName) {
  window.ftthSelectedZone = zName || "";
  renderFtthChrome();
  if (typeof renderList === "function") renderList();
}

async function ftthLoadMetrics() {
  updatePortalBrandBadge();
  window._ftthLastError = "";
  await ftthEnsureToken(false);
  const accId = localStorage.getItem("ftth_account_id") || extractFtthAccountId(gs("sas4_token", ""));
  const [fromGmt, toGmt] = ftthMonthRangeGmt();
  const [rDash, rWal, rPart, rRev, rTasks, rReqs, rNotif, rZones, rCust] = await Promise.all([
    ftthApiGet("partners/dashboard/summary?hierarchyLevel=1"),
    accId ? ftthApiGet("partners/" + accId + "/wallets/balance") : Promise.resolve({ ok: false }),
    accId ? ftthApiGet("partners/" + accId) : Promise.resolve({ ok: false }),
    ftthApiGet(`transactions/revenue/statistics?createdAt.from=${encodeURIComponent(fromGmt)}&createdAt.to=${encodeURIComponent(toGmt)}`),
    ftthApiGet("tasks/summary?hierarchyLevel=1"),
    ftthApiGet("requests/summary?hierarchyLevel=1"),
    ftthApiGet("notifications?onlyUnreadNotifications=true&pageSize=1&pageNumber=1"),
    ftthApiGet("locations/zones"),
    ftthApiGet("customers?pageSize=1&pageNumber=1")
  ]);

  const dRoot = (rDash.ok && rDash.json && rDash.json.model) ? rDash.json.model : {};
  const subsObj = dRoot.subscriptions || {};
  const custObj = dRoot.customers || {};
  const realTotal = (rCust.ok && rCust.json && rCust.json.totalCount) ? Number(rCust.json.totalCount) : 0;
  const total = Math.max(Number(subsObj.totalCount || custObj.totalCount || 0), realTotal);
  const active = Number(subsObj.totalActive || custObj.totalActive || 0);
  const online = Number(subsObj.totalOnline || 0);
  const expired = Number(subsObj.totalExpired || custObj.totalInactive || 0);
  const expiring = Number(subsObj.totalExpiring || custObj.totalExpiring || 0);

  const wm = (rWal.ok && rWal.json && rWal.json.model) ? rWal.json.model : {};
  const bal = Number(wm.balance || 0);
  const comm = Number(wm.commission || 0);
  const cur = wm.currency || "IQD";
  const tm = (rTasks.ok && rTasks.json && rTasks.json.model) ? rTasks.json.model : {};
  let openReqs = 0;
  if (rReqs.ok && rReqs.json && Array.isArray(rReqs.json.items)) {
    rReqs.json.items.forEach(x => { openReqs += Number(x.totalOpen || 0); });
  }
  const zones = [];
  if (rZones.ok && rZones.json && Array.isArray(rZones.json.items)) {
    rZones.json.items.forEach(x => {
      const s = x && x.self;
      if (s && s.id) zones.push({ id: String(s.id).trim(), name: String(s.displayValue || s.id).trim() });
    });
  }

  ftthLastExtra = {
    partnerName: (rPart.ok && rPart.json && rPart.json.model && rPart.json.model.name) || "",
    partnerId: accId,
    balance: bal, commission: comm,
    totalCredit: Number(wm.totalCredit || 0),
    remainingCredit: Number(wm.remainingCredit || 0),
    currency: cur,
    monthlyRevenue: Number((rRev.ok && rRev.json && rRev.json.model && rRev.json.model.totalRevenue && rRev.json.model.totalRevenue.value) || 0),
    openTasks: Number(tm.totalOpen || 0),
    completedTasks: Number(tm.totalCompleted || 0),
    dueToday: Number(tm.totalDueToday || 0),
    openRequests: openReqs,
    unreadNotif: Number((rNotif.ok && rNotif.json && rNotif.json.totalCount) || 0),
    zones
  };

  if (rDash.ok || rCust.ok || rWal.ok) window._ftthLastError = "";
  document.getElementById("mBalance").textContent = fmtIqdNum(bal, cur);
  document.getElementById("mPoints").textContent = comm.toLocaleString("en-US") + " عمولة";
  document.getElementById("mTotal").textContent = total;
  document.getElementById("mOnline").textContent = online;
  document.getElementById("mActive").textContent = active;
  document.getElementById("mOffline").textContent = Math.max(0, active - online);
  document.getElementById("mExpired").textContent = expired;
  document.getElementById("mExpiring").textContent = expiring;
  renderFtthChrome();
}

async function ftthFetchPaginated(pathBuilder, maxPages = 25) {
  const out = [];
  let pageSize = 50, first = null;
  for (const ps of [50, 25, 10]) {
    const r = await ftthApiGet(pathBuilder(ps, 1));
    if (r.ok && r.json && Array.isArray(r.json.items)) { pageSize = ps; first = r.json; break; }
  }
  if (!first) return out;
  const total = Number(first.totalCount || 0);
  let page = 1;
  while (page <= maxPages) {
    const res = page === 1 ? first : (await ftthApiGet(pathBuilder(pageSize, page))).json;
    const items = (res && Array.isArray(res.items)) ? res.items : [];
    if (!items.length) break;
    out.push(...items);
    if (total > 0 && out.length >= total) break;
    if (items.length < pageSize) break;
    page++;
  }
  return out;
}

async function ftthFetchOnlineMap() {
  const items = await ftthFetchPaginated(
    (ps, pg) => `sessions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=username&sortCriteria.direction=asc&status=0&hierarchyLevel=1`,
    15
  );
  const om = {};
  const nowSec = Date.now() / 1000;
  items.forEach(o => {
    const custId = Number((o.customer && o.customer.id) || (o.subscription && o.subscription.id) || 0);
    if (!custId) return;
    const dnB = Number(o.totalDownloadedBytes || 0);
    const upB = Number(o.totalUploadedBytes || 0);
    let dn = 0, up = 0;
    const prev = ftthTrafficSnaps[custId];
    if (prev) {
      const dt = nowSec - prev.t;
      if (dt >= 0.8 && dt <= 60) {
        const dDn = Math.max(0, dnB - prev.dnB);
        const dUp = Math.max(0, upB - prev.upB);
        dn = dDn > 0 ? (dDn * 8) / (dt * 1e6) : prev.dn * 0.5;
        up = dUp > 0 ? (dUp * 8) / (dt * 1e6) : prev.up * 0.5;
      }
    }
    ftthTrafficSnaps[custId] = { dnB, upB, t: nowSec, dn, up };
    om[custId] = {
      rad: Number((o.subscription && o.subscription.id) || 0),
      ip: o.ipAddress || "",
      mac: o.macAddress || "",
      nas: (o.zone && o.zone.displayValue) || "",
      uptime: Number(o.sessionTimeInSeconds || 0),
      dnBytes: dnB, upBytes: upB, traffic: dnB + upB,
      startedAt: normalizeIsoDate(o.startedAt),
      dn, up
    };
  });
  return om;
}

async function ftthLoadSubs(silent = false) {
  const el = document.getElementById("subsList");
  await ftthEnsureToken(false);
  if (!silent) el.innerHTML = '<div class="card" style="text-align:center;color:#94A3B8">جاري جلب مشتركي FTTH...</div>';
  const [actItems, expItems, om, allCust] = await Promise.all([
    ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&status=Active&hierarchyLevel=1`, 20),
    ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&status=Expired&hierarchyLevel=1`, 20),
    ftthFetchOnlineMap(),
    ftthFetchPaginated((ps, pg) => `customers?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=CreatedAt&sortCriteria.direction=desc`, 15)
  ]);

  let combined = [...actItems, ...expItems];
  if (!combined.length) {
    combined = await ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&hierarchyLevel=1`, 20);
  }
  const seen = new Set(), seenCust = new Set(), out = [];
  combined.forEach(o => {
    const custObj = o.customer || {};
    const selfObj = o.self || {};
    const custId = Number(custObj.id || selfObj.id || 0);
    const subId = String(selfObj.id || "");
    const uniq = subId || String(custId);
    if (!custId || seen.has(uniq)) return;
    seen.add(uniq); seenCust.add(custId);
    if (subId) ftthSubIdMap[custId] = subId;

    const devObj = o.deviceDetails || {};
    const username = String(o.username || devObj.username || custId).trim();
    const fullName = String(custObj.displayValue || username).trim();
    const zone = (o.zone && o.zone.displayValue) || "";
    const zoneId = (o.zone && o.zone.id) || "";
    if (zone) ftthZoneMap[custId] = zone;
    if (zoneId) ftthZoneIdMap[custId] = String(zoneId);

    const services = Array.isArray(o.services) ? o.services : [];
    const planName = (services[0] && (services[0].displayValue || services[0].id)) || (o.bundle && o.bundle.displayValue) || "FTTH";
    ftthIsTrialMap[custId] = subId.toUpperCase().startsWith("T") || planName.includes("تجريبي") || String(o.type || "").toLowerCase().includes("trial");
    const isActive = String(o.status || "").toLowerCase() === "active";
    const expStr = normalizeIsoDate(o.expires);
    const lv = om[custId];
    const isOnline = !!(o.hasActiveSession || o.isOnline || o.activeSession || lv);

    out.push({
      id: custId, username, fullName, initial: fullName.charAt(0) || "ف",
      profile: planName, expiration: expStr,
      days: isActive ? computeDaysLeftFromIso(o.expires) : 0,
      isOnline, isActive,
      traffic: lv ? lv.traffic : 0, loan: 0,
      rad: lv ? lv.rad : Number(subId || 0),
      ip: (lv && lv.ip) || o.ipAddress || "",
      mac: (lv && lv.mac) || o.macAddress || "",
      nas: (lv && lv.nas) || zone,
      uptime: lv ? lv.uptime : 0,
      dn: lv ? lv.dn : 0, up: lv ? lv.up : 0,
      ftthSubId: subId, ftthZoneId: String(zoneId || "")
    });
  });

  allCust.forEach(c => {
    const cid = Number(c && c.self && c.self.id || 0);
    if (!cid || seenCust.has(cid)) return;
    seenCust.add(cid);
    const fullName = String((c.self && c.self.displayValue) || c.fullName || cid).trim();
    const zone = (c.zone && c.zone.displayValue) || "";
    if (zone) ftthZoneMap[cid] = zone;
    out.push({
      id: cid, username: String(cid), fullName, initial: fullName.charAt(0) || "م",
      profile: "بدون اشتراك", expiration: "—", days: 0,
      isOnline: false, isActive: false, traffic: 0, loan: 0,
      rad: 0, ip: "", mac: "", nas: zone, uptime: 0, dn: 0, up: 0,
      ftthSubId: "", ftthZoneId: String((c.zone && c.zone.id) || "")
    });
  });

  if (out.length > 0) window._ftthLastError = "";
  allSubs = out;
  renderFtthChrome();
  renderList();
}

function openFtthSheet(title, subtitle, bodyHtml) {
  const m = document.getElementById("ftthModal");
  document.getElementById("ftthModalTitle").textContent = title || "FTTH";
  const subEl = document.getElementById("ftthModalSub");
  if (subEl) { subEl.textContent = subtitle || ""; subEl.style.display = subtitle ? "block" : "none"; }
  document.getElementById("ftthModalBody").innerHTML = bodyHtml || '<div class="meta" style="text-align:center;padding:24px">جاري التحميل...</div>';
  m.style.display = "flex";
}
function closeFtthSheet() {
  const m = document.getElementById("ftthModal");
  if (m) m.style.display = "none";
}

async function ftthOpenDetails(uid) {
  const s = allSubs.find(x => x.id === uid) || { id: uid, fullName: String(uid), username: String(uid) };
  _ftthDetState = { uid, s, subId: ftthSubIdMap[uid] || s.ftthSubId || "", tab: "info", loaded: false, data: {}, dev: null, sig: null };
  openFtthSheet(s.fullName, `@${s.username} • ${s.nas || "FTTH"}`, `
    <div class="det-tabs" style="margin-bottom:12px">
      <button id="ftthTabInfo" type="button" class="det-tab on" onclick="switchFtthDetTab('info')">المعلومات والاشتراك</button>
      <button id="ftthTabDev" type="button" class="det-tab" onclick="switchFtthDetTab('device')">جهاز ONT والإشارة</button>
    </div>
    <div id="ftthDetBody"><div class="box" style="text-align:center;color:#94A3B8">جاري جلب ملف FTTH الكامل...</div></div>
  `);
  await loadFtthFullDetailData();
}

function switchFtthDetTab(tab) {
  if (!_ftthDetState) return;
  _ftthDetState.tab = tab;
  document.getElementById("ftthTabInfo")?.classList.toggle("on", tab === "info");
  document.getElementById("ftthTabDev")?.classList.toggle("on", tab === "device");
  if (tab === "info") renderFtthInfoTab();
  else renderFtthDeviceTab();
}

async function loadFtthFullDetailData() {
  const st = _ftthDetState;
  if (!st) return;
  const uid = st.uid;
  const [rCust, rSubs, rWal, rTasks, rSched, rAudit, rTick] = await Promise.all([
    ftthApiGet("customers/" + uid),
    ftthApiGet("customers/subscriptions?customerId=" + uid),
    ftthApiGet("customers/" + uid + "/wallets/balance"),
    ftthApiGet("customers/" + uid + "/tasks"),
    ftthApiGet("customers/" + uid + "/subscriptions/scheduled-changes"),
    ftthApiGet("audit-logs/summary?customerId=" + uid),
    ftthApiGet(`support/tickets?pageSize=10&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&customerId=${uid}`)
  ]);
  const subsArr = (rSubs.ok && rSubs.json && Array.isArray(rSubs.json.items)) ? rSubs.json.items : [];
  const mainSub = subsArr[0] || {};
  const subId = st.subId || (mainSub.self && mainSub.self.id) || "";
  if (subId) { st.subId = String(subId); ftthSubIdMap[uid] = String(subId); }

  let allowedActions = [];
  if (st.subId) {
    const rAA = await ftthApiGet(`subscriptions/allowed-actions?subscriptionIds=${encodeURIComponent(st.subId)}&customerId=${uid}`);
    if (rAA.ok && rAA.json) {
      const m = rAA.json.model || rAA.json;
      if (Array.isArray(m.allowedActions)) allowedActions = m.allowedActions;
      else if (Array.isArray(rAA.json.items)) allowedActions = rAA.json.items;
    }
  }

  st.data = {
    cust: (rCust.ok && rCust.json && rCust.json.model) || {},
    subs: subsArr, mainSub,
    wallet: (rWal.ok && rWal.json && rWal.json.model) || {},
    tasks: (rTasks.ok && rTasks.json && Array.isArray(rTasks.json.items)) ? rTasks.json.items : [],
    sched: (rSched.ok && rSched.json && Array.isArray(rSched.json.items)) ? rSched.json.items : [],
    audit: (rAudit.ok && rAudit.json && rAudit.json.model) || {},
    tickets: (rTick.ok && rTick.json && Array.isArray(rTick.json.items)) ? rTick.json.items : [],
    allowedActions
  };
  st.loaded = true;
  if (st.tab === "info") renderFtthInfoTab();
  else renderFtthDeviceTab();
}

function renderFtthInfoTab() {
  const st = _ftthDetState;
  const box = document.getElementById("ftthDetBody");
  if (!st || !box) return;
  const { s, subId, data } = st;
  const c = data.cust || {}, ms = data.mainSub || {}, w = data.wallet || {};
  const pc = c.primaryContact || {};
  const mobile = pc.mobile || c.primaryPhone || c.phone || "";
  const secPh = pc.secondaryPhone || "";
  const email = pc.email || "";
  const cleanPh = String(mobile).replace(/[^0-9+]/g, "");
  const wa = cleanPh ? "https://wa.me/" + cleanPh.replace(/^0/, "964").replace(/^\+/, "") : "";
  const subStatus = ms.status || (s.isActive ? "Active" : "Expired");
  const isSuspended = String(subStatus).toLowerCase().includes("suspend");
  const zone = ftthZoneMap[st.uid] || (ms.zone && ms.zone.displayValue) || s.nas || "—";
  const addr = (c.address && (c.address.displayValue || c.address.address)) || c.addressText || "—";

  const actRow = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
      <button type="button" class="btn btn-sm btn-green" onclick="openFtthPurchaseModal(${st.uid})">⚡ تفعيل / تجديد / تغيير باقة</button>
      ${subId ? `<button type="button" class="btn btn-sm btn-red" onclick="ftthSubQuickAction('${escHtml(subId)}','disconnect')">فصل الاتصال</button>` : ""}
      ${subId ? `<button type="button" class="btn btn-sm btn-amber" onclick="ftthSubQuickAction('${escHtml(subId)}','${isSuspended ? "unsuspend" : "suspend"}')">${isSuspended ? "إلغاء التعليق" : "تعليق الاشتراك"}</button>` : ""}
      <button type="button" class="btn btn-sm btn-ghost" onclick="ftthSafeCopy('${escHtml(s.username)}', this)">نسخ اليوزر</button>
      ${cleanPh ? `<a class="btn btn-sm btn-ghost" style="text-decoration:none" href="tel:${cleanPh}">اتصال</a><a class="btn btn-sm btn-wa" style="text-decoration:none" target="_blank" href="${wa}">واتساب</a>` : ""}
    </div>
    <div id="ftthSubActionMsg" class="status" style="display:none;margin-bottom:10px"></div>
  `;

  const kv = (k, v, ltr = false) => `<div class="ftth-kv"><span>${k}</span><b ${ltr ? 'dir="ltr"' : ""}>${escHtml(v || "—")}</b></div>`;

  const schedHtml = data.sched.length
    ? data.sched.map(x => `<div class="ftth-mini-item"><b>${escHtml((x.plan && x.plan.displayValue) || x.type || "تغيير مجدول")}</b><small dir="ltr">${normalizeIsoDate(x.effectiveDate || x.createdAt)}</small></div>`).join("")
    : `<div class="meta">لا توجد تغييرات مجدولة</div>`;

  const tasksHtml = data.tasks.length
    ? data.tasks.map(t => `<div class="ftth-mini-item"><b>${escHtml((t.self && t.self.displayValue) || t.type || "مهمة")}</b><small>${escHtml((t.status && t.status.displayValue) || t.status || "—")} • ${normalizeIsoDate(t.createdAt)}</small></div>`).join("")
    : `<div class="meta">لا توجد مهام</div>`;

  const tickHtml = data.tickets.length
    ? data.tickets.map(t => `<div class="ftth-mini-item"><b>${escHtml((t.self && t.self.displayValue) || t.summary || "تذكرة")}</b><small>${escHtml(t.status || "—")} • ${normalizeIsoDate(t.createdAt)}</small></div>`).join("")
    : `<div class="meta">لا توجد تذاكر دعم</div>`;

  box.innerHTML = `
    ${actRow}
    <div class="box">
      <div class="ftth-sec-hd">📦 تفاصيل الاشتراك</div>
      ${kv("معرف الاشتراك", subId || "—", true)}
      ${kv("اسم المستخدم", s.username, true)}
      ${kv("الباقة", s.profile)}
      ${kv("الحالة", s.isOnline ? "● متصل الآن" : subStatus)}
      ${kv("تاريخ الانتهاء", s.expiration, true)}
      ${kv("المنطقة (Zone)", zone)}
      ${kv("IP / MAC", (s.ip || "—") + " / " + (s.mac || "—"), true)}
      ${kv("مدة الاتصال / الاستهلاك", `${ftthSafeUptime(s.uptime)} • ${ftthSafeBytes(s.traffic)}`)}
    </div>
    <div class="box">
      <div class="ftth-sec-hd">👤 البيانات الشخصية والاتصال</div>
      ${kv("الاسم الكامل", s.fullName)}
      ${kv("رقم الموبايل", mobile, true)}
      ${secPh ? kv("هاتف ثانوي", secPh, true) : ""}
      ${email ? kv("البريد الإلكتروني", email, true) : ""}
      ${kv("العنوان", addr)}
    </div>
    <div class="box">
      <div class="ftth-sec-hd">💳 محفظة المشترك</div>
      ${kv("الرصيد", fmtIqdNum(w.balance || 0, w.currency || "IQD"), true)}
    </div>
    <div class="box">
      <div class="ftth-sec-hd">🕒 التغييرات المجدولة (${data.sched.length})</div>
      ${schedHtml}
    </div>
    <div class="box">
      <div class="ftth-sec-hd">🔧 مهام المشترك (${data.tasks.length})</div>
      ${tasksHtml}
    </div>
    <div class="box">
      <div class="ftth-sec-hd">🎫 تذاكر الدعم (${data.tickets.length})</div>
      ${tickHtml}
    </div>
  `;
}

async function ftthSubQuickAction(subId, action) {
  const labels = { disconnect: "فصل اتصال المشترك", suspend: "تعليق الاشتراك", unsuspend: "إلغاء تعليق الاشتراك" };
  if (!confirm(`تأكيد ${labels[action] || action}؟`)) return;
  const msg = document.getElementById("ftthSubActionMsg");
  if (msg) { msg.style.display = "block"; msg.style.color = "#38BDF8"; msg.textContent = "جاري التنفيذ..."; }
  const r = await ftthApiPostEmpty(`subscriptions/${encodeURIComponent(subId)}/${action}`);
  if (r.ok) {
    if (msg) { msg.style.color = "#4ADE80"; msg.textContent = "✓ تم تنفيذ العملية بنجاح"; }
    loadSubs(true);
    loadFtthFullDetailData();
  } else {
    if (msg) { msg.style.color = "#FCA5A5"; msg.textContent = ftthExtractErr(r, "فشلت العملية"); }
  }
}

async function renderFtthDeviceTab(forceReload = false) {
  const st = _ftthDetState;
  const box = document.getElementById("ftthDetBody");
  if (!st || !box) return;
  if (!st.subId) {
    box.innerHTML = `<div class="box" style="color:#FBBF24;text-align:center">لا يوجد اشتراك مرتبط بجهاز ONT لهذا المشترك حالياً.</div>`;
    return;
  }
  if (!st.dev || forceReload) {
    box.innerHTML = `<div class="box" style="text-align:center;color:#94A3B8">جاري فحص إشارة الـ ONT وبيانات الجهاز...</div>`;
    const [rDev, rSig, rVend] = await Promise.all([
      ftthApiGet(`subscriptions/${encodeURIComponent(st.subId)}/device`),
      ftthApiGet(`subscriptions/device/ont?username=${encodeURIComponent(st.s.username)}`),
      ftthApiGet("network-elements/ont-vendors")
    ]);
    st.dev = (rDev.ok && rDev.json && rDev.json.model) || {};
    st.sig = (rSig.ok && rSig.json && rSig.json.model) ? rSig.json.model : { _err: ftthExtractErr(rSig, "لا توجد جلسة نشطة أو تعذر قراءة الإشارة") };
    st.vendors = (rVend.ok && rVend.json && rVend.json.model && Array.isArray(rVend.json.model.ontVendors)) ? rVend.json.model.ontVendors : [];
  }

  const d = st.dev || {}, sig = st.sig || {}, s = st.s;
  const sigStatus = (sig.status && sig.status.displayValue) || (sig._err ? "غير متصل" : "Unknown");
  const hasRx = sig.rxPower !== undefined && sig.rxPower !== null && !isNaN(Number(sig.rxPower));
  const rxVal = hasRx ? Number(sig.rxPower) : null;
  let sigCol = "#94A3B8", sigQual = sig._err || "غير متوفر";
  if (rxVal !== null) {
    if (rxVal >= -24) { sigCol = "#4ADE80"; sigQual = "إشارة ممتازة"; }
    else if (rxVal >= -27) { sigCol = "#FBBF24"; sigQual = "إشارة مقبولة"; }
    else { sigCol = "#F87171"; sigQual = "إشارة ضعيفة جداً"; }
  }

  const vendName = (d.ontVendor && d.ontVendor.displayValue) || "—";
  const vendId = (d.ontVendor && d.ontVendor.id) || "";
  const fdtName = (d.fdt && d.fdt.displayValue) || "—";
  const fatName = (d.fat && d.fat.displayValue) || "—";
  const ontSerial = d.ontSerial || "";
  const lockedMac = d.lockedMac || (d.macLock && d.macLock.mac) || "";
  const curMac = d.macAddress || s.mac || "";
  const zoneId = st.s.ftthZoneId || ftthZoneIdMap[st.uid] || "";

  const vendOpts = (st.vendors || []).map(v => {
    const id = v.id || (v.self && v.self.id) || "";
    const nm = v.displayValue || (v.self && v.self.displayValue) || id;
    return `<option value="${escHtml(id)}" ${id === vendId ? "selected" : ""}>${escHtml(nm)}</option>`;
  }).join("");

  box.innerHTML = `
    <div class="box" style="border-color:${sigCol}66;background:linear-gradient(135deg,#0F172A,#111827)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:800;color:#F8FAFC">📡 إشارة جهاز ONT المباشرة</span>
        <button type="button" class="btn btn-sm btn-ghost" onclick="renderFtthDeviceTab(true)">↻ تحديث الإشارة</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center">
        <div style="background:#0B1220;border-radius:10px;padding:10px">
          <div style="font-size:11px;color:#94A3B8">قوة الإشارة (Rx)</div>
          <div style="font-size:20px;font-weight:900;color:${sigCol}" dir="ltr">${rxVal !== null ? rxVal.toFixed(2) + " dBm" : "—"}</div>
          <div style="font-size:11px;color:${sigCol}">${escHtml(sigQual)}</div>
        </div>
        <div style="background:#0B1220;border-radius:10px;padding:10px">
          <div style="font-size:11px;color:#94A3B8">حالة الخط (ONT)</div>
          <div style="font-size:16px;font-weight:800;color:#F8FAFC;margin-top:4px" dir="ltr">${escHtml(sigStatus)}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:4px">${s.isOnline ? "جلسة PPPoE نشطة" : "غير متصل"}</div>
        </div>
      </div>
    </div>

    <div class="box">
      <div class="ftth-sec-hd">🖥 بيانات الجهاز والشبكة</div>
      <div class="ftth-kv"><span>مزوّد ONT</span><b dir="ltr">${escHtml(vendName)}</b></div>
      <div class="ftth-kv"><span>سيريال ONT</span><b dir="ltr" style="color:#38BDF8;cursor:pointer" onclick="ftthSafeCopy('${escHtml(ontSerial)}', this)">${escHtml(ontSerial || "—")}</b></div>
      <div class="ftth-kv"><span>FDT / FAT</span><b dir="ltr">${escHtml(fdtName)} • ${escHtml(fatName)}</b></div>
      <div class="ftth-kv"><span>MAC الحالي</span><b dir="ltr">${escHtml(curMac || "—")}</b></div>
      <div class="ftth-kv"><span>MAC المقفل</span><b dir="ltr" style="color:#FBBF24">${escHtml(lockedMac || "غير مقفل")}</b></div>
    </div>

    <div id="ftthDevOpMsg" class="status" style="display:none;margin-bottom:10px"></div>

    <div class="box">
      <div class="ftth-sec-hd">🔒 قفل / فتح الماك (MAC Lock)</div>
      <input id="ftthMacInp" type="text" dir="ltr" value="${escHtml(lockedMac || curMac)}" placeholder="e0:97:96:3c:4a:0d">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button type="button" class="btn btn-sm btn-green" onclick="ftthDoMacLock(true)">قفل على هذا MAC</button>
        <button type="button" class="btn btn-sm btn-amber" onclick="ftthDoMacLock(false)">فتح قفل MAC</button>
      </div>
    </div>

    <div class="box">
      <div class="ftth-sec-hd">🔑 تغيير كلمة مرور الجهاز (PPPoE)</div>
      <input id="ftthDevPassInp" type="text" dir="ltr" placeholder="أدخل كلمة المرور الجديدة">
      <button type="button" class="btn btn-sm" onclick="ftthDoUpdateDevPass()">حفظ كلمة المرور الجديدة</button>
    </div>

    <div class="box">
      <div class="ftth-sec-hd">📟 تغيير سيريال ONT</div>
      <input id="ftthSerialInp" type="text" dir="ltr" value="${escHtml(ontSerial)}" placeholder="HWTC3C4A0C31">
      <button type="button" class="btn btn-sm btn-amber" onclick="ftthDoUpdateSerial()">تحديث سيريال ONT</button>
    </div>

    ${!d.isNetworkElementsEditingLocked ? `
    <div class="box">
      <div class="ftth-sec-hd">🌐 تعديل عناصر الشبكة (Vendor / FDT / FAT)</div>
      <label>مزوّد ONT</label>
      <select id="ftthEditVend"><option value="">— اختر المزود —</option>${vendOpts}</select>
      <label>الكابينة (FDT)</label>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <select id="ftthEditFdt" style="margin:0" onchange="ftthLoadFatsForEdit(this.value)"><option value="">اضغط جلب FDT...</option></select>
        <button type="button" class="btn btn-sm btn-ghost" style="width:auto;white-space:nowrap" onclick="ftthLoadFdtsForEdit('${escHtml(zoneId)}')">جلب FDT</button>
      </div>
      <label>صندوق التوزيع (FAT)</label>
      <select id="ftthEditFat"><option value="">— اختر FDT أولاً —</option></select>
      <button type="button" class="btn btn-sm" onclick="ftthDoUpdateNetElems()">حفظ عناصر الشبكة</button>
    </div>` : ""}
  `;
}

function setFtthDevMsg(txt, ok = true) {
  const el = document.getElementById("ftthDevOpMsg");
  if (!el) return;
  el.style.display = "block";
  el.style.color = ok ? "#4ADE80" : "#FCA5A5";
  el.textContent = txt;
}
async function ftthDoMacLock(lock) {
  const subId = _ftthDetState && _ftthDetState.subId;
  const mac = (document.getElementById("ftthMacInp")?.value || "").trim();
  if (lock && !mac) { setFtthDevMsg("أدخل عنوان MAC أولاً", false); return; }
  setFtthDevMsg(lock ? "جاري قفل MAC..." : "جاري فتح قفل MAC...", true);
  const body = { macLock: { mac: lock ? mac : "", macOperationType: lock ? FTTH_CFG.macLockOp : FTTH_CFG.macUnlockOp } };
  const r = await ftthApiPutJson(`subscriptions/${encodeURIComponent(subId)}/device`, body);
  if (r.ok) { setFtthDevMsg(lock ? "✓ تم قفل الـ MAC بنجاح" : "✓ تم فتح قفل الـ MAC بنجاح", true); renderFtthDeviceTab(true); }
  else setFtthDevMsg(ftthExtractErr(r, "فشل تعديل قفل MAC"), false);
}
async function ftthDoUpdateDevPass() {
  const subId = _ftthDetState && _ftthDetState.subId;
  const pw = (document.getElementById("ftthDevPassInp")?.value || "").trim();
  if (!pw) { setFtthDevMsg("أدخل كلمة المرور الجديدة", false); return; }
  if (!confirm("تأكيد تغيير كلمة مرور الجهاز؟")) return;
  setFtthDevMsg("جاري تحديث كلمة المرور...", true);
  const r = await ftthApiPutJson(`subscriptions/${encodeURIComponent(subId)}/device`, { devicePassword: pw });
  if (r.ok) setFtthDevMsg("✓ تم تحديث كلمة مرور الجهاز بنجاح", true);
  else setFtthDevMsg(ftthExtractErr(r, "فشل تحديث كلمة المرور"), false);
}
async function ftthDoUpdateSerial() {
  const subId = _ftthDetState && _ftthDetState.subId;
  const ser = (document.getElementById("ftthSerialInp")?.value || "").trim().toUpperCase();
  if (!ser) { setFtthDevMsg("أدخل سيريال ONT صحيح", false); return; }
  if (!confirm(`تأكيد تغيير سيريال ONT إلى (${ser})؟`)) return;
  setFtthDevMsg("جاري تحديث السيريال...", true);
  const r = await ftthApiPutJson(`subscriptions/${encodeURIComponent(subId)}/device`, { ontSerial: ser });
  if (r.ok) { setFtthDevMsg("✓ تم تحديث السيريال بنجاح", true); renderFtthDeviceTab(true); }
  else setFtthDevMsg(ftthExtractErr(r, "فشل تحديث السيريال"), false);
}
async function ftthLoadFdtsForEdit(zoneId) {
  let zid = zoneId || (ftthLastExtra.zones[0] && ftthLastExtra.zones[0].id) || "";
  if (!zid) { setFtthDevMsg("لم يتم تحديد Zone لهذا المشترك", false); return; }
  const r = await ftthApiGet(`network-elements/fdts?zoneId=${encodeURIComponent(zid)}`);
  const arr = (r.ok && r.json && ((r.json.model && r.json.model.fdts) || r.json.items)) || [];
  const sel = document.getElementById("ftthEditFdt");
  if (!sel) return;
  sel.innerHTML = `<option value="">— اختر FDT (${arr.length}) —</option>` +
    arr.map(x => `<option value="${escHtml(x.id || (x.self && x.self.id))}">${escHtml(x.displayValue || (x.self && x.self.displayValue) || x.id)}</option>`).join("");
}
async function ftthLoadFatsForEdit(fdtId) {
  const sel = document.getElementById("ftthEditFat");
  if (!sel || !fdtId) return;
  sel.innerHTML = `<option value="">جاري جلب FATs...</option>`;
  const r = await ftthApiGet(`network-elements/fats?fdtId=${encodeURIComponent(fdtId)}`);
  const arr = (r.ok && r.json && ((r.json.model && r.json.model.fats) || r.json.items)) || [];
  sel.innerHTML = `<option value="">— اختر FAT (${arr.length}) —</option>` +
    arr.map(x => `<option value="${escHtml(x.id || (x.self && x.self.id))}">${escHtml(x.displayValue || (x.self && x.self.displayValue) || x.id)}</option>`).join("");
}
async function ftthDoUpdateNetElems() {
  const subId = _ftthDetState && _ftthDetState.subId;
  const body = {};
  const v = document.getElementById("ftthEditVend")?.value;
  const fdt = document.getElementById("ftthEditFdt")?.value;
  const fat = document.getElementById("ftthEditFat")?.value;
  if (v) body.ontVendor = v;
  if (fdt) body.fdt = fdt;
  if (fat) body.fat = fat;
  if (!Object.keys(body).length) { setFtthDevMsg("اختر عنصراً واحداً على الأقل للتعديل", false); return; }
  setFtthDevMsg("جاري حفظ عناصر الشبكة...", true);
  const r = await ftthApiPutJson(`subscriptions/${encodeURIComponent(subId)}/device`, body);
  if (r.ok) { setFtthDevMsg("✓ تم تحديث عناصر الشبكة بنجاح", true); renderFtthDeviceTab(true); }
  else setFtthDevMsg(ftthExtractErr(r, "فشل التحديث"), false);
}

async function openFtthPurchaseModal(uid) {
  const s = allSubs.find(x => x.id === uid) || { id: uid, fullName: String(uid), username: String(uid) };
  const subId = ftthSubIdMap[uid] || s.ftthSubId || "";
  const isTrial = !!ftthIsTrialMap[uid] || String(subId).toUpperCase().startsWith("T");
  _ftthPurState = {
    uid, s, subId, isTrial,
    zoneId: s.ftthZoneId || ftthZoneIdMap[uid] || (ftthLastExtra.zones[0] && ftthLastExtra.zones[0].id) || "",
    op: isTrial ? "Purchase" : (s.isActive ? "Extend" : "Renew"),
    months: 1, changeType: FTTH_CFG.changeImmediate, payMethod: FTTH_CFG.payWallet,
    plans: [], selIdx: 0, lastCalc: null
  };

  openFtthSheet("تفعيل / تجديد اشتراك FTTH", `${s.fullName} • @${s.username}`, `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب الباقات والأسعار...</div>`);
  const path = subId ? `plans/bundles?includePrices=true&subscriptionId=${encodeURIComponent(subId)}` : "plans/bundles?includePrices=true";
  const r = await ftthApiGet(path);
  const plans = [];
  if (r.ok && r.json && Array.isArray(r.json.items)) {
    r.json.items.forEach(b => {
      const bid = (b.self && b.self.id) || b.id || "";
      const subs = Array.isArray(b.applicableSubscriptions) ? b.applicableSubscriptions : [];
      subs.forEach(p => {
        const pName = p.displayValue || p.name || p.id || "باقة";
        const pVal = p.value || p.id || pName;
        const price = (p.price && p.price.value) || p.priceValue || 0;
        plans.push({ bundleId: String(bid), planName: String(pName), planValue: String(pVal), price: Number(price) });
      });
    });
  }
  _ftthPurState.plans = plans;
  const curIdx = plans.findIndex(p => p.planName.toLowerCase() === String(s.profile || "").toLowerCase());
  if (curIdx >= 0) _ftthPurState.selIdx = curIdx;
  renderFtthPurchaseUI();
  ftthRecalcPrice();
}

function renderFtthPurchaseUI() {
  const st = _ftthPurState;
  const body = document.getElementById("ftthModalBody");
  if (!st || !body) return;
  const planCards = st.plans.length
    ? st.plans.map((p, i) => `
      <div onclick="ftthSelectPlan(${i})" class="ftth-plan-card ${i === st.selIdx ? "on" : ""}">
        <div><b>${escHtml(p.planName)}</b></div>
        <div style="color:#38BDF8;font-weight:800" dir="ltr">${p.price ? fmtIqdNum(p.price) : "سعر مباشر"}</div>
      </div>`).join("")
    : `<div class="meta">لم يتم جلب الباقات من السيرفر</div>`;

  body.innerHTML = `
    <div class="box">
      <div class="ftth-sec-hd">نوع العملية</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        <button type="button" class="btn btn-sm btn-ghost" style="${st.op !== 'Change' ? 'border-color:#38BDF8;color:#38BDF8' : ''}" onclick="ftthSetPurOp('${st.isTrial ? "Purchase" : (st.s.isActive ? "Extend" : "Renew")}')">${st.isTrial ? "تفعيل تجريبي" : "تجديد / تمديد"}</button>
        <button type="button" class="btn btn-sm btn-ghost" style="${st.op === 'Change' ? 'border-color:#34D399;color:#34D399' : ''}" onclick="ftthSetPurOp('Change')">تغيير الباقة</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="ftthRecalcPrice()">↻ تحديث السعر</button>
      </div>
      ${st.op === "Change" ? `
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <button type="button" class="btn btn-sm btn-ghost" style="${st.changeType === FTTH_CFG.changeImmediate ? 'border-color:#38BDF8;color:#38BDF8' : ''}" onclick="ftthSetChangeType(true)">تغيير فوري</button>
          <button type="button" class="btn btn-sm btn-ghost" style="${st.changeType === FTTH_CFG.changeNext ? 'border-color:#38BDF8;color:#38BDF8' : ''}" onclick="ftthSetChangeType(false)">عند انتهاء الاشتراك</button>
        </div>` : ""}
    </div>

    <div class="box">
      <div class="ftth-sec-hd">اختر الباقة</div>
      <div style="display:grid;gap:6px">${planCards}</div>
    </div>

    <div class="box">
      <div class="ftth-sec-hd">المدة (عدد الأشهر)</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        ${[1, 3, 6, 12].map(m => `<button type="button" class="btn btn-sm btn-ghost" style="${st.months === m ? 'border-color:#38BDF8;color:#38BDF8' : ''}" onclick="ftthSetPurMonths(${m})">${m} شهر</button>`).join("")}
      </div>
      <div class="ftth-sec-hd" style="margin-top:10px">طريقة الدفع</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button type="button" class="btn btn-sm btn-ghost" style="${st.payMethod === FTTH_CFG.payWallet ? 'border-color:#4ADE80;color:#4ADE80' : ''}" onclick="ftthSetPayMethod('${FTTH_CFG.payWallet}')">محفظة الوكيل</button>
        <button type="button" class="btn btn-sm btn-ghost" style="${st.payMethod === FTTH_CFG.payCard ? 'border-color:#38BDF8;color:#38BDF8' : ''}" onclick="ftthSetPayMethod('${FTTH_CFG.payCard}')">بطاقة / تبادل</button>
      </div>
    </div>

    <div id="ftthPriceBox" class="box" style="border-color:#38BDF855;text-align:center">جاري حساب السعر الدقيق...</div>
    <div id="ftthPurMsg" class="status" style="display:none;margin-bottom:10px"></div>
    <button id="ftthPurSubmitBtn" type="button" class="btn btn-green" onclick="ftthSubmitPurchase()">تأكيد وتنفيذ التفعيل</button>
  `;
}

function ftthSelectPlan(i) { _ftthPurState.selIdx = i; renderFtthPurchaseUI(); ftthRecalcPrice(); }
function ftthSetPurMonths(m) { _ftthPurState.months = m; renderFtthPurchaseUI(); ftthRecalcPrice(); }
function ftthSetPurOp(op) { _ftthPurState.op = op; renderFtthPurchaseUI(); ftthRecalcPrice(); }
function ftthSetChangeType(imm) { _ftthPurState.changeType = imm ? FTTH_CFG.changeImmediate : FTTH_CFG.changeNext; renderFtthPurchaseUI(); ftthRecalcPrice(); }
function ftthSetPayMethod(pm) { _ftthPurState.payMethod = pm; renderFtthPurchaseUI(); }

async function ftthRecalcPrice() {
  const st = _ftthPurState;
  const pBox = document.getElementById("ftthPriceBox");
  if (!st || !pBox || !st.plans.length) return;
  const plan = st.plans[st.selIdx];
  pBox.innerHTML = `<span style="color:#94A3B8">جاري حساب السعر من سيرفر FTTH...</span>`;
  const svcJson = JSON.stringify({ value: plan.planValue, type: "Base" });
  const opType = st.op === "Change" ? "Change" : (st.isTrial ? "Purchase" : (st.s.isActive ? "Extend" : "Renew"));
  const qs = `subscriptions/calculate-price?bundleId=${encodeURIComponent(plan.bundleId)}&commitmentPeriodValue=${st.months}&planOperationType=${encodeURIComponent(opType)}&subscriptionId=${encodeURIComponent(st.subId)}&services=${encodeURIComponent(svcJson)}&salesType=0&changeType=${encodeURIComponent(st.changeType)}`;
  const r = await ftthApiGet(qs);
  if (r.ok && r.json && r.json.model) {
    const m = r.json.model;
    const tot = Number((m.totalPrice && m.totalPrice.value) || plan.price * st.months || 0);
    const single = Number((m.singleMonthPrice && m.singleMonthPrice.value) || plan.price || tot);
    const disc = Number((m.totalOffersDiscount && m.totalOffersDiscount.value) || 0);
    const cur = (m.totalPrice && m.totalPrice.currency) || "IQD";
    st.lastCalc = { tot, single, disc, cur };
    pBox.innerHTML = `
      <div style="font-size:12px;color:#94A3B8">سعر الشهر: <b dir="ltr">${fmtIqdNum(single, cur)}</b> × ${st.months} شهر ${disc > 0 ? "• خصم: <b style='color:#4ADE80'>" + fmtIqdNum(disc, cur) + "</b>" : ""}</div>
      <div style="font-size:20px;font-weight:900;color:#4ADE80;margin-top:4px" dir="ltr">${fmtIqdNum(tot, cur)}</div>
    `;
  } else {
    const est = (plan.price || 0) * st.months;
    st.lastCalc = { tot: est, single: plan.price || 0, disc: 0, cur: "IQD" };
    pBox.innerHTML = `<div style="font-size:12px;color:#FBBF24">سعر تقديري (${escHtml(ftthExtractErr(r, ""))}): <b dir="ltr">${fmtIqdNum(est)}</b></div>`;
  }
}

async function ftthSubmitPurchase() {
  const st = _ftthPurState;
  if (!st || !st.plans.length) return;
  const plan = st.plans[st.selIdx];
  const simPrice = Math.round((st.lastCalc && st.lastCalc.tot) || (plan.price * st.months) || 0);
  if (!confirm(`تأكيد تفعيل باقة (${plan.planName}) لمدة ${st.months} شهر بمبلغ ${fmtIqdNum(simPrice)}؟`)) return;

  const btn = document.getElementById("ftthPurSubmitBtn");
  const msg = document.getElementById("ftthPurMsg");
  if (btn) btn.disabled = true;
  if (msg) { msg.style.display = "block"; msg.style.color = "#38BDF8"; msg.textContent = "جاري تنفيذ التفعيل على بوابة FTTH..."; }

  const payDetails = { paymentMethod: st.payMethod };
  if (st.payMethod !== FTTH_CFG.payWallet) {
    payDetails.statusPageBaseUrl = "https://admin.ftth.iq/page/tabadul-payment-status";
  }
  const services = [{ value: plan.planValue, type: "Base" }];
  let r;
  if (st.isTrial && st.op === "Purchase") {
    r = await ftthApiPostJson("subscriptions/purchase", {
      zoneId: st.zoneId, bundleId: plan.bundleId, services,
      commitmentPeriod: st.months, trialSubscriptionId: st.subId,
      simulatedPrice: simPrice, salesType: 0, paymentDetails: payDetails
    });
  } else if (st.op === "Change") {
    r = await ftthApiPostJson(`subscriptions/${encodeURIComponent(st.subId)}/change`, {
      bundleId: plan.bundleId, simulatedPrice: simPrice,
      commitmentPeriodValue: st.months, services,
      salesType: 0, changeType: st.changeType, paymentDetails: payDetails
    });
  } else {
    const body = {
      bundleId: plan.bundleId, simulatedPrice: simPrice,
      commitmentPeriodValue: st.months, services,
      salesType: 0, changeType: st.changeType, paymentDetails: payDetails
    };
    const ep1 = st.s.isActive ? `subscriptions/${encodeURIComponent(st.subId)}/extend` : `subscriptions/${encodeURIComponent(st.subId)}/renew`;
    const ep2 = st.s.isActive ? `subscriptions/${encodeURIComponent(st.subId)}/renew` : `subscriptions/${encodeURIComponent(st.subId)}/extend`;
    r = await ftthApiPostJson(ep1, body);
    if (!r.ok && (r.status === 404 || r.status === 405)) r = await ftthApiPostJson(ep2, body);
  }

  if (btn) btn.disabled = false;
  if (r.ok) {
    const payUrl = r.json && ((r.json.model && r.json.model.paymentUrl) || r.json.paymentUrl);
    if (payUrl) {
      if (msg) { msg.style.color = "#4ADE80"; msg.textContent = "تم إنشاء رابط دفع تبادل — جاري الفتح..."; }
      window.open(payUrl, "_blank");
    } else {
      if (msg) { msg.style.color = "#4ADE80"; msg.textContent = "✓ تم تفعيل / تجديد الاشتراك بنجاح!"; }
      refreshAll();
    }
  } else {
    if (msg) { msg.style.color = "#FCA5A5"; msg.textContent = ftthExtractErr(r, "فشل التفعيل"); }
  }
}

async function openFtthOnboardingModal() {
  _ftthOnbState = {
    step: 1, files: {}, zones: ftthLastExtra.zones || [],
    installOpts: [], plans: [], contractHtml: "",
    selPlan: "", selInstId: "", selInstName: "",
    sigCanvas: null, sigHasInk: false,
    form: {
      firstName: "", secondName: "", thirdName: "", fourthName: "", familyName: "",
      motherFirstName: "", motherSecondName: "", motherThirdName: "", motherFourthName: "",
      mobile: "", secondaryPhone: "", email: "",
      isNationalId: true, idNumber: "", idPlaceOfIssue: "", idIssuedAt: "2022-01-01",
      familyNumber: "", bookNumber: "", pageNumber: "", birthday: "1995-01-01",
      resCardNumber: "", resPlaceOfIssue: "", resIssuedAt: "2022-01-01",
      zoneId: (ftthLastExtra.zones[0] && ftthLastExtra.zones[0].id) || "",
      gps: "", address: "", neighbourhoodNumber: "", streetNumber: "", houseNumber: "", appartmentNumber: ""
    }
  };
  openFtthSheet("تسجيل مشترك FTTH جديد", "الخطوة 1 من 3 • البيانات والوثائق", `<div class="box" style="text-align:center;color:#94A3B8">جاري تجهيز المعالج وجلب المناطق والباقات...</div>`);
  const [rZones, rInst, rPlans, rContract] = await Promise.all([
    _ftthOnbState.zones.length ? Promise.resolve({ ok: false }) : ftthApiGet("locations/zones"),
    ftthApiGet("requests/customer-onboarding/installation-options"),
    ftthApiGet("plans/bundles?includePrices=true"),
    ftthApiGet("contracts")
  ]);
  if (rZones.ok && rZones.json && Array.isArray(rZones.json.items)) {
    _ftthOnbState.zones = rZones.json.items.map(x => ({ id: x.self.id, name: x.self.displayValue || x.self.id }));
    if (!_ftthOnbState.form.zoneId && _ftthOnbState.zones[0]) _ftthOnbState.form.zoneId = _ftthOnbState.zones[0].id;
  }
  if (rInst.ok && rInst.json && Array.isArray(rInst.json.items)) {
    _ftthOnbState.installOpts = rInst.json.items.map(x => ({ id: (x.self && x.self.id) || x.id, name: (x.self && x.self.displayValue) || x.displayValue || "قياسي" }));
    if (_ftthOnbState.installOpts[0]) { _ftthOnbState.selInstId = _ftthOnbState.installOpts[0].id; _ftthOnbState.selInstName = _ftthOnbState.installOpts[0].name; }
  }
  if (rPlans.ok && rPlans.json && Array.isArray(rPlans.json.items)) {
    rPlans.json.items.forEach(b => {
      (b.applicableSubscriptions || []).forEach(p => {
        _ftthOnbState.plans.push({ name: p.displayValue || p.name || p.id, price: (p.price && p.price.value) || 0 });
      });
    });
    if (_ftthOnbState.plans[0]) _ftthOnbState.selPlan = _ftthOnbState.plans[0].name;
  }
  if (rContract.ok && rContract.json) {
    _ftthOnbState.contractHtml = (rContract.json.model && (rContract.json.model.content || rContract.json.model.html)) || rContract.json.content || "";
  }
  renderFtthOnbStep();
}

function saveOnbInputsFromDom() {
  const f = _ftthOnbState && _ftthOnbState.form;
  if (!f) return;
  document.querySelectorAll("[data-onb]").forEach(el => {
    const k = el.getAttribute("data-onb");
    if (k === "isNationalId") f[k] = el.value === "1";
    else f[k] = el.value;
  });
}

function renderFtthOnbStep() {
  const st = _ftthOnbState, body = document.getElementById("ftthModalBody");
  if (!st || !body) return;
  const f = st.form;
  document.getElementById("ftthModalSub").textContent =
    st.step === 1 ? "الخطوة 1 من 3 • البيانات الشخصية والوثائق" :
    st.step === 2 ? "الخطوة 2 من 3 • الموقع الجغرافي والباقة" :
    "الخطوة 3 من 3 • العقد والتوقيع وإرسال الطلب";

  const inp = (k, lbl, ph = "", type = "text", ltr = false) =>
    `<label>${lbl}</label><input data-onb="${k}" type="${type}" ${ltr ? 'dir="ltr"' : ""} value="${escHtml(f[k] || "")}" placeholder="${ph}">`;
  const docRow = (slot, lbl) => {
    const done = !!st.files[slot];
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:#0B1220;border:1px solid ${done ? "#10B981" : "#1E293B"};border-radius:10px;padding:8px 10px;margin-bottom:7px">
      <div style="font-size:12px;color:${done ? "#4ADE80" : "#CBD5E1"}">${done ? "✓ " : ""}${lbl}</div>
      <label style="margin:0;background:#1E293B;color:#38BDF8;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
        ${done ? "تغيير الصورة" : "📷 اختيار صورة"}
        <input type="file" accept="image/*" style="display:none" onchange="ftthOnbUploadDoc('${slot}', this)">
      </label>
    </div>`;
  };

  if (st.step === 1) {
    body.innerHTML = `
      <div id="ftthOnbMsg" class="status" style="display:none;margin-bottom:10px"></div>
      <div class="box">
        <div class="ftth-sec-hd">👤 اسم المشترك واسم الأم</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div>${inp("firstName", "الاسم الأول *")}</div>
          <div>${inp("secondName", "اسم الأب *")}</div>
          <div>${inp("thirdName", "اسم الجد *")}</div>
          <div>${inp("fourthName", "الاسم الرابع")}</div>
        </div>
        ${inp("familyName", "اللقب *")}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div>${inp("motherFirstName", "اسم الأم *")}</div>
          <div>${inp("motherSecondName", "أب الأم *")}</div>
          <div>${inp("motherThirdName", "جد الأم")}</div>
          <div>${inp("motherFourthName", "الاسم الرابع للأم")}</div>
        </div>
      </div>
      <div class="box">
        <div class="ftth-sec-hd">📱 الاتصال</div>
        ${inp("mobile", "رقم الموبايل * (سيصل عليه OTP)", "077xxxxxxxx", "tel", true)}
        ${inp("secondaryPhone", "رقم هاتف ثانوي (اختياري)", "078xxxxxxxx", "tel", true)}
        ${inp("email", "البريد الإلكتروني (اختياري)", "name@mail.com", "email", true)}
      </div>
      <div class="box">
        <div class="ftth-sec-hd">🪪 الهوية / البطاقة الموحدة</div>
        <label>نوع الوثيقة</label>
        <select data-onb="isNationalId">
          <option value="1" ${f.isNationalId ? "selected" : ""}>البطاقة الوطنية الموحدة</option>
          <option value="0" ${!f.isNationalId ? "selected" : ""}>هوية الأحوال المدنية</option>
        </select>
        ${inp("idNumber", "رقم البطاقة / الهوية *", "", "text", true)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div>${inp("idPlaceOfIssue", "جهة الإصدار *")}</div>
          <div>${inp("idIssuedAt", "تاريخ الإصدار *", "", "date", true)}</div>
          <div>${inp("birthday", "تاريخ الميلاد *", "", "date", true)}</div>
          <div>${inp("familyNumber", "الرقم العائلي", "", "text", true)}</div>
          <div>${inp("bookNumber", "رقم السجل", "", "text", true)}</div>
          <div>${inp("pageNumber", "رقم الصحيفة", "", "text", true)}</div>
        </div>
        ${docRow("frontnatId", "الوجه الأمامي للبطاقة الموحدة *")}
        ${docRow("backnatId", "الوجه الخلفي للبطاقة الموحدة *")}
      </div>
      <div class="box">
        <div class="ftth-sec-hd">🏠 بطاقة السكن</div>
        ${inp("resCardNumber", "رقم بطاقة السكن *", "", "text", true)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div>${inp("resPlaceOfIssue", "جهة الإصدار *")}</div>
          <div>${inp("resIssuedAt", "تاريخ الإصدار *", "", "date", true)}</div>
        </div>
        ${docRow("frontResId", "الوجه الأمامي لبطاقة السكن *")}
        ${docRow("backResId", "الوجه الخلفي لبطاقة السكن *")}
      </div>
      <button type="button" class="btn" onclick="ftthOnbNext(2)">التالي: الموقع والباقة ›</button>
    `;
  } else if (st.step === 2) {
    body.innerHTML = `
      <div id="ftthOnbMsg" class="status" style="display:none;margin-bottom:10px"></div>
      <div class="box">
        <div class="ftth-sec-hd">📍 الموقع الجغرافي والعنوان</div>
        <label>المنطقة (Zone) *</label>
        <select data-onb="zoneId">
          ${st.zones.map(z => `<option value="${escHtml(z.id)}" ${z.id === f.zoneId ? "selected" : ""}>${escHtml(z.name)}</option>`).join("")}
        </select>
        <label>إحداثيات GPS * (lat, lng)</label>
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <input id="ftthOnbGpsInp" data-onb="gps" type="text" dir="ltr" style="margin:0" value="${escHtml(f.gps)}" placeholder="36.3489, 43.1577">
          <button type="button" class="btn btn-sm btn-green" style="width:auto;white-space:nowrap" onclick="ftthOnbGetGps()">📍 موقعي</button>
        </div>
        ${inp("address", "العنوان التفصيلي *")}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div>${inp("neighbourhoodNumber", "المحلة", "", "text", true)}</div>
          <div>${inp("streetNumber", "الزقاق", "", "text", true)}</div>
          <div>${inp("houseNumber", "الدار", "", "text", true)}</div>
          <div>${inp("appartmentNumber", "الشقة", "", "text", true)}</div>
        </div>
      </div>
      <div class="box">
        <div class="ftth-sec-hd">📦 خيار التنصيب والباقة</div>
        <label>خيار التنصيب</label>
        <select onchange="ftthOnbPickInst(this)">
          ${st.installOpts.map(o => `<option value="${escHtml(o.id)}" ${o.id === st.selInstId ? "selected" : ""}>${escHtml(o.name)}</option>`).join("")}
        </select>
        <label>الباقة المطلوبة *</label>
        <select onchange="_ftthOnbState.selPlan = this.value">
          ${st.plans.map(p => `<option value="${escHtml(p.name)}" ${p.name === st.selPlan ? "selected" : ""}>${escHtml(p.name)}${p.price ? " — " + fmtIqdNum(p.price) : ""}</option>`).join("")}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px">
        <button type="button" class="btn btn-ghost" onclick="ftthOnbNext(1)">‹ السابق</button>
        <button type="button" class="btn" onclick="ftthOnbNext(3)">التالي: العقد والتوقيع ›</button>
      </div>
    `;
  } else {
    const cleanContract = (st.contractHtml || "شروط وأحكام عقد المشروع الوطني للإنترنت FTTH.").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    body.innerHTML = `
      <div id="ftthOnbMsg" class="status" style="display:none;margin-bottom:10px"></div>
      <div class="box">
        <div class="ftth-sec-hd">📜 عقد الاشتراك</div>
        <div style="max-height:130px;overflow-y:auto;font-size:12px;color:#CBD5E1;line-height:1.6;background:#0B1220;padding:10px;border-radius:10px">${escHtml(cleanContract)}</div>
      </div>
      <div class="box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span class="ftth-sec-hd" style="margin:0">✍ توقيع المشترك *</span>
          <button type="button" class="btn btn-sm btn-ghost" style="width:auto" onclick="ftthClearSig()">مسح التوقيع</button>
        </div>
        <canvas id="ftthSigCanvas" width="360" height="150" style="width:100%;height:150px;background:#FFFFFF;border-radius:10px;touch-action:none;cursor:crosshair"></canvas>
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px">
        <button type="button" class="btn btn-ghost" onclick="ftthOnbNext(2)">‹ السابق</button>
        <button id="ftthOnbSubBtn" type="button" class="btn btn-green" onclick="ftthSubmitOnboarding()">إرسال الطلب وتوليد OTP</button>
      </div>
    `;
    initFtthSigPad();
  }
}

function setOnbMsg(txt, ok = false) {
  const el = document.getElementById("ftthOnbMsg");
  if (!el) return;
  el.style.display = "block";
  el.style.color = ok ? "#4ADE80" : "#FCA5A5";
  el.textContent = txt;
}
function ftthOnbPickInst(sel) {
  _ftthOnbState.selInstId = sel.value;
  _ftthOnbState.selInstName = sel.options[sel.selectedIndex]?.text || "";
}
async function ftthOnbUploadDoc(slot, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  saveOnbInputsFromDom();
  setOnbMsg("جاري ضغط ورفع الصورة إلى سيرفر FTTH...", true);
  const comp = await ftthCompressImage(file);
  const r = await ftthUploadFile(comp, slot + ".jpg");
  if (r.ok) {
    _ftthOnbState.files[slot] = r.id;
    renderFtthOnbStep();
    setOnbMsg("✓ تم رفع الصورة بنجاح", true);
  } else {
    setOnbMsg(r.error || "فشل رفع الصورة", false);
  }
}
function ftthOnbGetGps() {
  if (!navigator.geolocation) { setOnbMsg("المتصفح لا يدعم GPS", false); return; }
  setOnbMsg("جاري تحديد موقعك الحالي...", true);
  navigator.geolocation.getCurrentPosition(
    pos => {
      const val = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
      _ftthOnbState.form.gps = val;
      const inp = document.getElementById("ftthOnbGpsInp");
      if (inp) inp.value = val;
      setOnbMsg("✓ تم تحديد الموقع: " + val, true);
    },
    err => setOnbMsg("تعذر قراءة GPS: " + err.message, false),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
function ftthOnbNext(targetStep) {
  saveOnbInputsFromDom();
  const st = _ftthOnbState, f = st.form;
  if (targetStep === 2 && st.step === 1) {
    if (!f.firstName.trim() || !f.secondName.trim() || !f.mobile.trim()) { setOnbMsg("أكمل الاسم الأول واسم الأب ورقم الموبايل أولاً"); return; }
    if (!st.files.frontnatId || !st.files.backnatId || !st.files.frontResId || !st.files.backResId) {
      setOnbMsg("يرجى رفع صور البطاقة الموحدة وبطاقة السكن (أمام وخلف) أولاً"); return;
    }
  }
  if (targetStep === 3 && st.step === 2) {
    if (!f.gps.includes(",")) { setOnbMsg("حدد إحداثيات GPS أولاً (اضغط زر موقعي)"); return; }
  }
  st.step = targetStep;
  renderFtthOnbStep();
}
function initFtthSigPad() {
  const c = document.getElementById("ftthSigCanvas");
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#0F172A"; ctx.lineWidth = 3; ctx.lineCap = "round";
  let drawing = false;
  const posOf = e => {
    const rect = c.getBoundingClientRect();
    const t = (e.touches && e.touches[0]) || e;
    return { x: (t.clientX - rect.left) * (c.width / rect.width), y: (t.clientY - rect.top) * (c.height / rect.height) };
  };
  const start = e => { e.preventDefault(); drawing = true; const p = posOf(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); _ftthOnbState.sigHasInk = true; };
  const move = e => { if (!drawing) return; e.preventDefault(); const p = posOf(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing = false; };
  c.onpointerdown = start; c.onpointermove = move; c.onpointerup = end; c.onpointerleave = end;
  _ftthOnbState.sigCanvas = c; _ftthOnbState.sigHasInk = false;
}
function ftthClearSig() {
  const c = _ftthOnbState && _ftthOnbState.sigCanvas;
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
  _ftthOnbState.sigHasInk = false;
}
async function ftthSubmitOnboarding() {
  const st = _ftthOnbState, f = st.form;
  if (!st.sigHasInk) { setOnbMsg("يرجى رسم توقيع المشترك أولاً"); return; }
  const btn = document.getElementById("ftthOnbSubBtn");
  if (btn) btn.disabled = true;
  setOnbMsg("جاري رفع التوقيع وإرسال طلب المشترك الجديد...", true);

  const sigBlob = await new Promise(res => st.sigCanvas.toBlob(res, "image/png"));
  const upSig = await ftthUploadFile(sigBlob, "signature.png");
  if (!upSig.ok) { if (btn) btn.disabled = false; setOnbMsg(upSig.error, false); return; }

  const eng = v => ({ englishName: String(v || "").trim() || "بلا" });
  const toIso = d => d ? (d.includes("T") ? d : d + "T00:00:00.000Z") : new Date().toISOString();
  const cardNum = /^\d+$/.test(f.resCardNumber.trim()) ? Number(f.resCardNumber.trim()) : f.resCardNumber.trim();
  const contactItem = { email: f.email.trim() || null, mobile: f.mobile.trim() };
  if (f.secondaryPhone.trim()) contactItem.secondaryPhone = f.secondaryPhone.trim();

  const body = {
    requestContactInfo: {
      firstName: eng(f.firstName), secondName: eng(f.secondName), thirdName: eng(f.thirdName),
      fourthName: eng(f.fourthName), familyName: eng(f.familyName),
      motherFirstName: eng(f.motherFirstName), motherSecondName: eng(f.motherSecondName),
      motherThirdName: eng(f.motherThirdName), motherFourthName: eng(f.motherFourthName),
      contactInfo: [contactItem],
      nationalId: {
        officialDocument: { frontFileId: st.files.frontnatId, backFileId: st.files.backnatId },
        idNumber: f.idNumber.trim(), placeOfIssue: f.idPlaceOfIssue.trim(),
        issuedAt: toIso(f.idIssuedAt), idType: { id: f.isNationalId ? "0" : "1" },
        familyNumber: f.familyNumber.trim(), bookNumber: f.bookNumber.trim(),
        pageNumber: f.pageNumber.trim(), birthday: f.birthday.trim()
      },
      residenceId: {
        cardNumber: cardNum, placeOfIssue: f.resPlaceOfIssue.trim(),
        officialDocument: { frontFileId: st.files.frontResId, backFileId: st.files.backResId },
        issuedAt: toIso(f.resIssuedAt)
      }
    },
    subscription: { id: null, planName: st.selPlan, username: null, password: null },
    requestAccountSiteInfo: {
      gpsCoordinates: f.gps.trim(), address: f.address.trim(),
      appartmentNumber: f.appartmentNumber.trim(), houseNumber: f.houseNumber.trim(),
      neighbourhoodNumber: f.neighbourhoodNumber.trim(), streetNumber: f.streetNumber.trim(),
      zoneId: f.zoneId.trim()
    },
    installationOption: { id: st.selInstId, displayValue: st.selInstName },
    signatureFileId: upSig.id
  };

  const r = await ftthApiPostJson("requests/customer-onboarding", body);
  if (btn) btn.disabled = false;
  if (r.ok) {
    const reqId = (r.json && (r.json.id || (r.json.model && r.json.model.id))) || "";
    renderFtthOtpStep(f.mobile.trim(), reqId);
  } else {
    setOnbMsg(ftthExtractErr(r, "فشل إرسال طلب المشترك الجديد"), false);
  }
}

function renderFtthOtpStep(phone, requestId) {
  document.getElementById("ftthModalSub").textContent = "تأكيد رمز التحقق (OTP)";
  document.getElementById("ftthModalBody").innerHTML = `
    <div class="box" style="border-color:#10B98166">
      <div style="color:#4ADE80;font-weight:800;margin-bottom:6px">✓ تم إنشاء الطلب بنجاح!</div>
      <div class="meta">أدخل رمز التحقق (OTP) المرسل إلى الرقم <b dir="ltr">${escHtml(phone)}</b>:</div>
      <input id="ftthOtpCode" type="tel" dir="ltr" placeholder="123456" style="margin-top:8px;text-align:center;font-size:18px;letter-spacing:4px">
      <div id="ftthOtpMsg" class="status" style="display:none;margin-bottom:8px"></div>
      <button type="button" class="btn btn-green" onclick="ftthVerifyOtp('${escHtml(phone)}')">تأكيد رمز OTP</button>
      <button type="button" class="btn btn-ghost" style="margin-top:8px" onclick="openFtthTasksModal()">الانتقال إلى مهام الربط</button>
    </div>
  `;
}
async function ftthVerifyOtp(phone) {
  const otp = (document.getElementById("ftthOtpCode")?.value || "").trim();
  const msg = document.getElementById("ftthOtpMsg");
  if (!otp) return;
  if (msg) { msg.style.display = "block"; msg.style.color = "#38BDF8"; msg.textContent = "جاري التحقق من الرمز..."; }
  const r = await ftthApiPostJson("requests/otp-validation", { phoneNumber: phone, otp, requestType: 0 });
  if (r.ok) {
    if (msg) { msg.style.color = "#4ADE80"; msg.textContent = "✓ تم تأكيد OTP بنجاح! يمكنك الآن إكمال مهمة الربط."; }
    refreshAll();
  } else {
    if (msg) { msg.style.color = "#FCA5A5"; msg.textContent = ftthExtractErr(r, "رمز OTP غير صحيح"); }
  }
}

async function openFtthTasksModal() {
  openFtthSheet("مهام الربط والتنصيب (FTTH)", "اضغط على أي مهمة لإكمال الربط أو عرض التفاصيل", `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب المهام...</div>`);
  const [r0, r1, r2] = await Promise.all([
    ftthApiGet("tasks?pageSize=30&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&hierarchyLevel=0"),
    ftthApiGet("tasks?pageSize=30&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&status=0&hierarchyLevel=1"),
    ftthApiGet("tasks?pageSize=30&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&status=1&hierarchyLevel=1")
  ]);
  const seen = new Set(), tasks = [];
  [r0, r1, r2].forEach(r => {
    if (r.ok && r.json && Array.isArray(r.json.items)) {
      r.json.items.forEach(o => {
        const id = (o.self && o.self.id) || o.id || "";
        if (!id || seen.has(id)) return;
        seen.add(id); tasks.push(o);
      });
    }
  });
  const body = document.getElementById("ftthModalBody");
  if (!tasks.length) { body.innerHTML = `<div class="box" style="text-align:center;color:#94A3B8">لا توجد مهام حالياً.</div>`; return; }
  body.innerHTML = tasks.map(t => {
    const id = (t.self && t.self.id) || t.id;
    const title = (t.self && t.self.displayValue) || (t.type && t.type.displayValue) || "مهمة ربط";
    const cust = (t.customer && t.customer.displayValue) || "—";
    const stName = (t.status && t.status.displayValue) || t.status || "—";
    const zone = (t.zone && t.zone.displayValue) || "—";
    const zid = (t.zone && t.zone.id) || "";
    const isDone = String(stName).toLowerCase().includes("complet") || String(stName).includes("مكتمل");
    return `<div class="box" style="cursor:pointer;border-color:${isDone ? "#10B98155" : "#38BDF855"}" onclick="openFtthTaskConnectForm('${escHtml(id)}','${escHtml(zid)}','${escHtml(title)}','${escHtml(cust)}',${isDone})">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:#F8FAFC">${escHtml(cust)}</b>
        <span class="st-badge ${isDone ? "st-on" : "st-act"}">${escHtml(stName)}</span>
      </div>
      <div class="meta" style="margin-top:4px">${escHtml(title)} • ${escHtml(zone)}</div>
      <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(t.createdAt)}</div>
    </div>`;
  }).join("");
}

async function openFtthTaskConnectForm(taskId, zoneId, title, custName, isDone) {
  openFtthSheet(custName || "مهمة ربط", title, `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب تفاصيل المهمة وعناصر الشبكة...</div>`);
  const [rDet, rConn, rVend, rFdts] = await Promise.all([
    ftthApiGet("tasks/" + encodeURIComponent(taskId)),
    isDone ? ftthApiGet("tasks/customer-connections/" + encodeURIComponent(taskId)) : Promise.resolve({ ok: false }),
    isDone ? Promise.resolve({ ok: false }) : ftthApiGet("network-elements/ont-vendors"),
    (!isDone && zoneId) ? ftthApiGet("network-elements/fdts?zoneId=" + encodeURIComponent(zoneId)) : Promise.resolve({ ok: false })
  ]);
  const body = document.getElementById("ftthModalBody");
  if (isDone && rConn.ok && rConn.json && rConn.json.model) {
    const m = rConn.json.model;
    body.innerHTML = `<div class="box">
      <div class="ftth-sec-hd">✓ تفاصيل الربط المكتمل</div>
      <div class="ftth-kv"><span>يوزر الجهاز</span><b dir="ltr">${escHtml(m.deviceUsername || "—")}</b></div>
      <div class="ftth-kv"><span>سيريال ONT</span><b dir="ltr">${escHtml(m.deviceSerial || m.ontSerial || "—")}</b></div>
      <div class="ftth-kv"><span>مزوّد ONT</span><b dir="ltr">${escHtml((m.ontVendor && m.ontVendor.displayValue) || "—")}</b></div>
      <div class="ftth-kv"><span>FDT / FAT</span><b dir="ltr">${escHtml((m.fdt && m.fdt.displayValue) || "—")} • ${escHtml((m.fat && m.fat.displayValue) || "—")}</b></div>
    </div><button type="button" class="btn btn-ghost" onclick="openFtthTasksModal()">‹ رجوع للمهام</button>`;
    return;
  }

  const vendors = (rVend.ok && rVend.json && rVend.json.model && rVend.json.model.ontVendors) || [];
  const detM = (rDet.ok && rDet.json && rDet.json.model) || {};
  const effZoneId = zoneId || (detM.zone && detM.zone.id) || (ftthLastExtra.zones[0] && ftthLastExtra.zones[0].id) || "";
  let fdts = (rFdts.ok && rFdts.json && ((rFdts.json.model && rFdts.json.model.fdts) || rFdts.json.items)) || [];
  if (!fdts.length && effZoneId) {
    const rF2 = await ftthApiGet("network-elements/fdts?zoneId=" + encodeURIComponent(effZoneId));
    fdts = (rF2.ok && rF2.json && ((rF2.json.model && rF2.json.model.fdts) || rF2.json.items)) || [];
  }
  _ftthTaskConnState = { taskId, fats: [] };

  body.innerHTML = `
    <div id="ftthTaskMsg" class="status" style="display:none;margin-bottom:10px"></div>
    <div class="box">
      <label>اسم مستخدم الجهاز (Device Username) *</label>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="tcUser" type="text" dir="ltr" style="margin:0" placeholder="username">
        <button type="button" class="btn btn-sm btn-ghost" style="width:auto" onclick="ftthValidateTaskField('user')">فحص</button>
      </div>
      <label>كلمة مرور الجهاز (Device Password) *</label>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="tcPass" type="text" dir="ltr" style="margin:0" placeholder="password">
        <button type="button" class="btn btn-sm btn-ghost" style="width:auto" onclick="ftthValidateTaskField('pass')">فحص</button>
      </div>
      <label>سيريال ONT *</label>
      <input id="tcSerial" type="text" dir="ltr" placeholder="HWTC...">
      <label>مزوّد ONT *</label>
      <select id="tcVend">${vendors.map(v => `<option value="${escHtml(v.id || (v.self && v.self.id))}">${escHtml(v.displayValue || (v.self && v.self.displayValue) || v.id)}</option>`).join("")}</select>
      <label>الكابينة (FDT) *</label>
      <select id="tcFdt" onchange="ftthLoadTaskFats(this.value)">
        <option value="">— اختر FDT (${fdts.length}) —</option>
        ${fdts.map(x => `<option value="${escHtml(x.id || (x.self && x.self.id))}">${escHtml(x.displayValue || (x.self && x.self.displayValue) || x.id)}</option>`).join("")}
      </select>
      <label>بحث واختيار FAT *</label>
      <input id="tcFatSearch" type="search" placeholder="ابحث عن رقم FAT..." oninput="ftthFilterTaskFats(this.value)">
      <select id="tcFat"><option value="">— اختر FDT أولاً —</option></select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div><label>رقم نقطة التجهيز</label><input id="tcSupply" type="text" dir="ltr" value="0"></div>
        <div><label>كود التنصيب (إن وُجد)</label><input id="tcCode" type="text" dir="ltr" value=""></div>
      </div>
    </div>
    <button id="tcSubmitBtn" type="button" class="btn btn-green" onclick="ftthSubmitTaskConnect()">إكمال الربط وتفعيل الجهاز</button>
    <button type="button" class="btn btn-ghost" style="margin-top:8px" onclick="openFtthTasksModal()">‹ رجوع للمهام</button>
  `;
}

async function ftthValidateTaskField(kind) {
  const msg = document.getElementById("ftthTaskMsg");
  const val = (document.getElementById(kind === "user" ? "tcUser" : "tcPass")?.value || "").trim();
  if (!val) return;
  const ep = kind === "user" ? `subscriptions/validate-username?username=${encodeURIComponent(val)}` : `subscriptions/validate-password?password=${encodeURIComponent(val)}`;
  const r = await ftthApiGet(ep);
  if (msg) {
    msg.style.display = "block";
    msg.style.color = r.ok ? "#4ADE80" : "#FCA5A5";
    msg.textContent = r.ok ? "✓ القيمة مقبولة وصحيحة" : ftthExtractErr(r, "قيمة غير مقبولة");
  }
}
async function ftthLoadTaskFats(fdtId) {
  const sel = document.getElementById("tcFat");
  if (!sel || !fdtId) return;
  sel.innerHTML = `<option value="">جاري جلب FATs...</option>`;
  const r = await ftthApiGet("network-elements/fats?fdtId=" + encodeURIComponent(fdtId));
  _ftthTaskConnState.fats = (r.ok && r.json && ((r.json.model && r.json.model.fats) || r.json.items)) || [];
  ftthFilterTaskFats("");
}
function ftthFilterTaskFats(q) {
  const sel = document.getElementById("tcFat");
  if (!sel || !_ftthTaskConnState) return;
  const ql = String(q || "").trim().toLowerCase();
  const list = _ftthTaskConnState.fats.filter(x => !ql || String(x.displayValue || x.id || "").toLowerCase().includes(ql));
  sel.innerHTML = list.length
    ? list.map(x => `<option value="${escHtml(x.id || (x.self && x.self.id))}">${escHtml(x.displayValue || (x.self && x.self.displayValue) || x.id)}</option>`).join("")
    : `<option value="">لا توجد نتائج</option>`;
}
async function ftthSubmitTaskConnect() {
  const st = _ftthTaskConnState;
  const msg = document.getElementById("ftthTaskMsg");
  const body = {
    taskId: st.taskId,
    deviceUsername: (document.getElementById("tcUser")?.value || "").trim(),
    devicePassword: document.getElementById("tcPass")?.value || "",
    pointSupplyNumber: (document.getElementById("tcSupply")?.value || "0").trim() || "0",
    deviceSerial: (document.getElementById("tcSerial")?.value || "").trim().toUpperCase(),
    fat: document.getElementById("tcFat")?.value || "",
    fdt: document.getElementById("tcFdt")?.value || "",
    ontVendor: document.getElementById("tcVend")?.value || "",
    installationCode: (document.getElementById("tcCode")?.value || "").trim()
  };
  if (!body.deviceUsername || !body.devicePassword || !body.deviceSerial || !body.fdt || !body.fat) {
    if (msg) { msg.style.display = "block"; msg.style.color = "#FCA5A5"; msg.textContent = "أكمل جميع الحقول المطلوبة (اليوزر، كلمة المرور، السيريال، FDT، FAT)"; }
    return;
  }
  const btn = document.getElementById("tcSubmitBtn");
  if (btn) btn.disabled = true;
  if (msg) { msg.style.display = "block"; msg.style.color = "#38BDF8"; msg.textContent = "جاري إرسال بيانات الربط..."; }
  const r = await ftthApiPostJson("tasks/customer-connections", body);
  if (btn) btn.disabled = false;
  if (r.ok) {
    if (msg) { msg.style.color = "#4ADE80"; msg.textContent = "✓ تم إكمال مهمة الربط وتفعيل الجهاز بنجاح!"; }
    refreshAll();
  } else {
    if (msg) { msg.style.color = "#FCA5A5"; msg.textContent = ftthExtractErr(r, "فشل إكمال الربط"); }
  }
}

async function openFtthTicketsModal() {
  openFtthSheet("تذاكر الدعم الفني (FTTH)", "", `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب التذاكر...</div>`);
  const r = await ftthApiGet("support/tickets?pageSize=40&pageNumber=1&sortCriteria.property=createdAt&sortCriteria.direction=desc&hierarchyLevel=0");
  const items = (r.ok && r.json && Array.isArray(r.json.items)) ? r.json.items : [];
  const body = document.getElementById("ftthModalBody");
  if (!items.length) { body.innerHTML = `<div class="box" style="text-align:center;color:#94A3B8">لا توجد تذاكر دعم حالياً.</div>`; return; }
  body.innerHTML = items.map(o => `<div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b>${escHtml((o.self && o.self.displayValue) || "تذكرة دعم")}</b>
      <span class="st-badge st-act">${escHtml(o.status || "—")}</span>
    </div>
    <div class="meta" style="margin-top:4px">${escHtml((o.customer && o.customer.displayValue) || "—")} • ${escHtml((o.zone && o.zone.displayValue) || "—")}</div>
    ${o.summary ? `<div style="font-size:12px;color:#CBD5E1;margin-top:4px">${escHtml(o.summary)}</div>` : ""}
    <div style="font-size:11px;color:#64748B;margin-top:4px" dir="ltr">${escHtml(o.displayId || "")} • ${normalizeIsoDate(o.createdAt)}</div>
  </div>`).join("");
}

async function openFtthRequestsModal() {
  openFtthSheet("الطلبات وملخص المهام (FTTH)", "", `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب الطلبات...</div>`);
  const [rTasks, rReqs] = await Promise.all([
    ftthApiGet("tasks/summary?hierarchyLevel=1"),
    ftthApiGet("requests?pageSize=40&pageNumber=1&sortCriteria.property=CreatedAt&sortCriteria.direction=desc")
  ]);
  const tm = (rTasks.ok && rTasks.json && rTasks.json.model) || {};
  const items = (rReqs.ok && rReqs.json && Array.isArray(rReqs.json.items)) ? rReqs.json.items : [];
  const body = document.getElementById("ftthModalBody");
  const sumHtml = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">
    <div class="box" style="text-align:center;margin:0"><b style="color:#38BDF8;font-size:18px">${tm.totalOpen || 0}</b><div class="meta">مفتوحة</div></div>
    <div class="box" style="text-align:center;margin:0"><b style="color:#FBBF24;font-size:18px">${tm.totalDueToday || 0}</b><div class="meta">مستحقة اليوم</div></div>
    <div class="box" style="text-align:center;margin:0"><b style="color:#4ADE80;font-size:18px">${tm.totalCompleted || 0}</b><div class="meta">مكتملة</div></div>
  </div>`;
  const listHtml = items.length ? items.map(o => `<div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b>${escHtml((o.type && o.type.displayValue) || (o.self && o.self.displayValue) || "طلب")}</b>
      <span class="st-badge st-act">${escHtml((o.status && o.status.displayValue) || "—")}</span>
    </div>
    <div class="meta" style="margin-top:4px">${escHtml((o.customer && o.customer.displayValue) || (o.partner && o.partner.displayValue) || "—")} • ${escHtml((o.zone && o.zone.displayValue) || "—")}</div>
    <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(o.createdAt)}</div>
  </div>`).join("") : `<div class="box" style="text-align:center;color:#94A3B8">لا توجد طلبات حديثة.</div>`;
  body.innerHTML = sumHtml + listHtml;
}

async function openFtthWalletModal() {
  openFtthSheet("محفظة الوكيل والحركات المالية", "", `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب الحركات المالية...</div>`);
  const accId = localStorage.getItem("ftth_account_id") || extractFtthAccountId(gs("sas4_token", ""));
  const path = accId
    ? `transactions?pageSize=40&pageNumber=1&sortCriteria.property=occuredAt&sortCriteria.direction=desc&walletType=Main&accountId=${encodeURIComponent(accId)}`
    : `transactions?pageSize=40&pageNumber=1&sortCriteria.property=occuredAt&sortCriteria.direction=desc&walletType=Main`;
  const r = await ftthApiGet(path);
  const items = (r.ok && r.json && Array.isArray(r.json.items)) ? r.json.items : [];
  const ex = ftthLastExtra;
  const hero = `<div class="box" style="border-color:#10B98155">
    <div class="ftth-kv"><span>رصيد المحفظة</span><b style="color:#4ADE80" dir="ltr">${fmtIqdNum(ex.balance, ex.currency)}</b></div>
    <div class="ftth-kv"><span>العمولة</span><b style="color:#38BDF8" dir="ltr">${fmtIqdNum(ex.commission, ex.currency)}</b></div>
    <div class="ftth-kv"><span>الائتمان المتبقي</span><b style="color:#FBBF24" dir="ltr">${fmtIqdNum(ex.remainingCredit, ex.currency)}</b></div>
    <div class="ftth-kv"><span>إيرادات الشهر</span><b style="color:#F8FAFC" dir="ltr">${fmtIqdNum(ex.monthlyRevenue, ex.currency)}</b></div>
  </div>`;
  const listHtml = items.length ? items.map(o => {
    const amt = Number((o.transactionAmount && o.transactionAmount.value) || 0);
    const rem = Number((o.remainingBalance && o.remainingBalance.value) || 0);
    const sub = o.subscription || {};
    return `<div class="box">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b>${escHtml((o.customer && o.customer.displayValue) || o.deviceUsername || o.type || "حركة مالية")}</b>
        <b dir="ltr" style="color:${amt >= 0 ? "#4ADE80" : "#F87171"}">${fmtIqdNum(amt)}</b>
      </div>
      <div class="meta" style="margin-top:4px">${escHtml(sub.displayValue || "—")} • ${escHtml(o.paymentMode || "Card")} • المتبقي: <span dir="ltr">${fmtIqdNum(rem)}</span></div>
      <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(o.occuredAt)}</div>
    </div>`;
  }).join("") : `<div class="box" style="text-align:center;color:#94A3B8">لا توجد حركات مالية حديثة.</div>`;
  document.getElementById("ftthModalBody").innerHTML = hero + listHtml;
}

async function ftthOpenHistory() {
  openFtthSheet("سجل تفعيلات وإيرادات FTTH", "خلال الشهر الحالي", `<div class="box" style="text-align:center;color:#94A3B8">جاري جلب السجل...</div>`);
  const [fromGmt, toGmt] = ftthMonthRangeGmt();
  const r = await ftthApiGet(`transactions/revenue?pageSize=50&pageNumber=1&sortCriteria.property=occuredAt&sortCriteria.direction=desc&createdAt.from=${encodeURIComponent(fromGmt)}&createdAt.to=${encodeURIComponent(toGmt)}`);
  const items = (r.ok && r.json && Array.isArray(r.json.items)) ? r.json.items : [];
  const body = document.getElementById("ftthModalBody");
  if (!items.length) { body.innerHTML = `<div class="box" style="text-align:center;color:#94A3B8">لا توجد تفعيلات حديثة هذا الشهر.</div>`; return; }
  body.innerHTML = items.map(o => {
    const amt = Number((o.transactionAmount && o.transactionAmount.value) || 0);
    const sub = o.subscription || {};
    return `<div class="box">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <b style="color:#38BDF8">${escHtml((o.customer && o.customer.displayValue) || o.deviceUsername || "—")}</b>
        <b dir="ltr" style="color:#4ADE80">${fmtIqdNum(amt)}</b>
      </div>
      <div class="meta" style="margin-top:4px">${escHtml(sub.displayValue || "—")} • ${escHtml(o.paymentMode || o.type || "")}</div>
      <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(o.occuredAt)} → ${normalizeIsoDate(sub.endsAt)}</div>
    </div>`;
  }).join("");
}

async function openFtthNotifModal() {
  openFtthSheet("الإشعارات وإعلانات FTTH", "", `<div class="box" style="text-align:center;color:#94A3B8">جاري التحميل...</div>`);
  const [rNotif, rLat, rAnn] = await Promise.all([
    ftthApiGet("notifications?onlyUnreadNotifications=false&pageSize=25&pageNumber=1"),
    ftthApiGet("announcements/latest"),
    ftthApiGet("announcements?isPinned=false&pageSize=15&pageNumber=1")
  ]);
  const notifs = (rNotif.ok && rNotif.json && Array.isArray(rNotif.json.items)) ? rNotif.json.items : [];
  const seenA = new Set(), anns = [];
  [rLat, rAnn].forEach(r => {
    if (r.ok && r.json && Array.isArray(r.json.items)) {
      r.json.items.forEach(o => {
        const id = String(o.id || Math.random());
        if (!seenA.has(id)) { seenA.add(id); anns.push(o); }
      });
    }
  });
  const nHtml = notifs.length ? notifs.map(o => `<div class="box" style="border-color:${o.isRead ? "#1E293B" : "#38BDF866"}">
    <b>${escHtml((o.self && o.self.displayValue) || "إشعار")}</b>
    <div class="meta" style="margin-top:4px">${escHtml((o.description || "").replace(/<[^>]+>/g, " "))}</div>
    <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(o.createdAt)}</div>
  </div>`).join("") : `<div class="meta">لا توجد إشعارات.</div>`;

  const aHtml = anns.length ? anns.map(o => `<div class="box" style="border-color:#F59E0B55">
    <b style="color:#FBBF24">📢 ${escHtml(o.title || "إعلان")}</b>
    <div class="meta" style="margin-top:4px">${escHtml((o.body || "").replace(/<[^>]+>/g, " "))}</div>
    <div style="font-size:11px;color:#64748B;margin-top:3px" dir="ltr">${normalizeIsoDate(o.publishedAt)}</div>
  </div>`).join("") : `<div class="meta">لا توجد إعلانات.</div>`;

  document.getElementById("ftthModalBody").innerHTML = `
    <div class="ftth-sec-hd">🔔 الإشعارات (${notifs.length})</div>${nHtml}
    <div class="ftth-sec-hd" style="margin-top:14px">📢 الإعلانات (${anns.length})</div>${aHtml}
  `;
}
