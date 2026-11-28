const LIC_PUB_SPKI = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEj0Zt28sYb358Lynxh7NpQkFuleJ7AqVQMyeQfESv2yKk7NpxBqjem/W20f/3Us1Og1P0t1i2+26J6L8i3q/uVA==";
const LIC_VENDOR_WA = "9647750149398";
const LIC_TRIAL_DAYS = 7;
const LIC_DAY_MS = 86400000;
const SYNC_INTERVAL_MS = 4 * 3600000;
const DEFAULT_LIC_WORKER = "https://flat-flower-e68bsas4-proxy.haronmardin.workers.dev";
const CLOUD_LIC_WORKER = "https://haron-sas4-lic.haronmardin.workers.dev";
const WAYL_PAY_WORKER = "https://haron-wayl-pay.haronmardin.workers.dev";
const CLOUD_SIGN_SECRET = "HaronSas4Sign2026#9981";
const EXTRA_DEVICE_IQD = 2500;

let _lastHaptic = 0;
function haptic(pattern = 22) {
  const now = Date.now();
  if (now - _lastHaptic < 45) return;
  _lastHaptic = now;
  try {
    if (navigator.vibrate) { navigator.vibrate(pattern); return; }
    const lbl = document.getElementById("iosHapticLbl");
    if (lbl) lbl.click();
  } catch (_) {}
}

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function getWebDeviceLabel() {
  const ua = navigator.userAgent || "";
  if (/iPhone/i.test(ua)) return isStandaloneApp() ? "iPhone App (PWA)" : "iPhone Web";
  if (/iPad/i.test(ua)) return "iPad Web";
  if (/Android/i.test(ua)) return isStandaloneApp() ? "Android Web App" : "Android Browser";
  if (/Macintosh|Mac OS/i.test(ua)) return "Mac Browser";
  if (/Windows/i.test(ua)) return "Windows Browser";
  return "Web Browser";
}

async function computeUniqueDeviceCode() {
  let gpu = "";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "";
    }
  } catch (_) {}
  const sw = Math.max(screen.width || 0, screen.height || 0);
  const sh = Math.min(screen.width || 0, screen.height || 0);
  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 0;
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  const rndHex = Array.from(rnd).map(b => b.toString(16).padStart(2, "0")).join("");
  const raw = [gpu, sw + "x" + sh, dpr, cores, tz, rndHex, Date.now()].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.slice(0, 4) + "-" + hex.slice(4, 8) + "-" + hex.slice(8, 12);
}

const LicVault = {
  dbName: "HARON_SAS4_VAULT",
  storeName: "kv",
  cacheName: "HARON_SAS4_CACHE_V1",
  _idbOp(mode, fn) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => finish(""), 1200);
      try {
        const req = indexedDB.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(this.storeName)) {
            req.result.createObjectStore(this.storeName);
          }
        };
        req.onsuccess = () => {
          try {
            const tx = req.result.transaction(this.storeName, mode);
            fn(tx.objectStore(this.storeName), finish);
          } catch (_) { finish(""); }
        };
        req.onerror = () => finish("");
      } catch (_) { finish(""); }
    });
  },
  _getCookie(k) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + k + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  },
  _setCookie(k, v) {
    try {
      document.cookie = `${k}=${encodeURIComponent(v)}; max-age=315360000; path=/; SameSite=Lax`;
    } catch (_) {}
  },
  async _getCache(k) {
    try {
      const cache = await caches.open(this.cacheName);
      const res = await cache.match("/__vault/" + k);
      return res ? await res.text() : "";
    } catch (_) { return ""; }
  },
  async _setCache(k, v) {
    try {
      const cache = await caches.open(this.cacheName);
      await cache.put("/__vault/" + k, new Response(String(v)));
    } catch (_) {}
  },
  async get(k) {
    let ls = "";
    try { ls = localStorage.getItem(k) || ""; } catch (_) {}
    if (ls) return ls;
    const ck = this._getCookie(k) || "";
    const idb = await this._idbOp("readonly", (st, res) => {
      const r = st.get(k);
      r.onsuccess = () => res(r.result || "");
      r.onerror = () => res("");
    });
    const cs = await this._getCache(k);
    const val = ls || idb || cs || ck || "";
    if (val) await this.set(k, val);
    return val;
  },
  async set(k, v) {
    const str = String(v ?? "");
    try { localStorage.setItem(k, str); } catch (_) {}
    this._setCookie(k, str);
    await this._idbOp("readwrite", (st, res) => {
      const r = st.put(str, k);
      r.onsuccess = () => res(true);
      r.onerror = () => res(false);
    });
    await this._setCache(k, str);
  },
  async remove(k) {
    try { localStorage.removeItem(k); } catch (_) {}
    try { document.cookie = `${k}=; max-age=0; path=/; SameSite=Lax`; } catch (_) {}
    await this._idbOp("readwrite", (st, res) => {
      const r = st.delete(k);
      r.onsuccess = () => res(true);
      r.onerror = () => res(false);
    });
    try {
      const cache = await caches.open(this.cacheName);
      await cache.delete("/__vault/" + k);
    } catch (_) {}
  }
};

