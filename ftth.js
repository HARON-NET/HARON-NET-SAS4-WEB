// ============================================================================
// HARON NET SAS4 WEB — Multi-Portal SAS4 Discovery + Full FTTH + Saved Pages
// ============================================================================
const FTTH_ORIGIN = "https://admin.ftth.iq";
const FTTH_CLIENT_APP = "53d57a7f-3f89-4e9d-873b-3d071bc6dd9f";
const FTTH_USER_ROLE = "0";
const ftthTrafficSnaps = {};
const ftthSubIdMap = {};
const ftthZoneMap = {};
let ftthLastExtra = {};

function getPortalType() {
  return localStorage.getItem("sas4_portal_type") || "sas4";
}
function isFtthMode() {
  return getPortalType() === "ftth";
}
function isFtthUrl(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s.includes("ftth.iq") || s === "ftth" || s.includes("earthlink");
}
function normalizeFtthBase(raw) {
  let s = String(raw || "").trim();
  if (!s || s.toLowerCase() === "ftth") return FTTH_ORIGIN + "/api";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return "https://" + u.host + "/api";
  } catch (_) {
    return FTTH_ORIGIN + "/api";
  }
}

// ============================================================================
// 1) مكتشف روابط SAS4 الشامل (مطابق لـ Sas4Repository.kt)
// ============================================================================
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
  const seen = new Set();
  const out = [];
  const add = (ep, base) => {
    if (!seen.has(ep)) {
      seen.add(ep);
      out.push([ep, base.replace(/\/+$/, "")]);
    }
  };

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

// ============================================================================
// 2) مدير الصفحات المحفوظة (SAS4 + FTTH)
// ============================================================================
function extractHostLabel(url) {
  try {
    const clean = /^https?:\/\//i.test(url) ? url : "https://" + url;
    return new URL(clean).host;
  } catch (_) {
    return String(url || "").replace(/^https?:\/\//i, "").split("/")[0] || "صفحة";
  }
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
    id,
    label: (portalType === "ftth" ? "FTTH • " : "") + host,
    loginUrl: cleanUrl,
    apiBase: apiBase || "",
    username: cleanUser,
    password: password || "",
    portalType: portalType || (isFtthUrl(cleanUrl) ? "ftth" : "sas4"),
    ts: Date.now()
  });
  localStorage.setItem("sas4_saved_pages", JSON.stringify(list.slice(0, 15)));
  renderSavedPagesUI();
}

