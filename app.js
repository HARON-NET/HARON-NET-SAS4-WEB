window.onerror = function(m) {
  var b = document.getElementById("statusBox");
  if (b) { b.style.color = "#FCA5A5"; b.textContent = "خطأ: " + m; }
};

const SAS4_KEY = "abcdefghijuklmno0123456789012345";
let allSubs = [], currentFilter = "all", profilesCache = [], octetSnaps = {}, liveTimer = null;

const gs = (k, d = "") => localStorage.getItem(k) || d;
const ss = (k, v) => localStorage.setItem(k, v);
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => (c === "x" ? Math.random() * 16 | 0 : (Math.random() * 16 | 0) & 3 | 8).toString(16));
const trMsg = c => c === "rsp_insufficient_balance" ? "الرصيد أو النقاط غير كافية" : c === "rsp_profile_changed" ? "تم تغيير الباقة بنجاح" : c === "rsp_success" ? "تمت العملية بنجاح" : (c || "فشل تنفيذ العملية");

function fmtBytes(b) {
  b = Number(b || 0);
  if (b <= 0) return "0 MB";
  const gb = b / 1073741824;
  return gb >= 1 ? gb.toFixed(2) + " GB" : (b / 1048576).toFixed(1) + " MB";
}

function fmtUptime(sec) {
  sec = Number(sec || 0);
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return (d ? d + "ي " : "") + (h ? h + "س " : "") + m + "د";
}

function copyText(txt, btn) {
  navigator.clipboard.writeText(txt).then(() => {
    if (btn) { const old = btn.textContent; btn.textContent = "تم النسخ ✓"; setTimeout(() => btn.textContent = old, 1200); }
  });
}

function md5(b) {
  const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  let l = b.length, p = l + 1; while (p % 64 !== 56) p++;
  const u = new Uint8Array(p + 8); u.set(b); u[l] = 128;
  const d = new DataView(u.buffer); d.setUint32(p, (l * 8) >>> 0, true); d.setUint32(p + 4, Math.floor(l * 8 / 4294967296) >>> 0, true);
  let a = 0x67452301, e = 0xefcdab89, c = 0x98badcfe, g = 0x10325476, M = new Uint32Array(16);
  for (let o = 0; o < u.length; o += 64) {
    for (let j = 0; j < 16; j++) M[j] = d.getUint32(o + j * 4, true);
    let A = a, B = e, C = c, D = g;
    for (let i = 0; i < 64; i++) {
      let F, k;
      if (i < 16) { F = (B & C) | (~B & D); k = i; }
      else if (i < 32) { F = (D & B) | (~D & C); k = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; k = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); k = (7 * i) % 16; }
      F = (F + A + K[i] + M[k]) >>> 0; A = D; D = C; C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
    }
    a = (a + A) >>> 0; e = (e + B) >>> 0; c = (c + C) >>> 0; g = (g + D) >>> 0;
  }
  const out = new Uint8Array(16), v = new DataView(out.buffer);
  v.setUint32(0, a, true); v.setUint32(4, e, true); v.setUint32(8, c, true); v.setUint32(12, g, true);
  return out;
}

async function encSas(obj) {
  const te = new TextEncoder(), pass = te.encode(SAS4_KEY), plain = te.encode(JSON.stringify(obj));
  const salt = crypto.getRandomValues(new Uint8Array(8)), ki = new Uint8Array(48);
  let prev = new Uint8Array(0), off = 0;
  while (off < 48) {
    const inp = new Uint8Array(prev.length + pass.length + 8);
    inp.set(prev); inp.set(pass, prev.length); inp.set(salt, prev.length + pass.length);
    prev = md5(inp); const t = Math.min(prev.length, 48 - off); ki.set(prev.subarray(0, t), off); off += t;
  }
  const key = await crypto.subtle.importKey("raw", ki.subarray(0, 32), { name: "AES-CBC" }, false, ["encrypt"]);
  const cip = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: ki.subarray(32, 48) }, key, plain));
  const pref = te.encode("Salted__"), full = new Uint8Array(16 + cip.length);
  full.set(pref); full.set(salt, 8); full.set(cip, 16);
  let s = ""; for (let i = 0; i < full.length; i++) s += String.fromCharCode(full[i]);
  return btoa(s);
}

