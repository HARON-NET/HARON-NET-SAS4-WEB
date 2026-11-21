const LIC_PUB_SPKI = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEj0Zt28sYb358Lynxh7NpQkFuleJ7AqVQMyeQfESv2yKk7NpxBqjem/W20f/3Us1Og1PDCMYW80li/tVBzYhcCA==";
const LIC_VENDOR_WA = "9647750149398";
const LIC_TRIAL_DAYS = 7;
const LIC_DAY_MS = 86400000;

function haptic(pattern = 22) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  try {
    const lbl = document.getElementById("iosHapticLbl");
    if (lbl) lbl.click();
  } catch (e) {}
}

document.addEventListener("click", (e) => {
  if (e.target.closest("button, .pill, a[href], summary, .dev-box")) haptic(20);
}, true);

const Sas4License = (() => {
  const appTag = "sas4";
  const seedKey = "lic_device_seed";
  const clockKey = "lic_clock_state";
  const licKey = "lic_saved_key";
  const te = new TextEncoder();

  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function sha256Hex(str) {
    const dig = await crypto.subtle.digest("SHA-256", te.encode(str));
    return bufToHex(dig);
  }

  async function hmacHex(devCode, data) {
    const key = await crypto.subtle.importKey(
      "raw", te.encode(`haron-net-guard-v2:${appTag}:${devCode}`),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, te.encode(data));
    return bufToHex(sig);
  }

  async function deviceCode() {
    let seed = localStorage.getItem(seedKey);
    if (!seed) {
      seed = (crypto.randomUUID ? crypto.randomUUID() : (Date.now() + "-" + Math.random().toString(36).slice(2))).toUpperCase();
      localStorage.setItem(seedKey, seed);
    }
    const hex = (await sha256Hex(`mkm1:${seed}`)).toUpperCase();
    return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;
  }

  async function monotonicClock(dev) {
    const now = Date.now();
    let start = Infinity, last = 0;
    const raw = localStorage.getItem(clockKey);
    if (raw) {
      const parts = raw.trim().split(":");
      if (parts.length === 3) {
        const st = Number(parts[0]), ls = Number(parts[1]);
        if (Number.isFinite(st) && Number.isFinite(ls)) {
          const exp = await hmacHex(dev, `${appTag}|${dev}|${st}|${ls}`);
          if (parts[2].toLowerCase() === exp.toLowerCase()) { start = st; last = ls; }
        }
      }
    }
    if (!Number.isFinite(start)) start = now;
    const eff = Math.max(now, last);
    const sig = await hmacHex(dev, `${appTag}|${dev}|${start}|${eff}`);
    localStorage.setItem(clockKey, `${start}:${eff}:${sig}`);
    return { start, now: eff };
  }

  function b64UrlToBytes(input) {
    let b64 = input.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function derToP1363(der) {
    if (der[0] !== 0x30) return null;
    let off = 2;
    if (der[1] & 0x80) off += (der[1] & 0x7f);
    if (der[off++] !== 0x02) return null;
    const rLen = der[off++];
    let r = der.slice(off, off + rLen); off += rLen;
    if (der[off++] !== 0x02) return null;
    const sLen = der[off++];
    let s = der.slice(off, off + sLen);
    while (r.length > 32 && r[0] === 0) r = r.slice(1);
    while (s.length > 32 && s[0] === 0) s = s.slice(1);
    if (r.length > 32 || s.length > 32) return null;
    const out = new Uint8Array(64);
    out.set(r, 32 - r.length);
    out.set(s, 64 - s.length);
    return out;
  }

  function daysBetween(nowMs, ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return null;
    const exp = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    if (Number.isNaN(exp.getTime())) return null;
    const dNow = new Date(nowMs);
    const today = new Date(dNow.getFullYear(), dNow.getMonth(), dNow.getDate(), 0, 0, 0, 0);
    return Math.round((exp.getTime() - today.getTime()) / LIC_DAY_MS);
  }

  async function verify(raw, dev) {
    try {
      const cleaned = (raw || "").replace(/\s+/g, "");
      const parts = cleaned.split(".");
      if (parts.length !== 2) return { err: "bad" };
      const payloadBytes = b64UrlToBytes(parts[0]);
      const sigP1363 = derToP1363(b64UrlToBytes(parts[1]));
      if (!sigP1363) return { err: "bad" };

      const spkiBin = atob(LIC_PUB_SPKI);
      const spki = new Uint8Array(spkiBin.length);
      for (let i = 0; i < spkiBin.length; i++) spki[i] = spkiBin.charCodeAt(i);

      const pubKey = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pubKey, sigP1363, payloadBytes);
      if (!valid) return { err: "bad" };

      const obj = JSON.parse(new TextDecoder().decode(payloadBytes));
      if (obj.v !== 1 || typeof obj.d !== "string" || typeof obj.e !== "string" || daysBetween(Date.now(), obj.e) === null) {
        return { err: "bad" };
      }
      if (obj.d.toUpperCase() !== dev.toUpperCase()) return { err: "device" };
      return { payload: obj };
    } catch (e) {
      return { err: "bad" };
    }
  }

  async function status() {
    const dev = await deviceCode();
    const { start, now } = await monotonicClock(dev);
    const saved = localStorage.getItem(licKey);
    if (saved) {
      const res = await verify(saved, dev);
      if (res.payload) {
        const exp = res.payload.e;
        const left = daysBetween(now, exp);
        const name = res.payload.n || "HARON NET SAS4";
        if (left !== null && left >= 0) {
          return { device: dev, state: "licensed", allowed: true, licensed: true, name, expiry: exp, daysLeft: left, summary: `مفعّل باسم ${name} حتى ${exp} (متبقي ${left} يوم)` };
        }
        return { device: dev, state: "expired", allowed: false, licensed: true, name, expiry: exp, daysLeft: left || 0, summary: `انتهى الاشتراك في ${exp}` };
      }
    }
    const end = start + LIC_TRIAL_DAYS * LIC_DAY_MS;
    if (now < end) {
      const left = Math.ceil((end - now) / LIC_DAY_MS);
      return { device: dev, state: "trial", allowed: true, licensed: false, name: "", expiry: "", daysLeft: left, summary: `نسخة تجريبية مجانية • متبقي ${left} يوم من أصل 7 أيام` };
    }
    return { device: dev, state: "expired", allowed: false, licensed: false, name: "", expiry: "", daysLeft: 0, summary: "انتهت الفترة التجريبية (7 أيام) • يرجى تفعيل الاشتراك" };
  }

  async function activate(raw) {
    const dev = await deviceCode();
    const chk = await verify(raw, dev);
    if (!chk.payload) {
      haptic([35, 45, 35]);
      return { ok: false, msg: chk.err === "device" ? "هذا المفتاح مخصّص لجهاز آخر" : "مفتاح الاشتراك غير صحيح" };
    }
    const { now } = await monotonicClock(dev);
    const left = daysBetween(now, chk.payload.e);
    if (left === null || left < 0) {
      haptic([35, 45, 35]);
      return { ok: false, msg: "انتهت صلاحية هذا المفتاح" };
    }
    localStorage.setItem(licKey, raw.replace(/\s+/g, ""));
    haptic([20, 40, 30]);
    return { ok: true, msg: `تم التفعيل بنجاح. ينتهي الاشتراك في ${chk.payload.e}` };
  }

  return { status, activate, vendorWhatsApp: LIC_VENDOR_WA };
})();