const Sas4License = (() => {
  const appTag = "sas4";
  const hwKey = "lic_ios_device_id_v3";
  const clockKey = "lic_clock_state_v3";
  const legacyLicKey = "lic_saved_key_v3";
  const cloudTokKey = "lic_cloud_token_v2";
  const cloudPhoneKey = "lic_cloud_phone_v2";
  const cloudNameKey = "lic_cloud_name_v2";
  const cloudKeyStore = "lic_cloud_key_v2";
  const cloudMetaKey = "lic_cloud_meta_v2";
  const cloudSyncTsKey = "lic_cloud_sync_ts_v2";
  const pendingOrderKey = "lic_wayl_pending_v2";
  const te = new TextEncoder();

  function normalizePhone(raw) {
    let s = "";
    for (const ch of String(raw || "")) {
      const c = ch.charCodeAt(0);
      if (c >= 0x0660 && c <= 0x0669) s += String(c - 0x0660);
      else if (c >= 0x06F0 && c <= 0x06F9) s += String(c - 0x06F0);
      else if (c >= 48 && c <= 57) s += ch;
    }
    if (s.startsWith("00964")) s = "0" + s.slice(5);
    else if (s.startsWith("964") && s.length >= 12) s = "0" + s.slice(3);
    else if (s.startsWith("7") && s.length === 10) s = "0" + s;
    return s;
  }

  function normalizeKey(raw) {
    let s = "";
    for (const ch of String(raw || "").trim()) {
      const c = ch.charCodeAt(0);
      let outCh = ch.toUpperCase();
      if (c >= 0x0660 && c <= 0x0669) outCh = String(c - 0x0660);
      else if (c >= 0x06F0 && c <= 0x06F9) outCh = String(c - 0x06F0);
      if ((outCh >= "A" && outCh <= "Z") || (outCh >= "0" && outCh <= "9") || outCh === "-") s += outCh;
    }
    return s;
  }

  function basePriceIqd(months) {
    if (months === 3) return 25000;
    if (months === 6) return 35000;
    if (months === 12) return 50000;
    return 15000;
  }

  function calculatePriceIqd(months, devices) {
    const d = Math.max(1, Math.min(10, Number(devices || 1)));
    return basePriceIqd(Number(months || 1)) + (d - 1) * EXTRA_DEVICE_IQD;
  }

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function bytesToB64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64UrlToBytes(input) {
    let b64 = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function hmacHex(secret, data) {
    const key = await crypto.subtle.importKey("raw", te.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, te.encode(data));
    return bufToHex(sig);
  }

  async function deviceCode() {
    let code = await LicVault.get(hwKey);
    if (!code) {
      code = await computeUniqueDeviceCode();
      await LicVault.set(hwKey, code);
    }
    return code;
  }

  async function monotonicClock(dev) {
    const now = Date.now();
    let start = Infinity, last = 0;
    const raw = await LicVault.get(clockKey);
    if (raw) {
      const parts = raw.trim().split(":");
      if (parts.length === 3) {
        const st = Number(parts[0]), ls = Number(parts[1]);
        const exp = await hmacHex(dev, `${appTag}|${dev}|${st}|${ls}`);
        if (exp === parts[2] && Number.isFinite(st) && Number.isFinite(ls)) {
          start = Math.min(start, st);
          last = Math.max(last, ls);
        }
      }
    }
    if (!Number.isFinite(start)) start = now;
    const eff = Math.max(now, last);
    const sig = await hmacHex(dev, `${appTag}|${dev}|${start}|${eff}`);
    await LicVault.set(clockKey, `${start}:${eff}:${sig}`);
    return { start, now: eff };
  }

  function daysBetween(nowMs, ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
    if (!m) return -999;
    const exp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    const dNow = new Date(nowMs);
    const today = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate(), 0, 0, 0, 0);
    return Math.round((exp.getTime() - today.getTime()) / LIC_DAY_MS);
  }

  async function verifyCloudToken(rawToken, dev) {
    if (!rawToken) return null;
    try {
      const parts = String(rawToken).trim().split(".");
      if (parts.length !== 2) return null;
      const [payloadB64, sigB64] = parts;
      const key = await crypto.subtle.importKey("raw", te.encode(CLOUD_SIGN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sigBuf = await crypto.subtle.sign("HMAC", key, te.encode(payloadB64));
      const expectedSig = bytesToB64Url(new Uint8Array(sigBuf));
      if (expectedSig !== sigB64) return null;
      const o = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadB64)));
      if (Number(o.v) !== 2) return null;
      if (o.app !== appTag) return null;
      if (String(o.deviceId || "").toLowerCase() !== String(dev || "").toLowerCase()) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(o.expiry || ""))) return null;
      return o;
    } catch (_) {
      return null;
    }
  }

  function derToP1363(der) {
    let off = 2;
    if (der[off++] !== 0x02) throw new Error("bad der");
    const rLen = der[off++];
    let r = der.slice(off, off + rLen); off += rLen;
    if (der[off++] !== 0x02) throw new Error("bad der");
    const sLen = der[off++];
    let s = der.slice(off, off + sLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    const out = new Uint8Array(64);
    out.set(r, 32 - r.length);
    out.set(s, 64 - s.length);
    return out;
  }

  async function verifyLegacyV1(raw, dev) {
    try {
      const cleaned = String(raw || "").replace(/\s+/g, "");
      const parts = cleaned.split(".");
      if (parts.length !== 2) return { ok: false, err: "صيغة المفتاح غير صالحة" };
      const payloadBytes = b64UrlToBytes(parts[0]);
      const sigP1363 = derToP1363(b64UrlToBytes(parts[1]));
      const spkiBin = atob(LIC_PUB_SPKI);
      const spki = new Uint8Array(spkiBin.length);
      for (let i = 0; i < spkiBin.length; i++) spki[i] = spkiBin.charCodeAt(i);
      const pubKey = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sigP1363, payloadBytes);
      if (!valid) return { ok: false, err: "التوقيع غير صالح" };
      const obj = JSON.parse(new TextDecoder().decode(payloadBytes));
      if (Number(obj.v) !== 1) return { ok: false, err: "إصدار مفتاح غير مدعوم" };
      if (String(obj.d || "").toLowerCase() !== String(dev || "").toLowerCase()) {
        return { ok: false, err: "هذا المفتاح مخصص لجهاز آخر" };
      }
      return { ok: true, payload: obj };
    } catch (_) {
      return { ok: false, err: "تعذر التحقق من المفتاح" };
    }
  }

  async function getSavedCloudInfo() {
    const phone = await LicVault.get(cloudPhoneKey);
    const name = await LicVault.get(cloudNameKey);
    const key = await LicVault.get(cloudKeyStore);
    let meta = {};
    try { meta = JSON.parse((await LicVault.get(cloudMetaKey)) || "{}"); } catch (_) {}
    return { phone, name, key, meta };
  }

  async function saveCloudState(token, phone, name, key, activeDevices, maxDevices) {
    if (token) await LicVault.set(cloudTokKey, token);
    if (phone) await LicVault.set(cloudPhoneKey, phone);
    if (name) await LicVault.set(cloudNameKey, name);
    if (key !== undefined && key !== null) await LicVault.set(cloudKeyStore, key);
    await LicVault.set(cloudMetaKey, JSON.stringify({
      activeDevices: Number(activeDevices || 1),
      maxDevices: Number(maxDevices || 2),
      updatedAt: Date.now()
    }));
    await LicVault.set(cloudSyncTsKey, String(Date.now()));
  }

  async function status() {
    const dev = await deviceCode();
    const { start, now } = await monotonicClock(dev);
    const info = await getSavedCloudInfo();

    // 1) التحقق من الاشتراك السحابي أولاً
    const rawCloudTok = await LicVault.get(cloudTokKey);
    if (rawCloudTok) {
      const cp = await verifyCloudToken(rawCloudTok, dev);
      if (cp) {
        const isTrial = !!cp.isTrial;
        const phone = cp.phone || info.phone || "";
        const name = cp.name || info.name || phone || "مستخدم سحابي";
        const exp = cp.expiry;
        const left = daysBetween(now, exp);
        const maxDev = Number(cp.maxDevices || info.meta.maxDevices || (isTrial ? 1 : 2));
        const actDev = Number(info.meta.activeDevices || 1);
        const allowed = left >= 0;
        const state = allowed ? (isTrial ? "trial" : "licensed") : "expired";
        const summary = allowed
          ? (isTrial
              ? `تجربة سحابية باسم ${name} (${phone}) حتى ${exp} • متبقي ${left} يوم`
              : `اشتراك سحابي مفعّل باسم ${name} (${phone}) حتى ${exp} • متبقي ${left} يوم • الأجهزة ${actDev}/${maxDev}`)
          : (isTrial
              ? `انتهت التجربة السحابية (${phone}) بتاريخ ${exp}`
              : `انتهى الاشتراك السحابي (${phone}) بتاريخ ${exp}`);
        return {
          state, allowed, licensed: !isTrial && allowed, cloud: true, isTrial,
          phone, name, key: info.key, expiry: exp, daysLeft: Math.max(0, left),
          maxDevices: maxDev, activeDevices: actDev, device: dev, summary
        };
      }
    }

    // 2) التوافق مع المفاتيح القديمة V1
    const legacySaved = await LicVault.get(legacyLicKey);
    if (legacySaved) {
      const res = await verifyLegacyV1(legacySaved, dev);
      if (res.ok) {
        const exp = res.payload.e;
        const left = daysBetween(now, exp);
        const name = res.payload.n || "HARON NET SAS4";
        const allowed = left >= 0;
        return {
          state: allowed ? "licensed" : "expired",
          allowed, licensed: allowed, cloud: false, isTrial: false,
          phone: info.phone, name, key: "", expiry: exp, daysLeft: Math.max(0, left),
          maxDevices: 1, activeDevices: 1, device: dev,
          summary: allowed
            ? `مفعّل باسم ${name} حتى ${exp} • متبقي ${left} يوم`
            : `انتهى الاشتراك بتاريخ ${exp}`
        };
      }
    }

    // 3) الفترة التجريبية المحلية (7 أيام) كخيار افتراضي قبل التسجيل السحابي
    const end = start + LIC_TRIAL_DAYS * LIC_DAY_MS;
    const left = Math.ceil((end - now) / LIC_DAY_MS);
    if (left > 0) {
      return {
        state: "trial", allowed: true, licensed: false, cloud: false, isTrial: true,
        phone: info.phone, name: info.name, key: info.key, expiry: "", daysLeft: left,
        maxDevices: 1, activeDevices: 1, device: dev,
        summary: `نسخة تجريبية مجانية • متبقي ${left} يوم من أصل ${LIC_TRIAL_DAYS} أيام`
      };
    }

    return {
      state: "expired", allowed: false, licensed: false, cloud: false, isTrial: false,
      phone: info.phone, name: info.name, key: info.key, expiry: "", daysLeft: 0,
      maxDevices: 1, activeDevices: 1, device: dev,
      summary: "انتهت الفترة التجريبية — فعّل اشتراكك السحابي للمتابعة"
    };
  }

  async function executeCloudVerify(endpoint, rawPhone, rawKey, forceReplace = false) {
    const dev = await deviceCode();
    const phone = normalizePhone(rawPhone);
    const key = normalizeKey(rawKey);
    if (phone.length < 10) return { ok: false, code: "BAD_PHONE", message: "أدخل رقم موبايل عراقي صحيح (مثال: 077xxxxxxxx)" };
    if (endpoint === "/api/activate" && key.length < 4) return { ok: false, code: "BAD_KEY", message: "أدخل مفتاح الاشتراك السحابي" };

    try {
      const r = await fetch(CLOUD_LIC_WORKER + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          key,
          deviceId: dev,
          deviceName: getWebDeviceLabel(),
          forceReplace: !!forceReplace
        })
      });
      const resp = await r.json().catch(() => ({}));
      if (resp.ok && resp.token) {
        const parsed = await verifyCloudToken(resp.token, dev);
        if (!parsed) return { ok: false, code: "BAD_TOKEN", message: "تعذر التحقق من توقيع التوكن السحابي" };
        const actDev = Number(resp.activeDevices || 1);
        const maxDev = Number(resp.maxDevices || parsed.maxDevices || (parsed.isTrial ? 1 : 2));
        const holderName = parsed.name || (await LicVault.get(cloudNameKey)) || phone;
        await saveCloudState(resp.token, phone, holderName, key || parsed.key || "", actDev, maxDev);
        return {
          ok: true,
          code: "OK",
          message: `تم تفعيل الاشتراك السحابي بنجاح حتى ${parsed.expiry}`,
          activeDevices: actDev,
          maxDevices: maxDev
        };
      }
      const errCode = resp.code || "ERROR";
      const errMsg = resp.error || "تعذر تفعيل الاشتراك السحابي";
      if (["SUSPENDED", "EXPIRED", "TRIAL_EXPIRED", "NOT_FOUND", "WRONG_KEY", "DEVICE_LIMIT"].includes(errCode)) {
        await LicVault.remove(cloudTokKey);
      }
      if (errCode === "DEVICE_LIMIT") {
        const names = Array.isArray(resp.devices) ? resp.devices.map(d => d && d.name).filter(Boolean) : [];
        return {
          ok: false,
          code: errCode,
          message: errMsg,
          deviceLimitReached: true,
          activeDevices: Number(resp.activeDevices || 2),
          maxDevices: Number(resp.maxDevices || 2),
          devicesSummary: names.join(" ، ")
        };
      }
      return { ok: false, code: errCode, message: errMsg };
    } catch (_) {
      return { ok: false, code: "NETWORK_ERROR", message: "تعذر الاتصال بسيرفر الاشتراك السحابي، تأكد من الإنترنت" };
    }
  }

  async function activateCloud(phone, key, forceReplace = false) {
    return executeCloudVerify("/api/activate", phone, key, forceReplace);
  }

  async function registerTrial(rawName, rawPhone) {
    const dev = await deviceCode();
    const name = String(rawName || "").trim();
    const phone = normalizePhone(rawPhone);
    if (name.length < 2) return { ok: false, message: "أدخل الاسم الكامل" };
    if (phone.length < 10) return { ok: false, message: "أدخل رقم موبايل صحيح" };
    try {
      const r = await fetch(CLOUD_LIC_WORKER + "/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          deviceId: dev,
          deviceName: getWebDeviceLabel()
        })
      });
      const resp = await r.json().catch(() => ({}));
      if (resp.ok && resp.token) {
        const parsed = await verifyCloudToken(resp.token, dev);
        if (!parsed) return { ok: false, message: "توكن التجربة غير صالح" };
        await saveCloudState(resp.token, phone, name, "", 1, 1);
        return { ok: true, message: `تم تفعيل التجربة السحابية حتى ${parsed.expiry}` };
      }
      return { ok: false, message: resp.error || "تعذر بدء التجربة المجانية السحابية" };
    } catch (_) {
      return { ok: false, message: "تعذر الاتصال بالسحابة" };
    }
  }

  async function syncInBackground(force = false) {
    try {
      const rawTok = await LicVault.get(cloudTokKey);
      if (!rawTok) return;
      const lastTs = Number((await LicVault.get(cloudSyncTsKey)) || 0);
      if (!force && Date.now() - lastTs < SYNC_INTERVAL_MS) return;
      const info = await getSavedCloudInfo();
      if (!info.phone) return;
      const dev = await deviceCode();
      const parsed = await verifyCloudToken(rawTok, dev);
      const isTrial = !!(parsed && parsed.isTrial);
      const ep = (isTrial && (!info.key || info.key.length < 6)) ? "/api/verify" : "/api/activate";
      await executeCloudVerify(ep, info.phone, info.key || "", false);
    } catch (_) {}
  }

  async function activate(rawKey, rawPhone = "", forceReplace = false) {
    const trimmed = String(rawKey || "").trim();
    if (trimmed.includes(".") && trimmed.length > 60) {
      const dev = await deviceCode();
      const chk = await verifyLegacyV1(trimmed, dev);
      if (!chk.ok) return { ok: false, message: chk.err };
      await LicVault.set(legacyLicKey, trimmed.replace(/\s+/g, ""));
      return { ok: true, message: `تم التفعيل حتى ${chk.payload.e}` };
    }
    return activateCloud(rawPhone, trimmed, forceReplace);
  }

  async function createWaylOrder(rawPhone, rawName, months, devices) {
    const phone = normalizePhone(rawPhone);
    if (phone.length < 10) return { ok: false, error: "أدخل رقم موبايل صحيح للدفع" };
    const name = String(rawName || "").trim() || (await LicVault.get(cloudNameKey)) || phone;
    try {
      const r = await fetch(WAYL_PAY_WORKER + "/api/pay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name, months: Number(months), devices: Number(devices) })
      });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.paymentUrl && j.orderId) {
        try { localStorage.setItem(pendingOrderKey, JSON.stringify({ orderId: j.orderId, phone })); } catch (_) {}
        return { ok: true, orderId: j.orderId, paymentUrl: j.paymentUrl, amountIqd: j.amountIqd || calculatePriceIqd(months, devices) };
      }
      return { ok: false, error: j.error || `تعذر إنشاء رابط الدفع (${r.status})` };
    } catch (_) {
      return { ok: false, error: "تعذر الاتصال ببوابة الدفع الإلكتروني" };
    }
  }

  async function checkWaylOrderStatus(orderId, rawPhone) {
    const phone = normalizePhone(rawPhone);
    const qs = `orderId=${encodeURIComponent(orderId)}` + (phone ? `&phone=${encodeURIComponent(phone)}` : "");
    try {
      const r = await fetch(`${WAYL_PAY_WORKER}/api/pay/status?${qs}`);
      const j = await r.json().catch(() => ({}));
      if (j.ok) {
        const st = String(j.status || "PENDING").toUpperCase();
        if (st === "PAID" || j.licenseKey) {
          try { localStorage.removeItem(pendingOrderKey); } catch (_) {}
        }
        return {
          ok: true,
          status: st,
          orderId: j.orderId || orderId,
          phone: j.phone || phone,
          licenseKey: j.licenseKey || "",
          expiry: j.expiry || j.expiresAt || "",
          maxDevices: Number(j.maxDevices || 1),
          daysLeft: Number(j.daysLeft || 0)
        };
      }
      return { ok: false, error: j.error || `تعذر فحص حالة الدفع (${r.status})` };
    } catch (_) {
      return { ok: false, error: "تعذر الاتصال بسيرفر فحص الدفع" };
    }
  }

  function getPendingPayOrder() {
    try {
      const raw = localStorage.getItem(pendingOrderKey);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  return {
    status, activate, activateCloud, registerTrial, syncInBackground,
    normalizePhone, normalizeKey, basePriceIqd, calculatePriceIqd,
    createWaylOrder, checkWaylOrderStatus, getPendingPayOrder,
    vendorWhatsApp: LIC_VENDOR_WA
  };
})();