function setStatus(m, c) { const b = document.getElementById("statusBox"); b.style.color = c || "#94A3B8"; b.textContent = m; }

async function apiCall(method, target, obj = null, auth = true) {
  const proxy = gs("sas4_proxy", "https://flat-flower-e68bsas4-proxy.haronmardin.workers.dev").trim().replace(/\/+$/, "");
  const h = { "Accept": "application/json, text/plain, */*", "X-Target-Url": target.trim() };
  if (auth && gs("sas4_token")) h["Authorization"] = "Bearer " + gs("sas4_token");
  let body;
  if (method === "POST" || method === "PUT") {
    h["Content-Type"] = "application/json; charset=utf-8";
    body = obj ? JSON.stringify({ payload: await encSas(obj) }) : "{}";
  }
  const res = await fetch(proxy + "/proxy", { method, headers: h, body });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  return { ok: res.ok, status: res.status, text, json };
}

async function doLogin(silent = false) {
  const user = (document.getElementById("username").value || gs("sas4_user")).trim();
  const pass = document.getElementById("password").value || gs("sas4_pass");
  const proxy = document.getElementById("proxyUrl").value.trim().replace(/\/+$/, "");
  const lurl = document.getElementById("loginUrl").value.trim();
  if (!user || !pass) { if (!silent) setStatus("أدخل اسم المستخدم وكلمة المرور.", "#FBBF24"); return false; }
  ss("sas4_user", user); ss("sas4_pass", pass); ss("sas4_proxy", proxy); ss("sas4_login_url", lurl);
  const btn = document.getElementById("loginBtn"); btn.disabled = true;
  if (!silent) setStatus("جاري الاتصال ببوابة SAS4...", "#38BDF8");
  try {
    const r = await apiCall("POST", lurl, { username: user, password: pass, language: "ar" }, false);
    btn.disabled = false;
    if (r.ok && r.json && Number(r.json.status) === 200 && r.json.token) {
      ss("sas4_token", r.json.token);
      const base = (r.json.successful_server && r.json.successful_server.api_url) ? r.json.successful_server.api_url.replace(/\/+$/, "") : "https://s3.nbtel.iq/admin/api/index.php/api";
      ss("sas4_api_base", base);
      if (!silent) {
        document.getElementById("loginView").style.display = "none";
        document.getElementById("appView").style.display = "block";
        document.getElementById("agentLabel").textContent = "الوكيل: " + user;
        refreshAll();
      }
      return true;
    }
    const err = (r.json && (r.json.message || r.json.error)) || r.text.slice(0, 120) || ("HTTP " + r.status);
    if (!silent) setStatus("فشل الدخول (" + r.status + "): " + err, "#FCA5A5");
    return false;
  } catch (e) {
    btn.disabled = false;
    if (!silent) setStatus("تعذر الاتصال: " + e.message, "#FCA5A5");
    return false;
  }
}

async function sasReq(m, p, o = null) {
  const u = gs("sas4_api_base", "https://s3.nbtel.iq/admin/api/index.php/api") + "/" + p.replace(/^\/+/, "");
  let r = await apiCall(m, u, o, true);
  if (r.status === 401 && await doLogin(true)) r = await apiCall(m, u, o, true);
  return r;
}

function refreshAll() { loadMetrics(); loadSubs(); }

async function loadMetrics() {
  const ks = ["wd_balance","wd_users_online","wd_users_active_count","wd_users_expired_count","wd_users_expiring_today","wd_users_expiring_in_3_days","wd_reward_points","wd_fup_online"];
  const ids = ["mBalance","mOnline","mActive","mExpired","mToday","m3Days","mPoints","mFup"];
  const rs = await Promise.all(ks.map(k => sasReq("GET", "widgetData/internal/" + k)));
  rs.forEach((r, i) => {
    const el = document.getElementById(ids[i]);
    if (el && r.ok && r.json && r.json.data !== undefined) el.textContent = r.json.data;
  });
}

