let activeDetailUid = null;
let activeDetailTab = "info";
let detailCache = {};
let devCfg = { type: "ubnt", proto: "https", autoIp: true, manualIp: "", user: "ubnt", pass: "" };
let activeDevSubTab = "basic";

function hideSubDetailUI() {
  const v = document.getElementById("subDetailView");
  if (v) v.style.display = "none";
  const app = document.getElementById("appView");
  if (app) app.style.display = "block";
  activeDetailUid = null;
}

function closeSubDetail() {
  if (history.state && history.state.subDetail) {
    history.back();
  } else {
    hideSubDetailUI();
  }
}

window.addEventListener("popstate", () => {
  if (activeDetailUid !== null) {
    hideSubDetailUI();
  }
});


function fmtSessionHMS(sec) {
  sec = Number(sec || 0);
  if (sec <= 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = String(Math.floor((sec % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return (d ? d + "ي " : "") + `${h}:${m}:${s}`;
}

function fmtIQD(val) {
  const n = Number(val || 0);
  return "IQD " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function copyField(txt, el) {
  if (!txt || txt === "—") return;
  if (typeof haptic === "function") haptic(18);
  navigator.clipboard.writeText(String(txt)).then(() => {
    if (el) {
      const old = el.textContent;
      el.textContent = "✓";
      setTimeout(() => { el.textContent = old; }, 1000);
    }
  });
}

function switchDetailTab(tab) {
  activeDetailTab = tab;
  const tInfo = document.getElementById("tabBtnInfo");
  const tDev = document.getElementById("tabBtnDev");
  if (tInfo && tDev) {
    tInfo.className = "det-tab" + (tab === "info" ? " on" : "");
    tDev.className = "det-tab" + (tab === "device" ? " on" : "");
  }
  renderDetailBody();
}

function loadSavedDevCfg(uid) {
  try {
    const raw = localStorage.getItem("sas4_dev_" + uid);
    if (raw) {
      devCfg = Object.assign({ type: "ubnt", proto: "https", autoIp: true, manualIp: "", user: "ubnt", pass: "" }, JSON.parse(raw));
      return;
    }
  } catch (e) {}
  devCfg = { type: "ubnt", proto: "https", autoIp: true, manualIp: "", user: "ubnt", pass: "" };
}

function saveDevCfg(uid) {
  try { localStorage.setItem("sas4_dev_" + uid, JSON.stringify(devCfg)); } catch (e) {}
}

window.openDetails = async function(uid) {
  if (!(history.state && history.state.subDetail)) {
    history.pushState({ subDetail: uid }, "");
  }
  activeDetailUid = uid;
  activeDetailTab = "info";
  loadSavedDevCfg(uid);

  let view = document.getElementById("subDetailView");
  if (!view) {
    view = document.createElement("div");
    view.id = "subDetailView";
    view.className = "wrap";
    document.body.appendChild(view);
  }

  const s = allSubs.find(x => x.id === uid) || { id: uid, username: String(uid), fullName: String(uid), initial: "م" };
  document.getElementById("appView").style.display = "none";
  view.style.display = "block";
  window.scrollTo(0, 0);

  view.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <button type="button" class="icon-btn" style="font-size:18px;font-weight:800" onclick="closeSubDetail()">‹</button>
      <b style="font-size:17px">${s.fullName}</b>
    </div>
    <div class="det-tabs">
      <button id="tabBtnInfo" type="button" class="det-tab on" onclick="switchDetailTab('info')">بيانات المشترك</button>
      <button id="tabBtnDev" type="button" class="det-tab" onclick="switchDetailTab('device')">جهاز المشترك</button>
    </div>
    <div id="detTabBody"></div>
  `;

  renderDetailBody();

  const [ro, ra, re, rl, rp] = await Promise.all([
    sasReq("GET", "user/overview/" + uid),
    sasReq("GET", "user/activationData/" + uid),
    sasReq("GET", "user/extensionData/" + uid),
    sasReq("GET", "allowedExtensions/3"),
    profilesCache.length ? Promise.resolve({ ok: true, json: { data: profilesCache } }) : sasReq("GET", "list/profile/0")
  ]);

  if (rp.ok && rp.json && Array.isArray(rp.json.data)) profilesCache = rp.json.data;
  const ov = (ro.ok && ro.json && ro.json.data) ? ro.json.data : {};
  const ac = (ra.ok && ra.json && ra.json.data) ? ra.json.data : {};
  let extId = 24, extName = "TEST";
  if (rl.ok && rl.json && Array.isArray(rl.json.data) && rl.json.data.length) {
    extId = Number(rl.json.data[0].id || 24);
    extName = String(rl.json.data[0].name || "TEST").toUpperCase();
  }
  detailCache[uid] = { ov, ac, extId, extName };
  if (activeDetailUid === uid) renderDetailBody();
};

function renderDetailBody() {
  const uid = activeDetailUid;
  const box = document.getElementById("detTabBody");
  if (!box || !uid) return;
  const s = allSubs.find(x => x.id === uid);
  if (!s) return;

  if (activeDetailTab === "device") {
    renderDeviceTab(box, s);
    return;
  }

  const cached = detailCache[uid] || { ov: {}, ac: {}, extId: 24, extName: "TEST" };
  const ov = cached.ov || {};
  const ac = cached.ac || {};
  const price = Number(ac.unit_price || ac.user_price || 0);
  const priceTxt = price > 0 ? fmtIQD(price) : "—";
  const avCls = s.isOnline ? "av-on" : (s.isActive ? "av-act" : "av-exp");
  const stTxt = s.isOnline ? "● متصل الآن" : (s.isActive ? "● فعال - غير متصل" : "● منتهي الاشتراك");
  const stColor = s.isOnline ? "#4ADE80" : (s.isActive ? "#38BDF8" : "#F87171");
  const daysNum = s.isActive ? s.days : 0;
  const daysColor = !s.isActive ? "#F87171" : (s.days <= 3 ? "#FBBF24" : "#38BDF8");

  const ph = (ov.phone || "").replace(/[^0-9+]/g, "");
  const wa = ph ? "https://wa.me/" + ph.replace(/^0/, "964").replace(/^\+/, "") : "";
  const curProfId = Number(ac.profile_id || 0);
  const profOpts = profilesCache.length
    ? profilesCache.map(p => `<option value="${p.id}" ${Number(p.id) === curProfId ? "selected" : ""}>${p.name}</option>`).join("")
    : `<option value="">${s.profile}</option>`;

  box.innerHTML = `
    <!-- Hero Card -->
    <div class="card" style="display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;align-items:center;gap:11px">
        <div class="avatar ${avCls}" style="width:46px;height:46px;font-size:18px">${s.initial}</div>
        <div>
          <div style="font-size:16px;font-weight:800">${s.fullName}</div>
          <div style="font-size:12px;color:#94A3B8;margin-top:2px" dir="ltr">
            <span style="cursor:pointer" onclick="copyField('${s.username}', this)">📋</span> ${s.username}
          </div>
          <div style="font-size:11.5px;font-weight:700;color:${stColor};margin-top:3px">${stTxt}</div>
        </div>
      </div>
      <div style="text-align:center">
        <div style="font-size:24px;font-weight:800;color:${daysColor};line-height:1.1">${daysNum}</div>
        <div style="font-size:11px;color:#94A3B8">يوم متبقي</div>
      </div>
    </div>

    <!-- Network Info -->
    <div class="card">
      <div class="sec-hd">🌐 معلومات الشبكة</div>
      <div class="kv-row"><span>الحالة</span><b style="color:${s.isOnline ? '#4ADE80' : '#94A3B8'}">${s.isOnline ? '● متصل' : '● غير متصل'}</b></div>
      <div class="kv-row"><span>الآيبي</span><b dir="ltr"><span style="cursor:pointer" onclick="copyField('${s.ip}', this)">📋</span> ${s.ip || '—'}</b></div>
      <div class="kv-row"><span>Caller-ID / MAC</span><b dir="ltr"><span style="cursor:pointer" onclick="copyField('${s.mac}', this)">📋</span> ${s.mac || '—'}</b></div>
      <div class="kv-row"><span>الخدمة</span><b dir="ltr">PPPoE</b></div>
      <div class="kv-row"><span>الاستخدام الحالي</span><b dir="ltr"><span style="color:#38BDF8">↓ ${s.dn.toFixed(2)}</span> <span style="color:#4ADE80">↑ ${s.up.toFixed(2)}</span> Mbps</b></div>
      <div class="kv-row"><span>مدة الجلسة</span><b dir="ltr">${fmtSessionHMS(s.uptime)}</b></div>
      <div class="kv-row" style="border:none;padding-bottom:0"><span>سيرفر NAS</span><b dir="ltr">${s.nas || '—'}</b></div>
    </div>

    <!-- Subscription Summary -->
    <div class="card">
      <div class="sec-hd">📦 ملخص الاشتراك</div>
      <div class="kv-row"><span>الباقة</span><b dir="ltr">${s.profile}</b></div>
      <div class="kv-row"><span>سعر التجديد (30 يوم)</span><b dir="ltr" style="color:#38BDF8">${priceTxt}</b></div>
      <div class="kv-row"><span>الاستهلاك اليومي</span><b dir="ltr">${fmtBytes(s.traffic)}</b></div>
      <div class="kv-row"><span>تاريخ الانتهاء</span><b dir="ltr">${s.expiration || '—'}</b></div>
      <div class="kv-row" style="border:none;padding-bottom:0"><span>الأيام المتبقية</span><b>${s.days} يوم</b></div>
    </div>

    <!-- Account & Contact -->
    <div class="card">
      <div class="sec-hd">🔑 معلومات الحساب والتواصل</div>
      <div class="kv-row"><span>اسم المستخدم</span><b dir="ltr"><span style="cursor:pointer" onclick="copyField('${s.username}', this)">📋</span> ${s.username}</b></div>
      <div class="kv-row">
        <span>كلمة السر</span>
        <div style="display:flex;align-items:center;gap:7px">
          <b id="detPassTxt" dir="ltr" data-pass="${ov.password || ''}" data-shown="0">••••••</b>
          <button type="button" class="btn btn-sm" style="background:rgba(56,189,248,.14);color:#38BDF8;padding:3px 9px;font-size:11px" onclick="toggleDetPass(this)">إظهار</button>
        </div>
      </div>
      <div class="kv-row">
        <span>رقم الهاتف</span>
        <b dir="ltr">${ph ? `${ov.phone} <a href="tel:${ph}" style="color:#38BDF8;text-decoration:none;margin-right:6px">اتصال</a> <a href="${wa}" target="_blank" style="color:#4ADE80;text-decoration:none">واتساب</a>` : '—'}</b>
      </div>
      <div class="kv-row"><span>العنوان</span><b>${ov.address || '—'}</b></div>
      <div class="kv-row"><span>آخر ظهور</span><b dir="ltr">${ov.last_online || '—'}</b></div>
      <div class="kv-row"><span>معرف الحساب (ID)</span><b dir="ltr" style="color:#94A3B8">#${uid}</b></div>
      <div class="kv-row"><span>تاريخ الإنشاء</span><b dir="ltr">${ov.created_at || '—'}</b></div>
      <div class="kv-row" style="border:none;padding-bottom:0"><span>أنشئ بواسطة</span><b dir="ltr">${ov.created_by || '—'}</b></div>
    </div>

    <!-- Instant Actions -->
    <div class="card">
      <div class="sec-hd">⚡ إدارة الاشتراك والعمليات الفورية</div>
      <button id="detActBtn" type="button" class="btn" style="background:rgba(34,197,94,.16);border:1px solid rgba(34,197,94,.45);color:#4ADE80;margin-bottom:9px" onclick="detailDoActivate(${uid}, ${price})">
        ✓ تفعيل الاشتراك بالرصيد (${priceTxt})
      </button>
      <button id="detExtBtn" type="button" class="btn" style="background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.45);color:#FCD34D;margin-bottom:12px" onclick="detailDoExtend(${uid}, ${cached.extId})">
        ⏱ تمديد مؤقت بالنقاط (${cached.extName})
      </button>
      <label style="margin-bottom:5px">تغيير الباقة فوراً:</label>
      <select id="detProfSel" dir="ltr" style="margin-bottom:9px">${profOpts}</select>
      <button id="detProfBtn" type="button" class="btn" style="margin-bottom:9px" onclick="detailDoProfile(${uid})">
        ⇄ تنفيذ تغيير الباقة الآن
      </button>
      ${s.isOnline && s.rad ? `
        <button type="button" class="btn btn-red" onclick="detailDoDisconnect(${uid}, ${s.rad})">
          ⚡ فصل اتصال المشترك (DISCONNECT)
        </button>` : ""}
      <div id="detActMsg" class="status" style="display:none"></div>
    </div>
  `;
}

function toggleDetPass(btn) {
  const el = document.getElementById("detPassTxt");
  if (!el) return;
  const shown = el.getAttribute("data-shown") === "1";
  const pass = el.getAttribute("data-pass") || "—";
  if (shown) {
    el.textContent = "••••••";
    el.setAttribute("data-shown", "0");
    btn.textContent = "إظهار";
  } else {
    el.textContent = pass || "—";
    el.setAttribute("data-shown", "1");
    btn.textContent = "إخفاء";
    if (pass) navigator.clipboard.writeText(pass);
  }
}

function setDetActionMsg(txt, ok) {
  const el = document.getElementById("detActMsg");
  if (!el) return;
  el.style.display = "block";
  el.style.color = ok ? "#4ADE80" : "#FCA5A5";
  el.textContent = txt;
}

async function detailDoActivate(uid, pr) {
  if (!confirm("تأكيد تفعيل اشتراك المشترك بالرصيد؟")) return;
  const b = document.getElementById("detActBtn"); if (b) b.disabled = true;
  setDetActionMsg("جاري تفعيل الاشتراك...", true);
  const r = await sasReq("POST", "user/activate", { method: "credit", pin: "", user_id: String(uid), money_collected: 1, comments: null, user_price: pr, issue_invoice: 0, transaction_id: uuid(), activation_units: 1 });
  if (b) b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) {
    setDetActionMsg("تم تفعيل اشتراك المشترك بنجاح ✓", true);
    refreshAll();
    setTimeout(() => openDetails(uid), 700);
  } else setDetActionMsg(trMsg(r.json && r.json.message), false);
}

async function detailDoExtend(uid, eid) {
  if (!confirm("تأكيد التمديد المؤقت بالنقاط؟")) return;
  const b = document.getElementById("detExtBtn"); if (b) b.disabled = true;
  setDetActionMsg("جاري التمديد بالنقاط...", true);
  const r = await sasReq("POST", "user/extend", { user_id: String(uid), profile_id: String(eid), method: "reward_points", transaction_id: uuid() });
  if (b) b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) {
    setDetActionMsg("تم تمديد الاشتراك بنجاح ✓", true);
    refreshAll();
    setTimeout(() => openDetails(uid), 700);
  } else setDetActionMsg(trMsg(r.json && r.json.message), false);
}

async function detailDoProfile(uid) {
  const pid = Number(document.getElementById("detProfSel").value);
  if (!pid) return;
  const b = document.getElementById("detProfBtn"); if (b) b.disabled = true;
  setDetActionMsg("جاري تغيير الباقة فوراً...", true);
  const r = await sasReq("POST", "user/changeProfile", { user_id: String(uid), profile_id: pid, change_type: "immediate" });
  if (b) b.disabled = false;
  if (r.ok && r.json && Number(r.json.status) === 200) {
    setDetActionMsg("تم تغيير الباقة فوراً بنجاح ✓", true);
    refreshAll();
    setTimeout(() => openDetails(uid), 700);
  } else setDetActionMsg(trMsg(r.json && r.json.message), false);
}

async function detailDoDisconnect(uid, rad) {
  if (!confirm("تأكيد فصل اتصال المشترك؟")) return;
  setDetActionMsg("جاري فصل الاتصال...", true);
  await sasReq("GET", "user/disconnect/acctid/" + rad);
  setDetActionMsg("تم فصل اتصال المشترك", true);
  loadSubs(true);
  setTimeout(() => openDetails(uid), 800);
}

/* Subscriber Device Tab */
function renderDeviceTab(box, s) {
  const defUser = devCfg.type === "mimosa" ? "admin" : "ubnt";
  const curUser = devCfg.user || defUser;
  const ipStatus = s.isOnline && s.ip
    ? `<span style="color:#4ADE80;font-weight:700">● متصل: <span dir="ltr">${s.ip}</span></span>`
    : `<span style="color:#94A3B8">● غير متصل حالياً</span>`;

  box.innerHTML = `
    <div class="card">
      <div style="font-size:15.5px;font-weight:800;color:#38BDF8;margin-bottom:6px">إعداد وربط جهاز المشترك (${s.fullName})</div>
      <div style="font-size:12px;color:#94A3B8;line-height:1.6;margin-bottom:14px">
        عند ربط الجهاز ستظهر إشارة البرج وسرعة الثروبوت الفعلية (Download / Upload) مباشرة على بطاقة المشترك.
      </div>

      <label style="margin-bottom:6px">نوع الجهاز:</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:13px">
        <button type="button" class="seg-opt ${devCfg.type === 'ubnt' ? 'on' : ''}" dir="ltr" onclick="setDevType('ubnt')">Ubiquiti (airOS)</button>
        <button type="button" class="seg-opt ${devCfg.type === 'mimosa' ? 'on' : ''}" dir="ltr" onclick="setDevType('mimosa')">Mimosa</button>
      </div>

      <label style="margin-bottom:6px">بروتوكول الاتصال:</label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:13px">
        <button type="button" class="seg-opt ${devCfg.proto === 'https' ? 'on' : ''}" dir="ltr" onclick="setDevProto('https')">HTTPS</button>
        <button type="button" class="seg-opt ${devCfg.proto === 'http' ? 'on' : ''}" dir="ltr" onclick="setDevProto('http')">HTTP</button>
        <button type="button" class="seg-opt ${devCfg.proto === 'ssh' ? 'on' : ''}" dir="ltr" onclick="setDevProto('ssh')">SSH</button>
      </div>

      <div style="background:#080C12;border:1px solid #1E293B;border-radius:13px;padding:12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:13px;font-weight:700">آيبي تلقائي (من جلسة المشترك)</div>
          <div style="font-size:11.5px;margin-top:3px">${ipStatus}</div>
        </div>
        <button type="button" class="sw-track ${devCfg.autoIp ? 'on' : ''}" onclick="toggleDevAutoIp()">
          <span class="sw-knob"></span>
        </button>
      </div>

      ${!devCfg.autoIp ? `
        <div class="fld-box">
          <div class="fld-cap">عنوان الآيبي اليدوي (IP)</div>
          <input id="devManualIp" type="text" dir="ltr" value="${devCfg.manualIp || ''}" placeholder="10.28.129.41" style="border:none;padding:2px 0;margin:0;background:transparent">
        </div>` : ""}

      <div class="fld-box">
        <div class="fld-cap">اسم المستخدم (الافتراضي: ${defUser})</div>
        <input id="devUserInp" type="text" dir="ltr" value="${curUser}" style="border:none;padding:2px 0;margin:0;background:transparent">
      </div>

      <div class="fld-box" style="display:flex;align-items:center;gap:8px">
        <input id="devPassInp" type="password" dir="ltr" value="${devCfg.pass || ''}" placeholder="كلمة المرور (Password)" style="border:none;padding:4px 0;margin:0;background:transparent;flex:1">
        <button type="button" style="background:none;border:none;color:#38BDF8;font-size:12px;font-weight:700;cursor:pointer" onclick="toggleDevPassInp(this)">إظهار</button>
      </div>

      <button type="button" class="btn" style="margin-top:4px" onclick="connectSubscriberDevice(${s.id})">
        اتصال وعرض التبويبات الأربعة
      </button>
      <div id="devConnBox" style="margin-top:11px"></div>
    </div>
  `;
}

function setDevType(t) {
  devCfg.type = t;
  if (!devCfg.user || devCfg.user === "ubnt" || devCfg.user === "admin") {
    devCfg.user = (t === "mimosa") ? "admin" : "ubnt";
  }
  renderDetailBody();
}

function setDevProto(p) {
  devCfg.proto = p;
  renderDetailBody();
}

function toggleDevAutoIp() {
  devCfg.autoIp = !devCfg.autoIp;
  renderDetailBody();
}

function toggleDevPassInp(btn) {
  const inp = document.getElementById("devPassInp");
  if (!inp) return;
  const isPwd = inp.type === "password";
  inp.type = isPwd ? "text" : "password";
  btn.textContent = isPwd ? "إخفاء" : "إظهار";
}

function switchDevSubTab(tab) {
  activeDevSubTab = tab;
  document.querySelectorAll(".dev4-tab").forEach(b => b.classList.remove("on"));
  const btn = document.getElementById("d4-" + tab);
  if (btn) btn.classList.add("on");
  document.querySelectorAll(".dev4-pane").forEach(p => p.style.display = "none");
  const pane = document.getElementById("p4-" + tab);
  if (pane) pane.style.display = "block";
}

async function connectSubscriberDevice(uid) {
  const s = allSubs.find(x => x.id === uid);
  if (!s) return;
  const uInp = document.getElementById("devUserInp");
  const pInp = document.getElementById("devPassInp");
  const mInp = document.getElementById("devManualIp");
  if (uInp) devCfg.user = uInp.value.trim();
  if (pInp) devCfg.pass = pInp.value;
  if (mInp) devCfg.manualIp = mInp.value.trim();
  saveDevCfg(uid);

  const ip = devCfg.autoIp ? (s.ip || "") : (devCfg.manualIp || "");
  const out = document.getElementById("devConnBox");
  if (!ip) {
    out.innerHTML = `<div class="status" style="color:#FCA5A5">لا يوجد عنوان IP متاح للجهاز حالياً (المشترك غير متصل أو لم يتم إدخال IP يدوي).</div>`;
    return;
  }

  const scheme = devCfg.proto === "ssh" ? "http" : devCfg.proto;
  const url = `${scheme}://${ip}`;
  out.innerHTML = `<div class="status" style="color:#38BDF8">تم حفظ إعدادات الجهاز (${devCfg.type.toUpperCase()} • ${ip}) وجاري محاولة الاتصال...</div>`;

  let info = null;
  try {
    const r = await apiCall("GET", url + "/status.cgi", null, false);
    if (r.ok && r.json) info = r.json;
  } catch (e) {}

  const host = (info && info.host && info.host.hostname) || s.fullName;
  const fw = (info && info.host && info.host.fwversion) || (devCfg.type === "mimosa" ? "Mimosa OS" : "airOS");
  const sig = (info && info.wireless && info.wireless.signal) ? info.wireless.signal + " dBm" : "—";
  const noise = (info && info.wireless && info.wireless.noisef) ? info.wireless.noisef + " dBm" : "—";
  const ccq = (info && info.wireless && info.wireless.ccq) ? (Number(info.wireless.ccq) / 10).toFixed(1) + "%" : "—";

  out.innerHTML = `
    <div style="background:#080C12;border:1px solid #1E293B;border-radius:13px;padding:11px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px">
        <button id="d4-basic" type="button" class="dev4-tab on" onclick="switchDevSubTab('basic')">الأساسية</button>
        <button id="d4-signal" type="button" class="dev4-tab" onclick="switchDevSubTab('signal')">الإشارة</button>
        <button id="d4-net" type="button" class="dev4-tab" onclick="switchDevSubTab('net')">الشبكة</button>
        <button id="d4-sys" type="button" class="dev4-tab" onclick="switchDevSubTab('sys')">النظام</button>
      </div>
      <div id="p4-basic" class="dev4-pane">
        <div class="kv-row"><span>اسم الجهاز</span><b dir="ltr">${host}</b></div>
        <div class="kv-row"><span>النوع</span><b dir="ltr">${devCfg.type === 'mimosa' ? 'Mimosa' : 'Ubiquiti (airOS)'}</b></div>
        <div class="kv-row" style="border:none;padding-bottom:0"><span>السرعة الحية</span><b dir="ltr">↓ ${s.dn.toFixed(1)} / ↑ ${s.up.toFixed(1)} Mbps</b></div>
      </div>
      <div id="p4-signal" class="dev4-pane" style="display:none">
        <div class="kv-row"><span>قوة الإشارة (Signal)</span><b dir="ltr" style="color:#4ADE80">${sig}</b></div>
        <div class="kv-row"><span>الضوضاء (Noise)</span><b dir="ltr">${noise}</b></div>
        <div class="kv-row" style="border:none;padding-bottom:0"><span>جودة الرابط (CCQ)</span><b dir="ltr">${ccq}</b></div>
      </div>
      <div id="p4-net" class="dev4-pane" style="display:none">
        <div class="kv-row"><span>عنوان IP</span><b dir="ltr">${ip}</b></div>
        <div class="kv-row"><span>MAC</span><b dir="ltr">${s.mac || '—'}</b></div>
        <div class="kv-row" style="border:none;padding-bottom:0"><span>البروتوكول</span><b dir="ltr">${devCfg.proto.toUpperCase()}</b></div>
      </div>
      <div id="p4-sys" class="dev4-pane" style="display:none">
        <div class="kv-row"><span>النظام</span><b dir="ltr">${fw}</b></div>
        <div class="kv-row"><span>المستخدم المحفوظ</span><b dir="ltr">${devCfg.user}</b></div>
        <div class="kv-row" style="border:none;padding-bottom:0"><span>مدة الجلسة</span><b dir="ltr">${fmtSessionHMS(s.uptime)}</b></div>
      </div>
      ${!info ? `
        <div style="font-size:11px;color:#FBBF24;margin-top:9px;line-height:1.5">
          ملاحظة: الآيبي الداخلي (${ip}) لا يمكن الوصول إليه من السحابة الخارجية؛ لفتحه من شبكتك المحلية اضغط أدناه:
        </div>
        <a href="${url}" target="_blank" class="btn btn-sm btn-ghost" style="display:block;text-align:center;text-decoration:none;margin-top:8px;color:#38BDF8">
          فتح واجهة الجهاز مباشرة (${url})
        </a>` : ""}
    </div>
  `;
}