let currentLicStatus = null, licAllowClose = true;
let paySelMonths = 1, paySelDevices = 1;

async function openSettingsModal() {
  const st = await Sas4License.status();
  currentLicStatus = st;
  const sumEl = document.getElementById("setLicSummary");
  if (sumEl) sumEl.textContent = st.summary;
  const setL = document.getElementById("setLoginUrl");
  const setP = document.getElementById("setProxyUrl");
  const setU = document.getElementById("setUser");
  const setPw = document.getElementById("setPass");
  if (setL) setL.value = gs("sas4_login_url", "https://reseller.nbtel.iq/api.php?action=login");
  if (setP) setP.value = gs("sas4_proxy", DEFAULT_LIC_WORKER);
  if (setU) setU.value = gs("sas4_user", "");
  if (setPw) setPw.value = gs("sas4_pass", "");
  if (typeof renderSavedPagesUI === "function") renderSavedPagesUI();
  const sm = document.getElementById("settingsModal");
  if (sm) sm.style.display = "flex";
}

function saveSettingsAndConnect() {
  const lurl = (document.getElementById("setLoginUrl")?.value || "").trim();
  const purl = (document.getElementById("setProxyUrl")?.value || DEFAULT_LIC_WORKER).trim().replace(/\/+$/, "");
  const u = (document.getElementById("setUser")?.value || "").trim();
  const p = document.getElementById("setPass")?.value || "";
  ss("sas4_login_url", lurl); ss("sas4_proxy", purl); ss("sas4_user", u); ss("sas4_pass", p);
  const elL = document.getElementById("loginUrl"), elP = document.getElementById("proxyUrl");
  const elU = document.getElementById("username"), elPw = document.getElementById("password");
  if (elL) elL.value = lurl;
  if (elP) elP.value = purl;
  if (elU) elU.value = u;
  if (elPw) elPw.value = p;
  document.getElementById("settingsModal").style.display = "none";
  if (typeof doLogin === "function") doLogin(false);
}