function computeRates(uid, inB, outB, now) {
  let dn = 0, up = 0, prev = octetSnaps[uid];
  if (prev) {
    const dt = now - prev.t;
    if (dt >= 0.4) {
      const dOut = outB - prev.o, dIn = inB - prev.i;
      if (dOut > 0 || dIn > 0) {
        dn = dOut >= 0 ? (dOut * 8) / (dt * 1e6) : 0;
        up = dIn >= 0 ? (dIn * 8) / (dt * 1e6) : 0;
        octetSnaps[uid] = { i: inB, o: outB, t: now, dn, up };
      } else if (dt < 15) { dn = prev.dn; up = prev.up; }
      else octetSnaps[uid] = { i: inB, o: outB, t: now, dn: 0, up: 0 };
    } else { dn = prev.dn; up = prev.up; }
  } else octetSnaps[uid] = { i: inB, o: outB, t: now, dn: 0, up: 0 };
  return { dn, up };
}

async function fetchOnlineMap() {
  const ro = await sasReq("POST", "index/online", { page: 1, count: 500, sortBy: null, direction: "asc", search: "", columns: ["id","username","framedipaddress","callingstationid","acctsessiontime","acctinputoctets","acctoutputoctets"] });
  const om = {}, now = Date.now() / 1000;
  if (ro.ok && ro.json && Array.isArray(ro.json.data)) {
    ro.json.data.forEach(x => {
      const id = x.user_details && Number(x.user_details.id);
      if (id > 0) {
        const rt = computeRates(id, Number(x.acctinputoctets || 0), Number(x.acctoutputoctets || 0), now);
        om[id] = {
          rad: x.radacctid || x.id || 0, ip: x.framedipaddress || "", mac: x.callingstationid || "",
          nas: (x.nas_details && x.nas_details.shortname) || "", uptime: Number(x.acctsessiontime || 0),
          dn: rt.dn, up: rt.up
        };
      }
    });
  }
  return om;
}

async function loadSubs(silent = false) {
  const el = document.getElementById("subsList");
  if (!silent) el.innerHTML = '<div class="card" style="text-align:center;color:#94A3B8">جاري جلب المشتركين...</div>';
  const [ru, om] = await Promise.all([
    sasReq("POST", "index/user", { page: 1, count: 500, columns: ["idx","username","firstname","lastname","expiration","parent_username","name","loan_balance","traffic","remaining_days"], connection: -1, profile_id: -1, parent_id: -1, sub_users: true, mac: "", direction: "asc", sortBy: "username", search: "" }),
    fetchOnlineMap()
  ]);
  if (!ru.ok || !ru.json || !Array.isArray(ru.json.data)) {
    if (!silent) el.innerHTML = '<div class="card" style="color:#FCA5A5">تعذر جلب المشتركين (' + ru.status + ')</div>';
    return;
  }
  allSubs = ru.json.data.map(u => {
    const id = Number(u.id), fn = (u.firstname && u.firstname !== "فارغ") ? u.firstname : "", ln = u.lastname || "", lv = om[id];
    return {
      id, username: u.username || "", fullName: (fn + " " + ln).trim() || u.username,
      profile: (u.profile_details && u.profile_details.name) || u.profile_name || "—",
      expiration: u.expiration || "—", days: Number(u.remaining_days || 0),
      isOnline: Number(u.online_status) === 1 || !!lv, isActive: !!(u.status && u.status.status),
      traffic: (u.daily_traffic_details && u.daily_traffic_details.traffic) || 0,
      loan: Number(u.loan_balance || 0),
      rad: lv ? lv.rad : 0, ip: lv ? lv.ip : "", mac: lv ? lv.mac : "", nas: lv ? lv.nas : "",
      uptime: lv ? lv.uptime : 0, dn: lv ? lv.dn : 0, up: lv ? lv.up : 0
    };
  });
  allSubs.sort((a, b) => (b.isOnline - a.isOnline) || (b.isActive - a.isActive));
  document.getElementById("cAll").textContent = allSubs.length;
  document.getElementById("cOn").textContent = allSubs.filter(x => x.isOnline).length;
  document.getElementById("cAct").textContent = allSubs.filter(x => x.isActive).length;
  document.getElementById("cExp").textContent = allSubs.filter(x => !x.isActive).length;
  renderList();
}