function removeSavedPage(id, ev) {
  if (ev) ev.stopPropagation();
  const list = getSavedPages().filter(x => x.id !== id);
  localStorage.setItem("sas4_saved_pages", JSON.stringify(list));
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
  ss("sas4_user", item.username);
  ss("sas4_pass", item.password);
  ss("sas4_login_url", item.loginUrl);
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
  const containers = [
    document.getElementById("savedPagesLoginBox"),
    document.getElementById("savedPagesSettingsBox")
  ].filter(Boolean);
  containers.forEach(box => {
    if (!list.length) { box.innerHTML = ""; return; }
    box.innerHTML = `<div style="font-size:12px;color:#94A3B8;margin:8px 0 6px">الصفحات المحفوظة (تبديل سريع):</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:6px">` +
      list.map(p => {
        const isF = p.portalType === "ftth";
        const bCol = isF ? "#34D399" : "#38BDF8";
        return `<div onclick="switchToSavedPage('${p.id.replace(/'/g, "\\'")}')" style="display:inline-flex;align-items:center;gap:6px;background:#0F172A;border:1px solid ${bCol}55;border-radius:10px;padding:6px 10px;font-size:12px;cursor:pointer">
          <span style="color:${bCol};font-weight:700">${isF ? "FTTH" : "SAS4"}</span>
          <span style="color:#E2E8F0" dir="ltr">${p.username}</span>
          <span style="color:#64748B;font-size:11px" dir="ltr">${extractHostLabel(p.loginUrl)}</span>
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

// ============================================================================
// 3) دوال FTTH (JWT + Proxy + Metrics + Subscribers + Live Sessions)
// ============================================================================
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
  if (!iso) return "—";
  return String(iso).replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "").slice(0, 19);
}

function computeDaysLeftFromIso(iso) {
  if (!iso || iso === "—") return 0;
  const t = Date.parse(String(iso).replace(" ", "T"));
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 86400000));
}

async function ftthProxyFetch(method, targetUrl, headersExtra = {}, body = null) {
  const proxy = gs("sas4_proxy", "https://flat-flower-e68bsas4-proxy.haronmardin.workers.dev").trim().replace(/\/+$/, "");
  const h = Object.assign({
    "Accept": "application/json, text/plain, */*",
    "X-Target-Url": targetUrl,
    "X-Client-App": FTTH_CLIENT_APP,
    "X-User-Role": FTTH_USER_ROLE
  }, headersExtra);
  const res = await fetch(proxy + "/proxy", { method, headers: h, body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { ok: res.ok, status: res.status, text, json };
}

async function ftthRefreshAccessToken() {
  const rt = localStorage.getItem("ftth_refresh_token") || "";
  if (!rt) return false;
  const base = normalizeFtthBase(gs("sas4_login_url", FTTH_ORIGIN));
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    scope: "openid profile",
    refresh_token: rt,
    client_id: ""
  }).toString();
  const r = await ftthProxyFetch("POST", base + "/auth/Contractor/token", {
    "Content-Type": "application/x-www-form-urlencoded"
  }, form);
  if (r.ok && r.json && r.json.access_token) {
    const at = r.json.access_token.trim();
    const nrt = (r.json.refresh_token || rt).trim();
    ss("sas4_token", at);
    localStorage.setItem("ftth_refresh_token", nrt);
    const accId = extractFtthAccountId(at);
    if (accId) localStorage.setItem("ftth_account_id", accId);
    return true;
  }
  return false;
}

async function ftthApiGet(path, retryAuth = true) {
  let tok = gs("sas4_token", "");
  if (!tok || isFtthJwtExpiring(tok, 120)) {
    const okRef = await ftthRefreshAccessToken();
    if (okRef) tok = gs("sas4_token", "");
  }
  if (!tok) return { ok: false, status: 401, json: null, text: "No FTTH token" };
  const base = normalizeFtthBase(gs("sas4_login_url", FTTH_ORIGIN));
  const fullUrl = /^https?:\/\//i.test(path) ? path : (base + "/" + path.replace(/^\/+/, ""));
  const r = await ftthProxyFetch("GET", fullUrl, { "Authorization": "Bearer " + tok });
  if (r.status === 401 && retryAuth) {
    if (await ftthRefreshAccessToken()) return ftthApiGet(path, false);
  }
  if (r.ok && Array.isArray(r.json)) {
    r.json = { items: r.json };
  }
  return r;
}

async function ftthLogin(lurl, user, pass, silent = false) {
  const cleanUrl = (lurl || FTTH_ORIGIN).trim();
  const base = normalizeFtthBase(cleanUrl);
  const manualTok = (document.getElementById("ftthManualToken")?.value || "").trim().replace(/^Bearer\s+/i, "");

  if (manualTok && manualTok.split(".").length >= 2) {
    const accId = extractFtthAccountId(manualTok);
    localStorage.setItem("sas4_portal_type", "ftth");
    ss("sas4_token", manualTok);
    ss("sas4_api_base", base);
    if (accId) localStorage.setItem("ftth_account_id", accId);
    upsertSavedPage(cleanUrl, base, user || "FTTH", pass, "ftth");
    updatePortalBrandBadge();
    return { ok: true, msg: "تم تفعيل جلسة FTTH بالتوكن بنجاح" };
  }

  // محاولة تجديد الجلسة المحفوظة أولاً إن كانت لنفس الحساب
  if (localStorage.getItem("ftth_refresh_token") && gs("sas4_user") === user) {
    if (await ftthRefreshAccessToken()) {
      localStorage.setItem("sas4_portal_type", "ftth");
      ss("sas4_api_base", base);
      upsertSavedPage(cleanUrl, base, user, pass, "ftth");
      updatePortalBrandBadge();
      return { ok: true, msg: "تم استعادة جلسة FTTH" };
    }
  }

  if (!user || !pass) {
    return { ok: false, msg: "أدخل اسم المستخدم وكلمة المرور لـ FTTH (أو الصق التوكن)." };
  }

  const attempts = [
    [base + "/auth/Contractor/token", ""],
    [base + "/auth/Contractor/token", "earthlink-portals"],
    ["https://sso.ftth.iq/auth/realms/Partners/protocol/openid-connect/token", "earthlink-portals"]
  ];

  let lastErr = "تعذر تسجيل الدخول لبوابة FTTH";
  for (const [ep, cid] of attempts) {
    const form = new URLSearchParams({
      grant_type: "password",
      scope: "openid profile",
      username: user,
      password: pass,
      client_id: cid
    }).toString();
    try {
      const r = await ftthProxyFetch("POST", ep, {
        "Content-Type": "application/x-www-form-urlencoded"
      }, form);
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
    } catch (e) {
      lastErr = e.message || lastErr;
    }
  }
  return { ok: false, msg: lastErr };
}

function updatePortalBrandBadge() {
  const bt = document.querySelector(".brand-title");
  if (bt) {
    bt.textContent = isFtthMode() ? "HARON NET • FTTH" : "HARON NET • SAS4";
  }
}

async function ftthLoadMetrics() {
  const accId = localStorage.getItem("ftth_account_id") || extractFtthAccountId(gs("sas4_token", ""));
  const [rDash, rWal, rCust] = await Promise.all([
    ftthApiGet("partners/dashboard/summary?hierarchyLevel=1"),
    accId ? ftthApiGet("partners/" + accId + "/wallets/balance") : Promise.resolve({ ok: false }),
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
  ftthLastExtra = { balance: bal, commission: comm, currency: cur };

  document.getElementById("mBalance").textContent = bal.toLocaleString("en-US") + " " + cur;
  document.getElementById("mPoints").textContent = comm.toLocaleString("en-US") + " عمولة";
  document.getElementById("mTotal").textContent = total;
  document.getElementById("mOnline").textContent = online;
  document.getElementById("mActive").textContent = active;
  document.getElementById("mOffline").textContent = Math.max(0, active - online);
  document.getElementById("mExpired").textContent = expired;
  document.getElementById("mExpiring").textContent = expiring;
}

async function ftthFetchPaginated(pathBuilder, maxPages = 25) {
  const out = [];
  let pageSize = 50;
  let first = null;
  for (const ps of [50, 25, 10]) {
    const r = await ftthApiGet(pathBuilder(ps, 1));
    if (r.ok && r.json && Array.isArray(r.json.items)) {
      pageSize = ps;
      first = r.json;
      break;
    }
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
      traffic: dnB + upB,
      dn, up
    };
  });
  return om;
}

async function ftthLoadSubs(silent = false) {
  const el = document.getElementById("subsList");
  if (!silent) el.innerHTML = '<div class="card" style="text-align:center;color:#94A3B8">جاري جلب مشتركي FTTH...</div>';
  const [actItems, expItems, om] = await Promise.all([
    ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&status=Active&hierarchyLevel=1`, 20),
    ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&status=Expired&hierarchyLevel=1`, 20),
    ftthFetchOnlineMap()
  ]);

  let combined = [...actItems, ...expItems];
  if (!combined.length) {
    combined = await ftthFetchPaginated((ps, pg) => `subscriptions?pageSize=${ps}&pageNumber=${pg}&sortCriteria.property=expires&sortCriteria.direction=asc&hierarchyLevel=1`, 20);
  }
  const seen = new Set();
  const out = [];
  combined.forEach(o => {
    const custObj = o.customer || {};
    const selfObj = o.self || {};
    const custId = Number(custObj.id || selfObj.id || 0);
    const subId = String(selfObj.id || "");
    const uniq = subId || String(custId);
    if (!custId || seen.has(uniq)) return;
    seen.add(uniq);
    if (subId) ftthSubIdMap[custId] = subId;

    const devObj = o.deviceDetails || {};
    const username = String(o.username || devObj.username || custId).trim();
    const fullName = String(custObj.displayValue || username).trim();
    const zone = (o.zone && o.zone.displayValue) || "";
    if (zone) ftthZoneMap[custId] = zone;
    const services = Array.isArray(o.services) ? o.services : [];
    const planName = (services[0] && (services[0].displayValue || services[0].id)) || (o.bundle && o.bundle.displayValue) || "FTTH";
    const isActive = String(o.status || "").toLowerCase() === "active";
    const expStr = normalizeIsoDate(o.expires);
    const lv = om[custId];
    const isOnline = !!(o.hasActiveSession || o.isOnline || o.activeSession || lv);

    out.push({
      id: custId,
      username,
      fullName,
      initial: fullName.charAt(0) || "ف",
      profile: planName,
      expiration: expStr,
      days: isActive ? computeDaysLeftFromIso(o.expires) : 0,
      isOnline,
      isActive,
      traffic: lv ? lv.traffic : 0,
      loan: 0,
      rad: lv ? lv.rad : Number(subId || 0),
      ip: (lv && lv.ip) || o.ipAddress || "",
      mac: (lv && lv.mac) || o.macAddress || "",
      nas: (lv && lv.nas) || zone,
      uptime: lv ? lv.uptime : 0,
      dn: lv ? lv.dn : 0,
      up: lv ? lv.up : 0
    });
  });

  allSubs = out;
  document.getElementById("mDebtCount").textContent = "0";
  document.getElementById("mDebtTotal").textContent = "0 IQD";
  renderList();
}

async function ftthOpenDetails(uid) {
  const s = allSubs.find(x => x.id === uid);
  document.getElementById("modalTitle").textContent = (s ? s.fullName : uid) + " (FTTH)";
  const b = document.getElementById("modalBody");
  b.textContent = "جاري جلب تفاصيل مشترك FTTH...";
  document.getElementById("detailModal").style.display = "flex";

  const [rCust, rSub] = await Promise.all([
    ftthApiGet("customers/" + uid),
    ftthSubIdMap[uid] ? ftthApiGet("subscriptions/" + ftthSubIdMap[uid]) : Promise.resolve({ ok: false })
  ]);
  const cm = (rCust.ok && rCust.json && rCust.json.model) ? rCust.json.model : {};
  const sm = (rSub.ok && rSub.json && rSub.json.model) ? rSub.json.model : {};
  const phone = cm.primaryPhone || cm.phone || (cm.contacts && cm.contacts[0] && cm.contacts[0].value) || "";
  const cleanPh = String(phone).replace(/[^0-9+]/g, "");
  const wa = cleanPh ? "https://wa.me/" + cleanPh.replace(/^0/, "964").replace(/^\+/, "") : "";
  const ontSerial = (sm.deviceDetails && sm.deviceDetails.serialNumber) || cm.ontSerial || "—";
  const zone = ftthZoneMap[uid] || (s && s.nas) || "—";

  b.innerHTML = `
    <div style="display:flex;gap:7px;margin-bottom:10px;flex-wrap:wrap">
      <button type="button" class="btn btn-sm btn-ghost" onclick="copyText('${s ? s.username : ''}', this)">نسخ اليوزر</button>
      ${cleanPh ? `<a class="btn btn-sm btn-ghost" style="text-decoration:none" href="tel:${cleanPh}">اتصال</a><a class="btn btn-sm btn-wa" style="text-decoration:none" target="_blank" href="${wa}">واتساب</a>` : ''}
    </div>
    <div class="box">
      الاسم: <b>${s ? s.fullName : '—'}</b><br>
      اليوزر: <b dir="ltr">${s ? s.username : '—'}</b> • الحالة: <b>${s && s.isOnline ? 'متصل' : (s && s.isActive ? 'فعال' : 'منتهي')}</b><br>
      الباقة: <b>${s ? s.profile : '—'}</b> • الانتهاء: <span dir="ltr">${s ? s.expiration : '—'}</span><br>
      الزون (Zone): <b>${zone}</b> • ONT: <span dir="ltr">${ontSerial}</span><br>
      IP: <span dir="ltr">${(s && s.ip) || '—'}</span> • MAC: <span dir="ltr">${(s && s.mac) || '—'}</span><br>
      مدة الاتصال: <b>${fmtUptime(s && s.uptime)}</b> • الاستهلاك: <b>${fmtBytes(s && s.traffic)}</b><br>
      الهاتف: <b dir="ltr">${phone || '—'}</b>
    </div>`;
}