function clearSavedSettings() {
  ["sas4_user", "sas4_pass", "sas4_token", "ftth_refresh_token"].forEach(k => localStorage.removeItem(k));
  const m = document.getElementById("setMsg");
  if (m) { m.style.display = "block"; m.textContent = "تم مسح بيانات الدخول المحفوظة."; }
}

function setLicFeedback(txt, color = "#94A3B8") {
  const fb = document.getElementById("licFeedback");
  if (fb) {
    fb.style.display = txt ? "block" : "none";
    fb.style.color = color;
    fb.textContent = txt || "";
  }
}

async function openLicenseModal(allowClose = true) {
  licAllowClose = allowClose;
  const st = await Sas4License.status();
  currentLicStatus = st;
  const sum = document.getElementById("licSummary");
  if (sum) sum.textContent = st.summary;
  const devEl = document.getElementById("licDevCode");
  if (devEl) devEl.textContent = st.device;
  const phEl = document.getElementById("licPhoneInput");
  if (phEl && !phEl.value) phEl.value = st.phone || "";
  const kEl = document.getElementById("licKeyInput");
  if (kEl && !kEl.value && st.key) kEl.value = st.key;
  const trBtn = document.getElementById("licTrialToggleBtn");
  if (trBtn) trBtn.style.display = (st.cloud && !st.isTrial && st.allowed) ? "none" : "block";
  const limBox = document.getElementById("licDeviceLimitBox");
  if (limBox) limBox.style.display = "none";
  const closeBtn = document.getElementById("licCloseBtn");
  if (closeBtn) closeBtn.style.display = allowClose ? "block" : "none";
  setLicFeedback("");
  updateWaylPriceUI();
  const pend = Sas4License.getPendingPayOrder();
  const chkBtn = document.getElementById("waylCheckBtn");
  if (chkBtn) chkBtn.style.display = pend ? "block" : "none";
  document.getElementById("licenseModal").style.display = "flex";
}