function toggleLive(btn) {
  if (liveTimer) {
    clearInterval(liveTimer); liveTimer = null;
    btn.textContent = "مباشر: متوقف"; btn.className = "btn btn-sm btn-ghost";
  } else {
    btn.textContent = "مباشر: شغال ●"; btn.className = "btn btn-sm btn-green";
    liveTimer = setInterval(async () => {
      const om = await fetchOnlineMap();
      allSubs.forEach(s => {
        const lv = om[s.id];
        if (lv) { s.isOnline = true; s.rad = lv.rad; s.ip = lv.ip; s.mac = lv.mac; s.nas = lv.nas; s.uptime = lv.uptime; s.dn = lv.dn; s.up = lv.up; }
        else { s.isOnline = false; s.dn = 0; s.up = 0; }
      });
      renderList();
    }, 5000);
  }
}

function setFilter(f, el) { currentFilter = f; document.querySelectorAll(".pill").forEach(p => p.classList.remove("on")); el.classList.add("on"); renderList(); }

function renderList() {
  const q = document.getElementById("searchBox").value.trim().toLowerCase();
  const list = allSubs.filter(s =>
    (currentFilter !== "online" || s.isOnline) &&
    (currentFilter !== "active" || s.isActive) &&
    (currentFilter !== "expired" || !s.isActive) &&
    (!q || s.username.toLowerCase().includes(q) || s.fullName.toLowerCase().includes(q) || s.profile.toLowerCase().includes(q) || s.ip.toLowerCase().includes(q) || s.mac.toLowerCase().includes(q))
  );
  const el = document.getElementById("subsList");
  if (!list.length) { el.innerHTML = '<div class="card" style="text-align:center;color:#94A3B8">لا توجد نتائج</div>'; return; }
  el.innerHTML = list.map(s => `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><span class="dot ${s.isOnline ? 'on' : ''}"></span><b>${s.fullName}</b> <span style="font-size:12px;color:#38BDF8" dir="ltr">@${s.username}</span></div>
      <span class="tag ${s.isActive ? 'act' : 'exp'}">${s.isActive ? 'نشط' : 'منتهي'}</span>
    </div>
    <div class="meta">
      الباقة: <b>${s.profile}</b> • المتبقي: <b>${s.days} يوم</b>${s.loan > 0 ? ' • دين: <b style="color:#FBBF24">' + s.loan + '</b>' : ''}<br>
      الانتهاء: <span dir="ltr">${s.expiration}</span> • استهلاك اليوم: <b>${fmtBytes(s.traffic)}</b>
      ${s.isOnline ? `<br>IP: <span dir="ltr" style="color:#CBD5E1">${s.ip || '—'}</span> • المدة: <b>${fmtUptime(s.uptime)}</b>${s.nas ? ' • ' + s.nas : ''}${(s.dn > 0 || s.up > 0) ? `<br>السرعة: <b style="color:#4ADE80" dir="ltr">↓${s.dn.toFixed(1)}M</b> / <b style="color:#38BDF8" dir="ltr">↑${s.up.toFixed(1)}M</b>` : ''}` : ''}
    </div>
    <div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">
      <button type="button" class="btn btn-sm btn-green" onclick="openRenew(${s.id})">تجديد / تفعيل</button>
      <button type="button" class="btn btn-sm btn-ghost" onclick="openDetails(${s.id})">التفاصيل</button>
      ${s.isOnline && s.rad ? `<button type="button" class="btn btn-sm btn-red" onclick="disconnectSub(${s.rad})">فصل</button>` : ''}
    </div>
  </div>`).join("");
}