let currentLicStatus = null, licAllowClose = true;

async function openSettingsModal() {
  const st = await Sas4License.status();
  currentLicStatus = st;
  document.getElementById("setLicSummary").textContent = st.summary;
  document.getElementById("setLoginUrl").value = gs("sas4_login_url", "https://reseller.nbtel.iq/api.php?action=login");
  document.getElementById("setProxyUrl").value = gs("sas4_proxy", "https://flat-flower-e68bsas4-proxy.haronmardin.workers.dev");
  document.getElementById("setUser").value = gs("sas4_user");
  document.getElementById("setPass").value = gs("sas4_pass");
  document.getElementById("setMsg").style.display = "none";
  document.getElementById("settingsModal").style.display = "flex";
}

function saveSettingsAndConnect() {
  const lurl = document.getElementById("setLoginUrl").value.trim();
  const purl = document.getElementById("setProxyUrl").value.trim().replace(/\/+$/, "");
  const u = document.getElementById("setUser").value.trim();
  const p = document.getElementById("setPass").value;
  ss("sas4_login_url", lurl); ss("sas4_proxy", purl); ss("sas4_user", u); ss("sas4_pass", p);
  document.getElementById("loginUrl").value = lurl;
  document.getElementById("proxyUrl").value = purl;
  document.getElementById("username").value = u;
  document.getElementById("password").value = p;
  document.getElementById("settingsModal").style.display = "none";
  if (u && p) doLogin(false);
}