function copyDevCode() {
  if (!currentLicStatus || !currentLicStatus.device) return;
  haptic(18);
  const code = currentLicStatus.device;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => setLicFeedback("تم نسخ رمز الجهاز: " + code, "#4ADE80")).catch(() => {});
  } else {
    const ta = document.createElement("textarea");
    ta.value = code; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); setLicFeedback("تم نسخ رمز الجهاز: " + code, "#4ADE80"); } catch (_) {}
    document.body.removeChild(ta);
  }
}

function requestKeyWhatsApp() {
  const ph = Sas4License.normalizePhone(document.getElementById("licPhoneInput")?.value || (currentLicStatus && currentLicStatus.phone) || "") || "غير مدخل";
  const dev = (currentLicStatus && currentLicStatus.device) || "";
  const txt = `أرغب بتفعيل / تجديد الاشتراك السحابي لتطبيق HARON NET SAS4.\nرقم موبايلي: ${ph}\nرمز الجهاز: ${dev}`;
  window.open(`https://wa.me/${LIC_VENDOR_WA}?text=${encodeURIComponent(txt)}`, "_blank");
}

async function submitLicenseKey(forceReplace = false) {
  const phone = (document.getElementById("licPhoneInput")?.value || "").trim();
  const key = (document.getElementById("licKeyInput")?.value || "").trim();
  const limBox = document.getElementById("licDeviceLimitBox");
  if (limBox) limBox.style.display = "none";
  setLicFeedback(forceReplace ? "جارٍ نقل الاشتراك لهذا الجهاز..." : "جارٍ التحقق من الاشتراك على السحابة...", "#38BDF8");

  const res = await Sas4License.activate(key, phone, forceReplace);
  if (res.ok) {
    haptic(25);
    setLicFeedback(res.message || "تم تفعيل الاشتراك السحابي بنجاح", "#4ADE80");
    const st = await Sas4License.status();
    currentLicStatus = st;
    const sum = document.getElementById("licSummary");
    if (sum) sum.textContent = st.summary;
    const setSum = document.getElementById("setLicSummary");
    if (setSum) setSum.textContent = st.summary;
    setTimeout(() => {
      document.getElementById("licenseModal").style.display = "none";
    }, 900);
    return;
  }

  if (res.deviceLimitReached && limBox) {
    const txt = document.getElementById("licDeviceLimitText");
    if (txt) {
      const devs = res.devicesSummary ? `\nالأجهزة المسجّلة: ${res.devicesSummary}` : "";
      txt.textContent = `وصلت للحد الأقصى (${res.activeDevices}/${res.maxDevices} أجهزة).${devs}`;
    }
    limBox.style.display = "block";
    setLicFeedback(res.message || "تم بلوغ الحد الأقصى للأجهزة", "#FBBF24");
  } else {
    setLicFeedback(res.message || "فشل تفعيل الاشتراك", "#FCA5A5");
  }
}