async function openRenew(uid) {
  const m = document.getElementById("renewModal"), box = document.getElementById("renewContent"), s = allSubs.find(x => x.id === uid);
  document.getElementById("renewTitle").textContent = "تجديد: " + (s ? s.fullName : uid);
  box.innerHTML = "جاري جلب بيانات الباقة..."; m.style.display = "flex";
  const [ra, re, rl, rp] = await Promise.all([
    sasReq("GET", "user/activationData/" + uid),
    sasReq("GET", "user/extensionData/" + uid),
    sasReq("GET", "allowedExtensions/3"),
    profilesCache.length ? Promise.resolve({ ok: true, json: { data: profilesCache } }) : sasReq("GET", "list/profile/0")
  ]);
  if (!ra.ok || !ra.json || !ra.json.data) { box.innerHTML = '<div style="color:#FCA5A5">فشل جلب بيانات التفعيل (' + ra.status + ')</div>'; return; }
  const d = ra.json.data, pr = Number(d.user_price || 0);
  if (rp.ok && rp.json && Array.isArray(rp.json.data)) profilesCache = rp.json.data;
  let extId = 24, extName = "Test", pts = Number(d.reward_points_balance || 0);
  if (re.ok && re.json && re.json.data && re.json.data.reward_points_balance !== undefined) pts = Number(re.json.data.reward_points_balance);
  if (rl.ok && rl.json && Array.isArray(rl.json.data) && rl.json.data.length) { extId = Number(rl.json.data[0].id || 24); extName = rl.json.data[0].name || "Test"; }
  const opts = profilesCache.map(p => `<option value="${p.id}" ${Number(p.id) === Number(d.profile_id) ? 'selected' : ''}>${p.name}</option>`).join("");
  box.innerHTML = `<div class="box">المشترك: <b dir="ltr">${d.username || ''}</b><br>الباقة: <b>${d.profile_name || '—'}</b> (${d.profile_duration || '30 day(s)'})<br>الانتهاء: <span dir="ltr">${d.user_expiration || '—'}</span><br>السعر: <b style="color:#38BDF8">${d.unit_price || pr}</b> • رصيدك: <b style="color:#4ADE80">${d.manager_balance || '—'}</b><br>النقاط: <b>${pts}</b></div>
  <label>عدد الوحدات</label><select id="actUnits"><option value="1" selected>1 وحدة (${pr})</option><option value="2">2 وحدة (${pr * 2})</option><option value="3">3 وحدات (${pr * 3})</option></select>
  <button id="bAct" type="button" class="btn btn-green" onclick="doAct(${uid},${pr})">تأكيد التفعيل بالرصيد</button>
  <div class="sep"><label>تغيير الباقة فوراً</label><div style="display:flex;gap:6px"><select id="pSel" style="margin:0">${opts}</select><button id="bProf" type="button" class="btn btn-sm btn-ghost" onclick="doProf(${uid})">تغيير</button></div></div>
  <div class="sep"><button id="bExt" type="button" class="btn btn-amber" onclick="doExt(${uid},${extId})">تمديد بالنقاط (${extName})</button></div>
  <div id="rMsg" class="status" style="display:none"></div>`;
}

function rMsg(t, ok) { const e = document.getElementById("rMsg"); if (e) { e.style.display = "block"; e.style.color = ok ? "#4ADE80" : "#FCA5A5"; e.textContent = t; } }

async function doAct(uid, pr) {
  const u = Number(document.getElementById("actUnits").value || 1);
  if (!confirm("تأكيد تفعيل الاشتراك (" + u + " وحدة)؟")) return;
  const b = document.getElementById("bAct"); b.disabled = true; rMsg("جاري التفعيل...", true);
  const r = await sasReq("POST", "user/activate", { method: "credit", pin: "", user_id: String(uid), money_collected: 1, comments: null, user_price: pr, issue_invoice: 0, transaction_id: uuid(), activation_units: u });
  b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) { rMsg("تم تفعيل اشتراك المشترك بنجاح", true); refreshAll(); }
  else rMsg(trMsg(r.json && r.json.message), false);
}

async function doExt(uid, eid) {
  if (!confirm("تأكيد التمديد بالنقاط؟")) return;
  const b = document.getElementById("bExt"); b.disabled = true; rMsg("جاري التمديد...", true);
  const r = await sasReq("POST", "user/extend", { user_id: String(uid), profile_id: String(eid), method: "reward_points", transaction_id: uuid() });
  b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) { rMsg("تم تمديد الاشتراك بنجاح", true); refreshAll(); }
  else rMsg(trMsg(r.json && r.json.message), false);
}

async function doProf(uid) {
  const pid = Number(document.getElementById("pSel").value); if (!pid) return;
  const b = document.getElementById("bProf"); b.disabled = true; rMsg("جاري تغيير الباقة...", true);
  const r = await sasReq("POST", "user/changeProfile", { user_id: String(uid), profile_id: pid, change_type: "immediate" });
  b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) { rMsg("تم تغيير الباقة فوراً", true); refreshAll(); }
  else rMsg(trMsg(r.json && r.json.message), false);
}