function clearSavedSettings() {
  haptic([25, 35, 25]);
  localStorage.removeItem("sas4_user"); localStorage.removeItem("sas4_pass"); localStorage.removeItem("sas4_token");
  document.getElementById("setUser").value = ""; document.getElementById("setPass").value = "";
  const m = document.getElementById("setMsg");
  m.style.display = "block"; m.textContent = "تم مسح بيانات الدخول المحفوظة";
}

async function openLicenseModal(allowClose = true) {
  licAllowClose = allowClose;
  const st = await Sas4License.status();
  currentLicStatus = st;
  document.getElementById("licSummary").textContent = st.summary;
  document.getElementById("licDevCode").textContent = st.device;
  document.getElementById("licKeyInput").value = "";
  document.getElementById("licFeedback").style.display = "none";
  document.getElementById("licCloseBtn").style.display = allowClose ? "block" : "none";
  document.getElementById("licenseModal").style.display = "flex";
}

function copyDevCode() {
  if (!currentLicStatus) return;
  navigator.clipboard.writeText(currentLicStatus.device);
  const fb = document.getElementById("licFeedback");
  fb.style.display = "block"; fb.style.color = "#38BDF8"; fb.textContent = "تم نسخ رمز الجهاز ✓";
}

function requestKeyWhatsApp() {
  if (!currentLicStatus) return;
  const txt = `أرغب بتفعيل تطبيق HARON NET SAS4 (Web).\nرمز جهازي: ${currentLicStatus.device}`;
  window.open(`https://wa.me/${Sas4License.vendorWhatsApp}?text=${encodeURIComponent(txt)}`, "_blank");
}

async function submitLicenseKey() {
  const raw = document.getElementById("licKeyInput").value;
  const res = await Sas4License.activate(raw);
  const fb = document.getElementById("licFeedback");
  fb.style.display = "block";
  fb.style.color = res.ok ? "#4ADE80" : "#FCA5A5";
  fb.textContent = res.msg;
  if (res.ok) {
    const st = await Sas4License.status();
    currentLicStatus = st;
    document.getElementById("setLicSummary").textContent = st.summary;
    setTimeout(() => {
      document.getElementById("licenseModal").style.display = "none";
      document.getElementById("settingsModal").style.display = "none";
    }, 900);
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

window.addEventListener("DOMContentLoaded", () => {
  enforceLicenseGate();
  const origDoLogin = window.doLogin;
  if (typeof origDoLogin === "function") {
    window.doLogin = async function(silent = false) {
      if (!(await enforceLicenseGate())) return false;
      return origDoLogin(silent);
    };
  }
  const origRefresh = window.refreshAll;
  if (typeof origRefresh === "function") {
    window.refreshAll = async function() {
      if (!(await enforceLicenseGate())) return;
      return origRefresh();
    };
  }
});
      