function toggleCloudTrialBox() {
  const box = document.getElementById("cloudTrialBox");
  if (!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
}

async function submitCloudTrial() {
  const nm = (document.getElementById("licTrialName")?.value || "").trim();
  const ph = (document.getElementById("licPhoneInput")?.value || "").trim();
  setLicFeedback("جارٍ تفعيل التجربة السحابية (7 أيام)...", "#38BDF8");
  const res = await Sas4License.registerTrial(nm, ph);
  if (res.ok) {
    setLicFeedback(res.message, "#4ADE80");
    const st = await Sas4License.status();
    currentLicStatus = st;
    document.getElementById("licSummary").textContent = st.summary;
    const setSum = document.getElementById("setLicSummary");
    if (setSum) setSum.textContent = st.summary;
    setTimeout(() => { document.getElementById("licenseModal").style.display = "none"; }, 900);
  } else {
    setLicFeedback(res.message, "#FCA5A5");
  }
}

function toggleWaylPayBox() {
  const box = document.getElementById("waylPayBox");
  if (!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
  updateWaylPriceUI();
}

function setWaylMonths(m) {
  paySelMonths = m;
  updateWaylPriceUI();
}

function setWaylDevices(d) {
  paySelDevices = d;
  updateWaylPriceUI();
}

function updateWaylPriceUI() {
  const total = Sas4License.calculatePriceIqd(paySelMonths, paySelDevices);
  const el = document.getElementById("waylPriceSummary");
  if (el) {
    el.textContent = `الإجمالي: ${total.toLocaleString("en-US")} د.ع (${paySelMonths} شهر • ${paySelDevices} جهاز)`;
  }
  document.querySelectorAll("[data-wm]").forEach(b => {
    const on = Number(b.getAttribute("data-wm")) === paySelMonths;
    b.style.borderColor = on ? "#38BDF8" : "#1E293B";
    b.style.color = on ? "#38BDF8" : "#94A3B8";
  });
  document.querySelectorAll("[data-wd]").forEach(b => {
    const on = Number(b.getAttribute("data-wd")) === paySelDevices;
    b.style.borderColor = on ? "#34D399" : "#1E293B";
    b.style.color = on ? "#34D399" : "#94A3B8";
  });
}

async function startWaylPayment() {
  const ph = (document.getElementById("licPhoneInput")?.value || "").trim();
  const nm = (document.getElementById("licTrialName")?.value || "").trim();
  setLicFeedback("جارٍ إنشاء رابط الدفع الإلكتروني...", "#38BDF8");
  const res = await Sas4License.createWaylOrder(ph, nm, paySelMonths, paySelDevices);
  if (res.ok) {
    const chkBtn = document.getElementById("waylCheckBtn");
    if (chkBtn) chkBtn.style.display = "block";
    setLicFeedback("تم إنشاء الطلب — أكمل الدفع ثم اضغط «تحقق من إتمام الدفع»", "#4ADE80");
    window.open(res.paymentUrl, "_blank");
  } else {
    setLicFeedback(res.error || "تعذر إنشاء طلب الدفع", "#FCA5A5");
  }
}

async function checkWaylPaymentNow() {
  const pend = Sas4License.getPendingPayOrder();
  if (!pend || !pend.orderId) {
    setLicFeedback("لا يوجد طلب دفع قيد الانتظار.", "#FBBF24");
    return;
  }
  setLicFeedback("جارٍ التحقق من حالة الدفع...", "#38BDF8");
  const st = await Sas4License.checkWaylOrderStatus(pend.orderId, pend.phone);
  if (!st.ok) {
    setLicFeedback(st.error || "تعذر فحص الدفع", "#FCA5A5");
    return;
  }
  if (st.licenseKey) {
    const phEl = document.getElementById("licPhoneInput");
    const kEl = document.getElementById("licKeyInput");
    if (phEl) phEl.value = st.phone;
    if (kEl) kEl.value = st.licenseKey;
    setLicFeedback("تم تأكيد الدفع! جارٍ تفعيل المفتاح السحابي تلقائياً...", "#4ADE80");
    await submitLicenseKey(false);
  } else {
    setLicFeedback(`حالة الطلب الحالية: ${st.status} — أعد المحاولة بعد إكمال الدفع.`, "#FBBF24");
  }
}

async function enforceLicenseGate() {
  const st = await Sas4License.status();
  currentLicStatus = st;
  if (!st.allowed) {
    await openLicenseModal(false);
    return false;
  }
  return true;
}

let _licGateBound = false;
function initLicenseGate() {
  if (_licGateBound) return;
  _licGateBound = true;
  const origDoLogin = window.doLogin;
  if (typeof origDoLogin === "function") {
    window.doLogin = async function(silent = false) {
      if (!(await enforceLicenseGate())) return false;
      return origDoLogin.apply(this, arguments);
    };
  }
  const origRefresh = window.refreshAll;
  if (typeof origRefresh === "function") {
    window.refreshAll = async function() {
      if (!(await enforceLicenseGate())) return;
      return origRefresh.apply(this, arguments);
    };
  }
  Sas4License.syncInBackground(false);
  enforceLicenseGate();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initLicenseGate);
} else {
  initLicenseGate();
}