async function openHistory() {
  document.getElementById("modalTitle").textContent = "سجل التفعيلات";
  const b = document.getElementById("modalBody"); b.textContent = "جاري التحميل...";
  document.getElementById("detailModal").style.display = "flex";
  const r = await sasReq("POST", "index/activations", { page: 1, count: 30, sortBy: "id", direction: "desc", search: "", columns: ["created_at","username","firstname","lastname","username","name","price","user_price","old_expiration","new_expiration","activation_method","user_activations_count","refunded"] });
  if (r.ok && r.json && Array.isArray(r.json.data) && r.json.data.length) {
    b.innerHTML = r.json.data.map(o => `<div class="box"><b dir="ltr" style="color:#38BDF8">@${(o.user_details && o.user_details.username) || '—'}</b> • <b>${(o.profile_details && o.profile_details.name) || '—'}</b><br>السعر: <b>${o.price || '0'}</b> • الانتهاء: <span dir="ltr">${o.new_expiration || '—'}</span><br><small style="color:#64748B" dir="ltr">${o.created_at || ''}</small></div>`).join("");
  } else b.textContent = "لا توجد تفعيلات حديثة.";
}

async function openDetails(uid) {
  const s = allSubs.find(x => x.id === uid);
  document.getElementById("modalTitle").textContent = "المشترك:" + (s ? s.username : uid);
  const b = document.getElementById("modalBody"); b.textContent = "جاري التحميل...";
  document.getElementById("detailModal").style.display = "flex";
  const r = await sasReq("GET", "user/overview/" + uid);
  if (r.ok && r.json && r.json.data) {
    const d = r.json.data, ph = (d.phone || "").replace(/[^0-9+]/g, "");
    const wa = ph ? "https://wa.me/" + ph.replace(/^0/, "964").replace(/^\+/, "") : "";
    b.innerHTML = `<div class="box">
      اليوزر: <b dir="ltr">${s ? s.username : ''}</b><br>
      كلمة المرور: <b dir="ltr">${d.password || '—'}</b><br>
      الهاتف: <b dir="ltr">${d.phone || '—'}</b><br>
      العنوان: <b>${d.address || '—'}</b><br>
      MAC: <span dir="ltr">${(s && s.mac) || '—'}</span><br>
      آخر اتصال: <span dir="ltr">${d.last_online || '—'}</span><br>
      أُنشئ بواسطة: <b>${d.created_by || '—'}</b> (<span dir="ltr">${d.created_at || '—'}</span>)
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="btn btn-sm btn-ghost" onclick="copyText('User: ${s ? s.username : ''}\\nPass: ${d.password || ''}', this)">نسخ اليوزر والباسورد</button>
      ${ph ? `<a class="btn btn-sm btn-ghost" style="text-decoration:none" href="tel:${ph}">اتصال</a><a class="btn btn-sm btn-green" style="text-decoration:none" target="_blank" href="${wa}">واتساب</a>` : ''}
    </div>`;
  } else b.textContent = "تعذر جلب التفاصيل.";
}

async function disconnectSub(rad) { if (!confirm("فصل اتصال المشترك؟")) return; await sasReq("GET", "user/disconnect/acctid/" + rad); loadSubs(true); }
function logout() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } localStorage.removeItem("sas4_token"); document.getElementById("appView").style.display = "none"; document.getElementById("loginView").style.display = "flex"; }

window.addEventListener("DOMContentLoaded", () => {
  var lb = document.getElementById("loginBtn");
  if (lb) lb.addEventListener("click", function() { doLogin(); });
  document.getElementById("username").value = gs("sas4_user");
  document.getElementById("password").value = gs("sas4_pass");
  if (gs("sas4_proxy")) document.getElementById("proxyUrl").value = gs("sas4_proxy");
  if (gs("sas4_login_url")) document.getElementById("loginUrl").value = gs("sas4_login_url");
  if (gs("sas4_token")) {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("appView").style.display = "block";
    document.getElementById("agentLabel").textContent = "الوكيل: " + gs("sas4_user");
    refreshAll();
  }
});
                                   
