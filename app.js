(() => {
"use strict";
const $ = s => document.querySelector(s);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const smooth = t => t*t*(3-2*t);
const newId = () => "p" + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const LETTERS = "ABCD";
const shuffle = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

/* ================= Markdown ================= */
const MDC = {red:"#D0384F", green:"#2FA878", blue:"#3B7DD8", gold:"#E0A526", yellow:"#E0A526", orange:"#E0782E", purple:"#8E5BD6", teal:"#2F8F8A", pink:"#D6508E", gray:"#7A8584", grey:"#7A8584"};
const MD_RULES = [
  {re:/`([^`]+)`/, k:"code"},
  {re:/\*\*(.+?)\*\*/, k:"b"},
  {re:/__(.+?)__/, k:"u"},
  {re:/~~(.+?)~~/, k:"s"},
  {re:/==(.+?)==/, k:"hl"},
  {re:/\{(#[0-9a-fA-F]{3,6}|[a-zA-Z]+)\|(.+?)\}/, k:"color"},
  {re:/\*([^*\s](?:[^*]*?[^*\s])?)\*/, k:"i"},
];
function parseMd(src, st, out){
  st = st || {}; out = out || [];
  let s = String(src ?? "");
  let guard = 0;
  while (s && guard++ < 200) {
    let best = null;
    for (const r of MD_RULES) { const m = r.re.exec(s); if (m && (!best || m.index < best.m.index)) best = {m, r}; }
    if (!best) { out.push({...st, t:s}); break; }
    const {m, r} = best;
    if (m.index) out.push({...st, t:s.slice(0, m.index)});
    if (r.k === "code") out.push({...st, code:true, t:m[1]});
    else if (r.k === "color") {
      const c = m[1][0] === "#" ? m[1] : MDC[m[1].toLowerCase()];
      if (c) parseMd(m[2], {...st, color:c}, out); else out.push({...st, t:m[0]});
    } else parseMd(m[1], {...st, [r.k]:true}, out);
    s = s.slice(m.index + m[0].length);
  }
  return out;
}
function mdHtml(src){
  return parseMd(src).map(r => {
    let h = esc(r.t);
    if (r.code) h = `<code>${h}</code>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.u) h = `<u>${h}</u>`;
    if (r.s) h = `<s>${h}</s>`;
    if (r.hl) h = `<mark>${h}</mark>`;
    if (r.color) h = `<span class="c" style="color:${r.color}">${h}</span>`;
    return h;
  }).join("");
}
const plain = src => parseMd(src).map(r => r.t).join("");

/* ================= Question model ================= */
const qType = q => q.type === "tf" || q.type === "multi" ? q.type : (Array.isArray(q.answer) ? "multi" : "mc");
const answersOf = q => Array.isArray(q.answer) ? q.answer : [q.answer];
function autoTime(q){
  const words = plain(q.q).trim().split(/\s+/).length;
  const cc = q.choices.map(plain).join("").length;
  return clamp(Math.round((2.6 + words*0.32 + cc*0.05 + (qType(q)==="multi" ? 1.5 : 0))*2)/2, 4, 15);
}
const DIFF = {easy:{time:0.9, pts:0.75, label:"Easy"}, hard:{time:1.3, pts:1.75, label:"Hard"}};
const qTime = q => (q.time ? clamp(+q.time,3,20) : autoTime(q)) * (DIFF[q.difficulty]?.time || 1);

function normType(t){
  t = String(t || "").toLowerCase().replace(/[\s_-]/g, "");
  if (["tf","truefalse","boolean","bool"].includes(t)) return "tf";
  if (["multi","multiple","multicorrect","any","anycorrect","checkbox"].includes(t)) return "multi";
  return "";
}
function normQuestion(raw){
  if (!raw || typeof raw !== "object") throw "is not an object";
  const q = String(raw.q ?? raw.question ?? raw.text ?? raw.prompt ?? "").trim();
  if (!q) throw "is missing its question text";
  let type = normType(raw.type);
  let choices = raw.choices ?? raw.options ?? raw.answers ?? raw.doors;
  let a = raw.answer ?? raw.correct ?? raw.correctIndex ?? raw.answerIndex ?? raw.answers_correct;
  if (!type && typeof a === "boolean") type = "tf";
  if (!type && Array.isArray(choices) && choices.length === 2 && /^true$/i.test(String(choices[0]).trim()) && /^false$/i.test(String(choices[1]).trim())) type = "tf";
  const out = {q: q.slice(0,260)};
  if (type === "tf") {
    out.type = "tf"; out.choices = ["True","False"];
    if (typeof a === "string") { const t = a.trim().toLowerCase(); a = ["true","t","yes","a","0"].includes(t) ? 0 : ["false","f","no","b","1"].includes(t) ? 1 : NaN; }
    else if (typeof a === "boolean") a = a ? 0 : 1;
    if (a !== 0 && a !== 1) throw "needs “answer”: true or false";
    out.answer = a;
  } else {
    if (!Array.isArray(choices)) throw "needs a “choices” list";
    choices = choices.map(c => String(c ?? "").trim()).filter(Boolean);
    if (choices.length < 2 || choices.length > 4) throw "needs 2–4 choices";
    const res = v => {
      if (typeof v === "string") {
        const t = v.trim(), i = choices.findIndex(c => c.toLowerCase() === t.toLowerCase());
        if (i >= 0) return i; if (/^\d+$/.test(t)) return +t; if (/^[A-Da-d]$/.test(t)) return "abcd".indexOf(t.toLowerCase());
        return NaN;
      }
      return v;
    };
    if (Array.isArray(a) && !type) type = "multi";
    if (type === "multi") {
      const arr = [...new Set((Array.isArray(a) ? a : [a]).map(res))];
      if (!arr.length || arr.some(i => !Number.isInteger(i) || i < 0 || i >= choices.length)) throw "needs “answer” as a list of correct choices (indexes, letters or text)";
      if (arr.length >= choices.length) throw "needs at least one wrong choice";
      out.type = "multi"; out.answer = arr.sort((x,y) => x-y);
    } else {
      a = res(a);
      if (!Number.isInteger(a) || a < 0 || a >= choices.length) throw "needs “answer” as a 0-based index, a letter (A–D) or the exact choice text";
      out.answer = a;
    }
    out.choices = choices.map(c => c.slice(0,80));
  }
  const t = raw.time ?? raw.duration ?? raw.seconds;
  if (t != null && t !== "" && !isNaN(+t)) out.time = clamp(+t,3,20);
  const d = String(raw.difficulty ?? raw.level ?? "").toLowerCase();
  if (d === "easy" || d === "hard") out.difficulty = d;
  const ex = raw.explain ?? raw.explanation ?? raw.why;
  if (ex && String(ex).trim()) out.explain = String(ex).trim().slice(0,300);
  return out;
}
function normPackOne(raw, fallbackTitle){
  if (!raw || typeof raw !== "object") throw "Pack is not an object";
  const qs = raw.questions;
  if (!Array.isArray(qs) || !qs.length) throw "Pack needs a non-empty “questions” list";
  const questions = qs.map((r,i) => { try { return normQuestion(r); } catch(e){ throw `Question ${i+1} ${e}`; } });
  return {title: String(raw.title || raw.name || fallbackTitle || "Imported pack").slice(0,60), description: String(raw.description || "").slice(0,140), questions};
}
function normImport(raw){
  if (Array.isArray(raw)) {
    if (raw.length && raw[0] && Array.isArray(raw[0].questions)) return raw.map(p => normPackOne(p));
    return [normPackOne({questions: raw})];
  }
  if (raw && Array.isArray(raw.packs)) return raw.packs.map(p => normPackOne(p));
  return [normPackOne(raw)];
}
function exportQ(q){
  const t = qType(q), o = {};
  if (t !== "mc") o.type = t;
  o.q = q.q;
  if (t === "tf") o.answer = q.answer === 0;
  else { o.choices = q.choices; o.answer = t === "multi" ? answersOf(q) : q.answer; }
  if (q.time) o.time = q.time;
  if (q.difficulty) o.difficulty = q.difficulty;
  if (q.explain) o.explain = q.explain;
  return o;
}
const exportable = p => ({title:p.title, description:p.description||"", questions:p.questions.map(exportQ)});

/* ================= Starter packs ================= */
const Q = (q, choices, answer, o) => ({q, choices, answer, ...(o||{})});
const TF = (q, val, explain, difficulty) => ({q, type:"tf", choices:["True","False"], answer: val ? 0 : 1, ...(explain ? {explain} : {}), ...(difficulty ? {difficulty} : {})});
const M = (q, choices, answer, o) => ({q, type:"multi", choices, answer, ...(o||{})});
const STARTERS = [
  {title:"True or false?", description:"Myths, facts and the occasional trick. Green curtain means true, red means false.", questions:[
    TF("**Lightning** never strikes the same place twice.", false, "Tall buildings like the Empire State Building get hit around 20 times a year."),
    TF("A {red|tomato} is botanically a *fruit*.", true, "It grows from the flower's ovary and carries seeds."),
    TF("Humans use only ==10%== of their brains.", false, "Brain scans show activity across virtually every region."),
    TF("The Great Wall of China is visible from the **Moon** with the naked eye.", false, "It's far too narrow. Astronauts confirm you can't see it from the Moon."),
    TF("Octopuses have **three** hearts.", true, "Two pump blood through the gills and one pumps it around the body."),
    TF("Venus spins in the *opposite* direction to most planets.", true, "Its rotation is retrograde, so the Sun rises in the west there.", "hard"),
    TF("Bats are **blind**.", false, "All bat species can see, and many also echolocate."),
    TF("Sound travels faster in {blue|water} than in air.", true, "About 1,480 m/s in water compared with 343 m/s in air.")]},
  {title:"World capitals", description:"Where do the governments actually sit?", questions:[
    Q("Capital of **Australia**?",["Sydney","Canberra","Melbourne"],1,{explain:"Canberra was purpose-built as a compromise between Sydney and Melbourne."}),
    Q("Capital of **Canada**?",["Toronto","Ottawa","Vancouver","Montreal"],1),
    Q("Capital of **Japan**?",["Kyoto","Osaka","Tokyo"],2,{difficulty:"easy"}),
    Q("Capital of **Brazil**?",["Rio de Janeiro","São Paulo","Brasília"],2,{explain:"Brasília replaced Rio de Janeiro as the capital in 1960."}),
    Q("Capital of **Kazakhstan**?",["Almaty","Astana","Shymkent"],1,{explain:"Astana has been the capital since 1997. Almaty is the largest city."}),
    TF("{red|Istanbul} is the capital of Turkey.", false, "The capital is Ankara. Istanbul is the largest city."),
    Q("Capital of **Uzbekistan**?",["Samarkand","Tashkent","Bukhara"],1,{difficulty:"easy"}),
    Q("Capital of **New Zealand**?",["Auckland","Wellington","Christchurch"],1),
    Q("Capital of **Morocco**?",["Casablanca","Marrakesh","Rabat","Fez"],2,{difficulty:"hard"}),
    M("Which of these are *capital cities*?",["Lagos","Nairobi","Lima","Sydney"],[1,2],{explain:"Nigeria's capital is Abuja and Australia's is Canberra."})]},
  {title:"Quick math", description:"Mental arithmetic at running speed.", questions:[
    Q("7 × 8 = ?",["54","56","64"],1,{difficulty:"easy"}),
    Q("==15%== of 200?",["20","30","35"],1),
    Q("√144 = ?",["12","14","11"],0),
    Q("2¹⁰ = ?",["1000","1024","512"],1,{explain:"Doubling ten times: 2, 4, 8 … 512, 1024."}),
    TF("Every square is a **rectangle**.", true, "A square is a rectangle whose four sides are equal."),
    Q("3/4 as a percent?",["34%","75%","70%"],1),
    Q("Next prime after **13**?",["15","17","19"],1),
    M("Which numbers are **even**?",["14","27","38","51"],[0,2],{difficulty:"easy"}),
    Q("12 × 12 − 44 = ?",["100","110","90"],0,{time:7})]},
  {title:"Science snacks", description:"Bite-sized facts from school science.", questions:[
    Q("Chemical symbol for {gold|gold}?",["Ag","Au","Gd"],1,{explain:"Au comes from the Latin *aurum*. Ag is silver."}),
    Q("Planet closest to the Sun?",["Venus","Mercury","Mars"],1),
    Q("Water boils at sea level at…",["90 °C","100 °C","110 °C"],1,{difficulty:"easy"}),
    Q("Which organelle makes most of the cell's **energy**?",["Nucleus","Ribosome","Mitochondria"],2),
    TF("Diamond is the hardest *natural* material.", true),
    Q("Plants absorb which gas for photosynthesis?",["Oxygen","CO₂","Nitrogen"],1),
    M("Which are **noble gases**?",["Neon","Nitrogen","Argon","Hydrogen"],[0,2],{difficulty:"hard",explain:"Noble gases sit in group 18: He, Ne, Ar, Kr, Xe and Rn."}),
    Q("Speed of light is about…",["300,000 km/s","30,000 km/s","3,000 km/s"],0)]},
  {title:"Code & tech", description:"For people who speak HTTP.", questions:[
    Q("HTTP status for “Not Found”?",["403","404","500"],1,{difficulty:"easy"}),
    Q("Python keyword to define a function?",["func","def","fn","function"],1),
    Q("Which is **NOT** a JavaScript type?",["undefined","symbol","char"],2),
    Q("Create a branch *and* switch to it:",["`git switch -c`","`git push -b`","`git merge -n`"],0,{time:8}),
    Q("SQL clause that filters **groups**?",["WHERE","HAVING","ORDER BY"],1,{explain:"WHERE filters rows before grouping. HAVING filters after it."}),
    Q("Time complexity of binary search?",["O(n)","O(log n)","O(n log n)"],1),
    TF("`0.1 + 0.2 === 0.3` is true in JavaScript.", false, "Floating point gives 0.30000000000000004.", "hard"),
    M("Which are **programming languages**?",["Rust","HTML","Kotlin","JSON"],[0,2],{explain:"HTML is markup and JSON is a data format."}),
    Q("Default HTTPS port?",["80","443","8080"],1)]}
];


/* ================= Storage (local-first) ================= */
const KEY = "curtainrun.v1";
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "pack";
let S = null;
function freshState(){
  return {ver:3, packs: STARTERS.map(p => ({...clone(p), id:"starter-" + slug(p.title), source:"starter", updatedAt:1})), deleted:{},
    stats:{best:0, runs:[], perPack:{}, answered:0, correct:0}, lastPack:null, mode:"pack", settings:{music:true, sfx:true, nickname:""}, updatedAt:0};
}
function migrate(st){
  if (!st.settings) st.settings = {music:true, sfx:true};
  if (!st.deleted) st.deleted = {};
  if ((st.ver||0) < 2) {
    for (const sp of STARTERS) {
      const ex = st.packs.find(p => p.source === "starter" && p.title === sp.title);
      if (ex) { ex.questions = clone(sp.questions); ex.description = sp.description; }
      else if (!st.packs.some(p => p.title === sp.title)) st.packs.push({...clone(sp), id:newId(), source:"starter", updatedAt:Date.now()});
    }
  }
  if ((st.ver||0) < 3) {
    // stable ids for starter packs, so two devices don't duplicate them when syncing
    for (const p of st.packs) if (p.source === "starter") {
      const nid = "starter-" + slug(p.title);
      if (p.id !== nid) {
        if (st.stats.perPack[p.id] != null) { st.stats.perPack[nid] = Math.max(st.stats.perPack[nid]||0, st.stats.perPack[p.id]); delete st.stats.perPack[p.id]; }
        if (st.lastPack === p.id) st.lastPack = nid;
        p.id = nid;
      }
    }
    const seen = new Set(); st.packs = st.packs.filter(p => seen.has(p.id) ? false : (seen.add(p.id), true));
    st.ver = 3;
  }
  return st;
}
function mergeState(a, b){
  if (!b || !Array.isArray(b.packs)) return a;
  b = migrate(clone(b));
  const o = clone(a);
  const del = {...(a.deleted||{})};
  for (const [k,v] of Object.entries(b.deleted||{})) del[k] = Math.max(del[k]||0, v);
  const map = new Map(a.packs.map(p => [p.id, p])), extra = [];
  for (const p of b.packs) { const m = map.get(p.id); if (!m) extra.push(p); else if ((p.updatedAt||0) > (m.updatedAt||0)) map.set(p.id, p); }
  o.packs = [...a.packs.map(p => map.get(p.id)), ...extra].filter(p => !(del[p.id] >= (p.updatedAt||0))).map(clone);
  o.deleted = del;
  const sa = a.stats || {}, sb = b.stats || {};
  const pp = {...(sa.perPack||{})};
  for (const [k,v] of Object.entries(sb.perPack||{})) pp[k] = Math.max(pp[k]||0, v);
  const runs = new Map();
  for (const r of [...(sa.runs||[]), ...(sb.runs||[])]) runs.set(r.at + ":" + r.score, r);
  o.stats = {best: Math.max(sa.best||0, sb.best||0), perPack: pp,
    answered: Math.max(sa.answered||0, sb.answered||0), correct: Math.max(sa.correct||0, sb.correct||0),
    totalRuns: Math.max(sa.totalRuns||(sa.runs||[]).length, sb.totalRuns||(sb.runs||[]).length),
    runs: [...runs.values()].sort((x,y) => y.at - x.at).slice(0,20)};
  if ((b.updatedAt||0) > (a.updatedAt||0)) o.settings = {...a.settings, ...b.settings};
  o.updatedAt = Math.max(a.updatedAt||0, b.updatedAt||0);
  return o;
}
try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
if (!S || !Array.isArray(S.packs)) S = freshState();
S = migrate(S);
const lsSet = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
lsSet();

/* ================= Cloud backends =================
   B.kind: "claude" (inside claude.ai), "supabase" (hosted build), or null (offline only).
   Everything always lives locally first; the cloud is a mirror once signed in. */
let B = null, downloadsCap = null, connecting = true, myLikes = {};
let syncTimer = 0, syncBusy = false, syncAgain = false, lastSync = 0, syncErr = "", syncBroken = false;
const splitKey = k => { const i = k.indexOf("~"); return [k.slice(0,i), k.slice(i+1)]; };
const nick = () => (S.settings.nickname || "").trim().slice(0,24) || "Player";

function claudeBackend(db, uid, userCap){
  let myPs = {plays:{}, likes:{}}, psBusy = Promise.resolve();
  const writePs = () => { psBusy = psBusy.then(() => db.doc("pstats/" + uid).set(clone(myPs))).catch(() => {}); };
  return {
    kind:"claude", uid,
    signedIn: () => !!uid,
    async load(){ const s = await db.doc(`data/users/${uid}/state`).get(); return s.exists ? clone(s.data()) : null; },
    async save(st){ await db.doc(`data/users/${uid}/state`).set(st); },
    async list(){
      const [snap, ps] = await Promise.all([db.collection("public").limit(300).get(), db.collection("pstats").limit(1000).get().catch(() => null)]);
      const agg = {};
      for (const d of ps?.docs || []) {
        const data = d.data() || {};
        for (const [k,n] of Object.entries(data.plays || {})) (agg[k] ||= {plays:0, likes:0}).plays += +n || 0;
        for (const [k,v] of Object.entries(data.likes || {})) if (v) (agg[k] ||= {plays:0, likes:0}).likes++;
        if (d.id === uid) myPs = {plays:{...(data.plays||{})}, likes:{...(data.likes||{})}};
      }
      myLikes = {...myPs.likes};
      const list = [];
      for (const d of snap.docs) {
        const data = d.data() || {};
        for (const [pid, p] of Object.entries(data.packs || {})) {
          if (!p || !Array.isArray(p.questions)) continue;
          const key = `${d.id}~${pid}`;
          list.push({pid, ownerId:d.id, key, authorLabel:data.authorLabel || "", title:p.title, description:p.description, questions:p.questions, updatedAt:p.updatedAt || 0, plays:agg[key]?.plays||0, likes:agg[key]?.likes||0});
        }
      }
      const ids = [...new Set(list.filter(x => !x.authorLabel).map(x => x.ownerId))];
      let profs = {};
      if (userCap?.profiles && ids.length) { try { profs = await userCap.profiles(ids); } catch {} }
      for (const x of list) x.author = x.authorLabel || (x.ownerId === uid ? "You" : (profs[x.ownerId]?.name || "Someone"));
      return list;
    },
    async publish(p){
      const ref = db.doc("public/" + uid), snap = await ref.get();
      const data = snap.exists ? clone(snap.data()) : {};
      data.ownerId = uid; data.packs = data.packs || {};
      data.packs[p.id] = {...exportable(p), updatedAt: Date.now()};
      await ref.set(data);
    },
    async unpublish(p){
      const ref = db.doc("public/" + uid), snap = await ref.get();
      if (snap.exists) { const data = clone(snap.data()); if (data.packs) delete data.packs[p.id]; await ref.set(data); }
    },
    play(key){ myPs.plays[key] = (myPs.plays[key]||0) + 1; writePs(); },
    async like(key, on){ if (on) myPs.likes[key] = true; else delete myPs.likes[key]; writePs(); },
  };
}

function supaBackend(sb){
  const b = {
    kind:"supabase", uid:null, email:null, sb,
    signedIn: () => !!b.uid,
    async load(){ const {data, error} = await sb.from("saves").select("state").eq("user_id", b.uid).maybeSingle(); if (error) throw error; return data?.state || null; },
    async save(st){ const {error} = await sb.from("saves").upsert({user_id:b.uid, state:st, updated_at:new Date().toISOString()}); if (error) throw error; },
    async list(){
      const {data, error} = await sb.from("pack_list").select("*").order("updated_at", {ascending:false}).limit(300);
      if (error) throw error;
      myLikes = {};
      if (b.uid) { const r = await sb.from("likes").select("owner_id,pack_id").eq("user_id", b.uid); for (const x of r.data || []) myLikes[x.owner_id + "~" + x.pack_id] = true; }
      return (data || []).map(r => ({key:r.owner_id + "~" + r.pack_id, ownerId:r.owner_id, pid:r.pack_id, author: r.owner_id === b.uid ? "You" : (r.author || "Someone"),
        title:r.title, description:r.description, questions:r.questions, updatedAt:Date.parse(r.updated_at) || 0, plays:r.plays || 0, likes:r.likes || 0}));
    },
    async publish(p){
      const {error} = await sb.from("packs").upsert({owner_id:b.uid, pack_id:p.id, author:nick(), title:p.title, description:p.description || "", questions:exportable(p).questions, updated_at:new Date().toISOString()}, {onConflict:"owner_id,pack_id"});
      if (error) throw error;
    },
    async unpublish(p){ const {error} = await sb.from("packs").delete().eq("owner_id", b.uid).eq("pack_id", p.id); if (error) throw error; },
    play(key){ const [o, pid] = splitKey(key); sb.rpc("bump_play", {p_owner:o, p_pack:pid}).then(() => {}, () => {}); },
    async like(key, on){
      const [o, pid] = splitKey(key);
      const r = on ? await sb.from("likes").insert({user_id:b.uid, owner_id:o, pack_id:pid}) : await sb.from("likes").delete().match({user_id:b.uid, owner_id:o, pack_id:pid});
      if (r.error && r.error.code !== "23505") throw r.error;
    },
    async sendCode(email){ const {error} = await sb.auth.signInWithOtp({email, options:{shouldCreateUser:true}}); if (error) throw error; },
    async verify(email, token){
      let r = await sb.auth.verifyOtp({email, token, type:"email"});
      if (r.error) { const r2 = await sb.auth.verifyOtp({email, token, type:"signup"}); if (!r2.error) return; }
      if (r.error) throw r.error;
    },
    async signOut(){ await sb.auth.signOut(); },
  };
  sb.auth.onAuthStateChange((ev, session) => {
    const u = session?.user, was = b.uid;
    b.uid = u?.id || null; b.email = u?.email || null;
    setTimeout(() => { if (b.uid && b.uid !== was) pullMerge(); renderAccount(); renderMenu(); }, 0);
  });
  return b;
}

function save(){
  S.updatedAt = Date.now(); lsSet();
  if (B && B.signedIn() && !syncBroken) { clearTimeout(syncTimer); syncTimer = setTimeout(pushSync, 1500); }
}
async function pushSync(){
  if (!B || !B.signedIn()) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true;
  try { await B.save(clone(S)); lastSync = Date.now(); syncErr = ""; }
  catch(e){ syncErr = e?.message || "Couldn't reach the server"; if (B.kind === "claude" && ["invalid_argument","revoked","not_granted"].includes(e?.code)) syncBroken = true; }
  syncBusy = false; renderAccount();
  if (syncAgain) { syncAgain = false; pushSync(); }
}
async function pullMerge(){
  if (!B || !B.signedIn()) return;
  try {
    const remote = await B.load();
    if (remote) { S = migrate(mergeState(S, remote)); lsSet(); refreshAll(); }
    await pushSync();
  } catch(e){ syncErr = e?.message || "Couldn't reach the server"; renderAccount(); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden && syncTimer && B?.signedIn()) { clearTimeout(syncTimer); syncTimer = 0; pushSync(); } });

async function connect(){
  const C = window.claude, CFG = window.CR_CONFIG || {};
  if (C && typeof C.use === "function") {
    let db = null, userCap = null, uid = null;
    try { [db, userCap, downloadsCap] = await Promise.all([C.use("db"), C.use("user"), C.use("downloads")]); } catch {}
    if (userCap) { try { uid = await userCap.id(); } catch {} }
    if (db && uid) { B = claudeBackend(db, uid, userCap); pullMerge(); }
  } else if (window.supabase?.createClient && CFG.supabaseUrl && CFG.supabaseAnonKey && !/YOUR-/.test(CFG.supabaseUrl) && !/PASTE-/.test(CFG.supabaseAnonKey)) {
    try {
      const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});
      B = supaBackend(sb);
      const {data} = await sb.auth.getSession();
      const u = data?.session?.user;
      if (u) { B.uid = u.id; B.email = u.email; pullMerge(); }
    } catch { B = null; }
  }
  connecting = false;
  renderMenu(); renderAccount();
  if (currentScreen === "lib") { renderMine(); if (libTab === "pub") loadPublic(); }
}

/* ================= Screens ================= */
let currentScreen = "menu";
const SCREENS = ["menu","pick","lib","edit","results","pause","help","account"];
function show(name){
  currentScreen = name;
  for (const s of SCREENS) $("#scr-"+s).hidden = s !== name;
  const inGame = name === "game" || name === "pause";
  $("#hud").hidden = !inGame; $("#powers").hidden = !inGame;
  if (name === "game") return;
  if (name === "menu") { renderMenu(); if (G.mode !== "attract") attract(); }
  if (name === "lib") renderMine();
  if (name === "pick") renderPick();
  if (name === "account") renderAccount();
}
document.addEventListener("click", e => { const go = e.target.closest("[data-go]"); if (go) { Snd.sfx("click"); show(go.dataset.go); } });
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2600);
}
function refreshAll(){ renderMenu(); if (currentScreen === "lib") renderMine(); if (currentScreen === "pick") renderPick(); }

/* ---------- install (home-screen app) ---------- */
let installEvt = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; renderMenu(); });
addEventListener("appinstalled", () => { installEvt = null; renderMenu(); toast("Installed. Open Curtain Run from your home screen."); });
$("#btnInstall").onclick = async () => {
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; renderMenu(); return; }
  modal(`<h2>Add to Home Screen</h2>
    <div class="help-grid">
      <div><span class="ic">1</span><span>In <b>Safari</b>, tap the <b>Share</b> button (the square with an arrow).</span></div>
      <div><span class="ic">2</span><span>Scroll down and tap <b>Add to Home Screen</b>.</span></div>
      <div><span class="ic">3</span><span>Tap <b>Add</b>. Curtain Run opens full screen from its icon, without the browser bars.</span></div>
    </div>
    <button class="btn primary" data-close>Got it</button>`);
};

/* ---------- menu ---------- */
function renderMenu(){
  const st = S.stats;
  $("#mBest").textContent = (st.best||0).toLocaleString();
  $("#mRuns").textContent = st.totalRuns || st.runs.length || 0;
  $("#mAcc").textContent = st.answered ? Math.round(100*st.correct/st.answered) + "%" : "–";
  $("#mRecent").innerHTML = st.runs.length ? st.runs.slice(0,4).map(r => `<li><span>${esc(r.pack)} <span class="muted">· ${r.correct}/${r.total}</span></span><span class="n">${r.score.toLocaleString()}</span></li>`).join("")
    : `<li><span class="muted">No runs yet. Pick a pack and go.</span><span></span></li>`;
  const acc = $("#btnAccount");
  acc.hidden = !(B && B.kind === "supabase");
  if (B?.kind === "supabase") acc.textContent = B.signedIn() ? "☁ Synced · " + nick() : "☁ Sign in to sync";
  $("#btnInstall").hidden = !(!(B?.kind === "claude") && !window.claude && !isStandalone() && (installEvt || isIOS()));
  $("#acctRow").hidden = acc.hidden && $("#btnInstall").hidden;
  paintToggles();
}
function paintToggles(){
  for (const [id,k] of [["#togMusic","music"],["#togSfx","sfx"]]) { const b = $(id); b.setAttribute("aria-pressed", !!S.settings[k]); b.querySelector("span").textContent = S.settings[k] ? "ON" : "OFF"; }
  $("#btnMute").textContent = (S.settings.music || S.settings.sfx) ? "♪" : "✕";
  $("#btnMute").setAttribute("aria-label", (S.settings.music || S.settings.sfx) ? "Mute" : "Unmute");
}
$("#togMusic").onclick = () => { S.settings.music = !S.settings.music; save(); paintToggles(); };
$("#togSfx").onclick = () => { S.settings.sfx = !S.settings.sfx; save(); paintToggles(); Snd.sfx("click"); };
$("#btnMute").onclick = () => { const on = !(S.settings.music || S.settings.sfx); S.settings.music = on; S.settings.sfx = on; save(); paintToggles(); };
$("#btnPlay").onclick = () => show("pick");
$("#btnLib").onclick = () => show("lib");
$("#btnHelp").onclick = () => show("help");
$("#btnAccount").onclick = () => show("account");

/* ---------- account (email + one-time code) ---------- */
let acct = {step:"email", email:"", cooldown:0, busy:false, err:""};
let cdTimer = 0;
function renderAccount(){
  if (currentScreen !== "account") return;
  const el = $("#acctBody");
  if (!B || B.kind !== "supabase") { el.innerHTML = `<p>Accounts aren't set up for this copy of the game. Everything is saved on this device.</p><button class="btn" data-go="menu">Back</button>`; return; }
  if (B.signedIn()) {
    el.innerHTML = `
      <p>Signed in as <b>${esc(B.email || "")}</b>. Your packs, scores and settings are backed up and sync to any device where you sign in with this email.</p>
      <div class="field"><label for="acNick">Name shown on packs you publish</label><div class="row"><input class="inp" id="acNick" maxlength="24" value="${esc(S.settings.nickname||"")}" placeholder="Player" style="flex:2"><button class="btn small" id="acNickSave" style="flex:0 0 auto">Save</button></div></div>
      <p class="hint">${syncErr ? `<span class="err">Last sync failed: ${esc(syncErr)}</span>` : lastSync ? `Last synced ${new Date(lastSync).toLocaleTimeString()}` : "Syncing…"}</p>
      <div class="row"><button class="btn" id="acSync">Sync now</button><button class="btn warn" id="acOut">Sign out</button></div>
      <button class="btn ghost" data-go="menu">Back to menu</button>`;
    $("#acNickSave").onclick = () => { S.settings.nickname = $("#acNick").value.trim(); save(); renderMenu(); toast("Name saved. It shows on packs you publish or update from now on."); };
    $("#acSync").onclick = async () => { await pullMerge(); toast(syncErr ? "Sync failed. Check your connection." : "Synced"); };
    $("#acOut").onclick = async () => { await pushSync(); await B.signOut(); acct = {step:"email", email:"", cooldown:0}; toast("Signed out. Your data is still on this device."); renderAccount(); renderMenu(); };
    return;
  }
  if (acct.step === "email") {
    el.innerHTML = `
      <p>You don't need an account to play: everything saves on this device. Sign in <b>once per device</b> to back up your progress, carry it to another phone, or publish packs.</p>
      <div class="field"><label for="acName">Your name <span class="muted" style="font-weight:400">(shown on packs you publish)</span></label><input class="inp" id="acName" maxlength="24" autocomplete="nickname" value="${esc(S.settings.nickname||"")}" placeholder="e.g. Daler"></div>
      <div class="field"><label for="acEmail">Email</label><input class="inp" id="acEmail" type="email" inputmode="email" autocomplete="email" value="${esc(acct.email)}" placeholder="you@example.com"></div>
      <p class="err">${esc(acct.err||"")}</p>
      <button class="btn primary big" id="acSend" ${acct.busy?"disabled":""}>${acct.busy ? "Sending…" : "Email me a code"}</button>
      <button class="btn ghost" data-go="menu">Not now</button>`;
    $("#acSend").onclick = sendCode;
    $("#acEmail").onkeydown = e => { if (e.key === "Enter") sendCode(); };
  } else {
    el.innerHTML = `
      <p>We sent a code to <b>${esc(acct.email)}</b>. It can take a minute, so check spam too.</p>
      <div class="field"><label for="acCode">Code</label><input class="inp code-inp" id="acCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••" value="${esc(acct.code||"")}"></div>
      <p class="err">${esc(acct.err||"")}</p>
      <button class="btn primary big" id="acVerify" ${acct.busy?"disabled":""}>${acct.busy ? "Checking…" : "Sign in"}</button>
      <div class="row"><button class="btn small" id="acResend" ${acct.cooldown>0?"disabled":""}>${acct.cooldown>0 ? `Resend in ${acct.cooldown}s` : "Resend code"}</button><button class="btn small ghost" id="acBack">Use another email</button></div>`;
    const inp = $("#acCode"); inp.focus();
    inp.oninput = () => { inp.value = inp.value.replace(/\D/g,""); acct.code = inp.value; if (inp.value.length === 6 && !acct.tried6) { acct.tried6 = true; verifyCode(); } };
    inp.onkeydown = e => { if (e.key === "Enter") verifyCode(); };
    $("#acVerify").onclick = verifyCode;
    $("#acResend").onclick = () => { acct.step = "email"; sendCode(); };
    $("#acBack").onclick = () => { acct.step = "email"; acct.err = ""; renderAccount(); };
  }
}
async function sendCode(){
  const email = ($("#acEmail")?.value ?? acct.email).trim();
  if ($("#acName")) S.settings.nickname = $("#acName").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { acct.err = "Enter a valid email address."; renderAccount(); return; }
  acct.email = email; acct.busy = true; acct.err = ""; renderAccount();
  try {
    await B.sendCode(email);
    acct.step = "code"; acct.cooldown = 60; acct.code = ""; acct.tried6 = false;
    clearInterval(cdTimer); cdTimer = setInterval(() => { acct.cooldown--; const r = $("#acResend"); if (r) { r.disabled = acct.cooldown > 0; r.textContent = acct.cooldown > 0 ? `Resend in ${acct.cooldown}s` : "Resend code"; } if (acct.cooldown <= 0) clearInterval(cdTimer); }, 1000);
  } catch(e){
    const m = e?.message || "";
    acct.err = /rate|seconds|too many/i.test(m) ? "Too many codes requested. Wait a minute and try again." : "Couldn't send the code. " + m;
  }
  acct.busy = false; save(); renderAccount();
}
async function verifyCode(){
  const code = ($("#acCode")?.value || "").trim();
  if (code.length < 6) { acct.err = "Enter the code from the email."; renderAccount(); return; }
  if (acct.busy) return;
  acct.busy = true; acct.err = ""; renderAccount();
  try { await B.verify(acct.email, code); acct.step = "email"; acct.code = ""; toast("Signed in. Syncing your progress…"); }
  catch(e){ acct.err = /expired|invalid/i.test(e?.message||"") ? "That code didn't work. Use the code from the newest email (each resend replaces the old code), or tap Resend." : "Couldn't sign in. " + (e?.message || ""); }
  acct.busy = false; renderAccount();
}

/* ---------- pack picker ---------- */
function renderPick(){
  if (!S.packs.find(p => p.id === S.lastPack)) S.lastPack = S.packs[0]?.id || null;
  $("#pickList").innerHTML = S.packs.length ? S.packs.map(p => `<button class="pick" data-id="${p.id}" aria-pressed="${p.id===S.lastPack}"><b>${esc(p.title)}</b><span>${p.questions.length}Q · best ${(S.stats.perPack[p.id]||0).toLocaleString()}</span></button>`).join("")
    : `<div class="empty">Your library is empty. Create or download a pack first.</div>`;
  $("#btnStart").disabled = !S.lastPack;
  for (const b of $("#modeSeg").children) b.setAttribute("aria-pressed", b.dataset.mode === S.mode);
}
$("#pickList").onclick = e => { const b = e.target.closest(".pick"); if (!b) return; S.lastPack = b.dataset.id; Snd.sfx("click"); renderPick(); };
$("#pickList").ondblclick = e => { if (e.target.closest(".pick")) $("#btnStart").click(); };
$("#modeSeg").onclick = e => { const b = e.target.closest("button"); if (!b) return; S.mode = b.dataset.mode; renderPick(); };
$("#btnStart").onclick = () => { const p = S.packs.find(p => p.id === S.lastPack); if (p) { save(); startRun(p, S.mode); } };

/* ---------- library: mine ---------- */
let libTab = "mine";
function setTab(t){
  libTab = t;
  $("#tabMine").setAttribute("aria-selected", t==="mine"); $("#tabPub").setAttribute("aria-selected", t==="pub");
  $("#libMine").hidden = t !== "mine"; $("#libPub").hidden = t !== "pub";
  if (t === "pub") loadPublic(); else renderMine();
}
$("#tabMine").onclick = () => setTab("mine");
$("#tabPub").onclick = () => setTab("pub");
function typeSummary(p){
  const c = {tf:0, multi:0};
  for (const q of p.questions) { const t = qType(q); if (t in c) c[t]++; }
  return (c.tf ? ` · ${c.tf} true/false` : "") + (c.multi ? ` · ${c.multi} any-correct` : "");
}
function srcChip(p){
  const c = p.source === "downloaded" ? `<span class="chip dl">Downloaded</span>` : p.source === "starter" ? `<span class="chip starter">Starter</span>` : `<span class="chip mine">Mine</span>`;
  return c + (p.publishedAt ? `<span class="chip pub">Published</span>` : "");
}
const canPublishUi = () => !!B;
function renderMine(){
  const el = $("#mineList");
  if (!S.packs.length) { el.innerHTML = `<div class="empty">No packs yet. Make one, import a JSON file, or grab one from the Public tab.</div>`; return; }
  const canPub = canPublishUi();
  el.innerHTML = S.packs.map(p => `
    <article class="pack" data-id="${p.id}">
      <div class="pack-head"><div style="min-width:0;display:grid;gap:4px"><h3>${esc(p.title)}</h3><div class="meta">${srcChip(p)}<span class="muted">${p.questions.length} question${p.questions.length===1?"":"s"}${typeSummary(p)}</span><span class="muted">· best ${(S.stats.perPack[p.id]||0).toLocaleString()}</span></div></div>
        <button class="btn small primary" data-act="play">▶ Play</button></div>
      ${p.description ? `<p class="muted md">${mdHtml(p.description)}</p>` : ""}
      <div class="actions">
        <button class="btn small" data-act="edit">Edit</button>
        <button class="btn small" data-act="export">Export JSON</button>
        ${canPub ? `<button class="btn small" data-act="publish">${p.publishedAt ? "Update public copy" : "Publish"}</button>` : ""}
        ${canPub && p.publishedAt ? `<button class="btn small ghost" data-act="unpublish">Unpublish</button>` : ""}
        <button class="btn small warn" data-act="delete">Delete</button>
      </div>
    </article>`).join("");
}
function needSignIn(){
  if (B?.kind === "supabase" && !B.signedIn()) { toast("Sign in once to publish. It only takes an email code."); show("account"); return true; }
  return false;
}
$("#mineList").onclick = async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const id = b.closest(".pack").dataset.id, p = S.packs.find(x => x.id === id); if (!p) return;
  const act = b.dataset.act;
  if (act === "play") { S.lastPack = id; save(); startRun(p, S.mode); }
  else if (act === "edit") openEditor(p);
  else if (act === "export") openExport(p);
  else if (act === "delete") {
    if (b.dataset.armed) {
      if (p.publishedAt && B?.signedIn()) { try { await B.unpublish(p); } catch {} }
      S.packs = S.packs.filter(x => x.id !== id); S.deleted[id] = Date.now(); save(); renderMine(); toast("Pack deleted");
    } else { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = "Delete"; } }, 3000); }
  }
  else if (act === "publish") {
    if (needSignIn()) return;
    b.disabled = true;
    try { await B.publish(p); p.publishedAt = Date.now(); p.updatedAt = Date.now(); save(); toast("Published to the public library"); }
    catch(err){ toast("Couldn't publish. " + (err?.message || "Try again.")); }
    renderMine();
  }
  else if (act === "unpublish") {
    if (needSignIn()) return;
    b.disabled = true;
    try { await B.unpublish(p); delete p.publishedAt; p.updatedAt = Date.now(); save(); toast("Removed from the public library"); } catch { toast("Couldn't unpublish. Try again."); }
    renderMine();
  }
};
$("#btnNew").onclick = () => openEditor(null);
$("#btnImport").onclick = openImport;

/* ---------- library: public ---------- */
const FEATURED = [
  {pid:"space", title:"Space trivia", description:"Planets, moons and the people who went up there.", questions:[
    Q("Largest planet in the Solar System?",["Saturn","Jupiter","Neptune"],1,{explain:"Jupiter is more than twice as massive as all the other planets combined."}),
    Q("Name of **our** galaxy?",["Andromeda","Milky Way","Triangulum"],1,{difficulty:"easy"}),
    Q("First human in space?",["Neil Armstrong","Yuri Gagarin","Buzz Aldrin"],1,{explain:"Yuri Gagarin orbited Earth on 12 April 1961."}),
    TF("{red|Mars} is red because of iron oxide.", true, "Its surface dust is rich in rust."),
    Q("Sunlight reaches Earth in about…",["8 minutes","8 seconds","8 hours"],0),
    M("Which are **moons** of Jupiter?",["Europa","Titan","Io","Phobos"],[0,2],{difficulty:"hard",explain:"Titan orbits Saturn and Phobos orbits Mars."}),
    TF("There is no gravity on the ==International Space Station==.", false, "Gravity there is about 90% of Earth's. Astronauts float because they are in free fall.")]},
  {pid:"words", title:"Word power", description:"English vocabulary, one door at a time.", questions:[
    Q("Opposite of “*scarce*”?",["rare","plentiful","tiny"],1),
    Q("“**Ephemeral**” means…",["lasting briefly","very large","ancient"],0),
    M("Which are synonyms of “**candid**”?",["frank","sweet","honest","shy"],[0,2]),
    Q("“**Ubiquitous**” means…",["found everywhere","very rare","unique"],0),
    Q("Which is spelled {green|correctly}?",["accommodate","acommodate","accomodate"],0,{time:7})]},
].map(p => ({...p, ownerId:"team", key:"team~" + p.pid, author:"Curtain Run team", updatedAt:0, plays:0, likes:0, featured:true}));
let pubCache = [], pubLoading = false;
async function loadPublic(){
  if (!B) { pubCache = FEATURED.slice(); renderPublic(); return; }
  pubLoading = true; renderPublic();
  try {
    const list = await B.list();
    pubCache = B.kind === "claude" ? list : [...list, ...FEATURED];
  } catch { pubCache = null; }
  pubLoading = false; renderPublic();
}
function renderPublic(){
  const el = $("#pubList");
  if (connecting && !B) { el.innerHTML = `<div class="empty">Connecting…</div>`; return; }
  if (pubLoading) { el.innerHTML = `<div class="empty">Loading public packs…</div>`; return; }
  if (pubCache === null) { el.innerHTML = `<div class="empty">Couldn't load the public library. Check your connection and tap Refresh.</div>`; return; }
  const q = $("#pubSearch").value.trim().toLowerCase(), sort = $("#pubSort").value;
  let list = pubCache.filter(x => !q || (plain(x.title) + " " + plain(x.description||"") + " " + x.author).toLowerCase().includes(q));
  list = list.slice().sort((a,b) => sort === "pop" ? (b.likes*3 + b.plays) - (a.likes*3 + a.plays) || b.updatedAt - a.updatedAt
    : sort === "plays" ? b.plays - a.plays || b.updatedAt - a.updatedAt : b.updatedAt - a.updatedAt);
  const note = !B ? `<p class="hint" style="margin-bottom:10px">Only featured packs are shown here. The shared public library needs the online version of the game.</p>` : "";
  if (!list.length) { el.innerHTML = note + `<div class="empty">${q ? "No packs match that search." : "Nothing published yet. Publish one of yours from My library."}</div>`; return; }
  const canLike = !!(B && B.signedIn());
  el.innerHTML = note + list.map(x => {
    const have = S.packs.some(p => p.origin && p.origin.pid === x.pid && p.origin.ownerId === x.ownerId);
    const liked = !!myLikes[x.key];
    return `<article class="pack" data-i="${pubCache.indexOf(x)}">
      <div class="pack-head"><div style="min-width:0;display:grid;gap:4px"><h3>${esc(x.title)}</h3><div class="meta"><span class="muted">by ${esc(x.author)}</span><span class="muted">· ${x.questions.length} questions${x.featured ? "" : ` · ▶ ${x.plays} play${x.plays===1?"":"s"}`}</span>${x.featured ? `<span class="chip starter">Featured</span>` : ""}${have ? `<span class="chip dl">In your library</span>` : ""}</div></div>
      <button class="btn small primary" data-act="play">▶ Play</button></div>
      ${x.description ? `<p class="muted md">${mdHtml(x.description)}</p>` : ""}
      <div class="actions"><button class="btn small" data-act="dl">${have ? "Download again" : "Download to my library"}</button>
      ${canLike && !x.featured ? `<button class="btn small like" data-act="like" aria-pressed="${liked}">👍 ${x.likes}</button>` : ""}</div>
    </article>`; }).join("");
}
$("#pubSearch").oninput = renderPublic;
$("#pubSort").onchange = renderPublic;
$("#btnPubRefresh").onclick = loadPublic;
$("#pubList").onclick = async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const x = pubCache[+b.closest(".pack").dataset.i]; if (!x) return;
  if (b.dataset.act === "like") {
    const on = !myLikes[x.key];
    if (on) myLikes[x.key] = true; else delete myLikes[x.key];
    x.likes += on ? 1 : -1; Snd.sfx("click"); renderPublic();
    try { await B.like(x.key, on); } catch { toast("Couldn't save your like."); }
    return;
  }
  let pack;
  try { pack = normPackOne(x); } catch(err){ toast("This pack has a broken question: " + err); return; }
  if (b.dataset.act === "play") startRun({...pack, id:"pub-" + x.key, origin:{ownerId:x.ownerId, pid:x.pid}, publicKey: x.featured ? null : x.key}, S.mode);
  else {
    S.packs.unshift({...pack, id:newId(), source:"downloaded", origin:{ownerId:x.ownerId, pid:x.pid}, updatedAt:Date.now()});
    save(); renderPublic(); toast("Saved to My library. You can edit it there.");
  }
};
function packKey(p){
  if (p.publicKey) return p.publicKey;
  if (p.origin && p.origin.ownerId !== "team") return `${p.origin.ownerId}~${p.origin.pid}`;
  if (p.publishedAt && B?.uid) return `${B.uid}~${p.id}`;
  return null;
}
function recordPlay(key){ if (key && B) B.play(key); }
/* ---------- import / export ---------- */
function modal(html){ $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal(){ $("#modal").hidden = true; }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
const SAMPLE = `{
  "title": "My pack",
  "questions": [
    { "q": "Capital of **Italy**?",
      "choices": ["Rome", "Milan", "Naples"],
      "answer": 0, "time": 6,
      "difficulty": "easy",
      "explain": "Rome has been the capital since 1871." },
    { "type": "tf",
      "q": "The Sun is a {gold|star}.",
      "answer": true },
    { "type": "multi",
      "q": "Which are ==mammals==?",
      "choices": ["Whale", "Shark", "Bat"],
      "answer": [0, 2] }
  ]
}`;
function openImport(){
  modal(`<h2>Import JSON</h2>
    <p class="hint">Choose a .json file or paste its contents. <b>answer</b> can be a 0-based index, a letter (A–D) or the exact choice text. Use <b>true</b>/<b>false</b> for <code>"type":"tf"</code> questions and a list for <code>"type":"multi"</code> ones. <b>time</b>, <b>difficulty</b> (easy/hard) and <b>explain</b> are optional. Text can use **bold**, *italic*, ==highlight== and {red|color}.</p>
    <pre class="code">${esc(SAMPLE)}</pre>
    <input type="file" id="impFile" accept=".json,application/json" class="inp">
    <textarea class="inp" id="impText" rows="6" placeholder="…or paste JSON here"></textarea>
    <p class="err" id="impErr"></p>
    <div class="row"><button class="btn" data-close>Cancel</button><button class="btn primary" id="impGo">Import</button></div>`);
  $("#impFile").onchange = async e => { const f = e.target.files[0]; if (f) $("#impText").value = await f.text(); };
  $("#impGo").onclick = () => {
    const txt = $("#impText").value.trim();
    if (!txt) { $("#impErr").textContent = "Choose a file or paste some JSON first."; return; }
    let raw; try { raw = JSON.parse(txt); } catch(e){ $("#impErr").textContent = "That isn't valid JSON: " + e.message; return; }
    let packs; try { packs = normImport(raw); } catch(e){ $("#impErr").textContent = String(e); return; }
    for (const p of packs.reverse()) S.packs.unshift({...p, id:newId(), source:"mine", updatedAt:Date.now()});
    save(); closeModal(); setTab("mine");
    toast(`Imported ${packs.length} pack${packs.length>1?"s":""}`);
  };
}
function openExport(p){
  const json = JSON.stringify(exportable(p), null, 2);
  modal(`<h2>Export “${esc(p.title)}”</h2>
    <p class="hint">You can import this JSON back into Curtain Run on any device.</p>
    <textarea class="inp" id="expText" rows="10" readonly style="font:12px/1.5 var(--mono)">${esc(json)}</textarea>
    <div class="row"><button class="btn" data-close>Close</button><button class="btn" id="expCopy">Copy</button>${downloadsCap ? `<button class="btn primary" id="expSave">Save .json file</button>` : ""}</div>`);
  $("#expCopy").onclick = async () => { try { await navigator.clipboard.writeText(json); toast("Copied"); } catch { $("#expText").select(); try { document.execCommand("copy"); toast("Copied"); } catch {} } };
  if (downloadsCap) $("#expSave").onclick = async () => {
    const name = (p.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "pack") + ".json";
    try { await downloadsCap.save({filename:name, data:json}); toast("Saved " + name); }
    catch(e){ if (e?.code !== "declined") toast("Couldn't save the file. Use Copy instead."); }
  };
}

/* ---------- editor ---------- */
let draft = null, draftId = null, lastField = null;
const blankQ = () => ({q:"", type:"mc", choices:["",""], answer:0});
function openEditor(p){
  draftId = p ? p.id : null;
  draft = p ? clone({title:p.title, description:p.description||"", questions:p.questions}) : {title:"", description:"", questions:[blankQ()]};
  for (const q of draft.questions) q.type = qType(q);
  $("#edTitleH").textContent = p ? "Edit pack" : "New pack";
  $("#edTitle").value = draft.title; $("#edDesc").value = draft.description;
  $("#edErr").textContent = ""; lastField = null;
  renderEditorQs(); show("edit"); $("#scr-edit").scrollTop = 0;
}
function previewHtml(q){
  const ans = answersOf(q), t = q.type;
  return `<div class="pq md">${q.q.trim() ? mdHtml(q.q) : '<span class="muted">Question preview</span>'}</div>
    <div class="pc">${q.choices.map((c,j) => `<span class="md ${ans.includes(j)?"ok":""}">${t==="tf" ? (j?"✗ ":"✓ ") : LETTERS[j]+" · "}${mdHtml(c) || "…"}</span>`).join("")}</div>`;
}
function renderEditorQs(){
  $("#edQs").innerHTML = draft.questions.map((q,i) => {
    const t = q.type, ans = answersOf(q);
    const auto = q.q.trim() ? autoTime(q) : 5;
    const timeOpts = [`<option value="">Auto (${auto}s)</option>`].concat([3,4,5,6,7,8,9,10,12,14,16,20].map(s => `<option value="${s}" ${+q.time===s?"selected":""}>${s}s</option>`)).join("");
    const plen = plain(q.q).length;
    const rows = q.choices.map((c,j) => {
      if (t === "tf") return `<div class="chrow tf ${j?"f":"t"} ${ans.includes(j)?"ok":""}"><span class="ltr">${j?"F":"T"}</span><input type="radio" id="q${i}-a${j}" name="q${i}-ans" data-f="answer" value="${j}" ${ans.includes(j)?"checked":""} aria-label="${j?"False":"True"} is correct"><input class="inp" id="q${i}-c${j}" value="${j?"False":"True"}" readonly tabindex="-1"><span></span></div>`;
      const kind = t === "multi" ? "checkbox" : "radio";
      return `<div class="chrow ${ans.includes(j)?"ok":""}"><span class="ltr">${LETTERS[j]}</span><input type="${kind}" id="q${i}-a${j}" name="q${i}-ans" data-f="answer" value="${j}" ${ans.includes(j)?"checked":""} aria-label="Mark ${LETTERS[j]} correct"><input class="inp" id="q${i}-c${j}" data-f="choice" data-j="${j}" data-mdf maxlength="80" value="${esc(c)}" placeholder="Choice ${LETTERS[j]}"><button class="x" data-a="delc" data-j="${j}" aria-label="Remove choice" ${q.choices.length<=2?"disabled":""}>×</button></div>`;
    }).join("");
    return `<div class="qed" data-i="${i}">
      <div class="qed-head"><span class="qn">Q${i+1}</span>
        <select class="sel" id="q${i}-type" data-f="type" aria-label="Question type"><option value="mc" ${t==="mc"?"selected":""}>One correct</option><option value="multi" ${t==="multi"?"selected":""}>Any correct</option><option value="tf" ${t==="tf"?"selected":""}>True / False</option></select>
        <select class="sel" id="q${i}-diff" data-f="difficulty" aria-label="Difficulty"><option value="">Normal</option><option value="easy" ${q.difficulty==="easy"?"selected":""}>Easy</option><option value="hard" ${q.difficulty==="hard"?"selected":""}>Hard</option></select>
        <select class="sel" id="q${i}-time" data-f="time" aria-label="Time">${timeOpts}</select>
        <span class="sp"></span><button class="btn small ghost" data-a="delq" ${draft.questions.length<2?"disabled":""}>Remove</button></div>
      <div class="field"><textarea class="inp" id="q${i}-text" data-f="q" data-mdf rows="2" maxlength="260" placeholder="${t==="tf" ? "A statement, e.g. The Sun is a **star**." : "Short question, e.g. Capital of **Peru**?"}">${esc(q.q)}</textarea><span class="cnt ${plen>140?"over":""}">${plen}/140</span></div>
      <div style="display:grid;gap:6px">${rows}</div>
      <div class="qed-head">${t!=="tf" && q.choices.length<4 ? `<button class="btn small" data-a="addc">+ Choice</button>` : ""}<span class="hint">${t==="multi" ? "Tick every correct door. At least one door must be wrong." : t==="tf" ? "Pick whether the statement is true or false." : "Tick the correct door."}</span></div>
      <input class="inp" id="q${i}-ex" data-f="explain" data-mdf maxlength="300" value="${esc(q.explain||"")}" placeholder="Why? (optional, shown after answering)">
      <div class="prev">${previewHtml(q)}</div>
    </div>`;
  }).join("");
}
function refreshCard(card, q){
  card.querySelector(".prev").innerHTML = previewHtml(q);
  const o = card.querySelector('select[data-f="time"] option[value=""]'); if (o) o.textContent = `Auto (${q.q.trim() ? autoTime(q) : 5}s)`;
}
$("#scr-edit").addEventListener("focusin", e => { if (e.target.matches("[data-mdf]")) lastField = e.target; });
$("#edQs").addEventListener("input", e => {
  const card = e.target.closest(".qed"); if (!card) return;
  const q = draft.questions[+card.dataset.i], f = e.target.dataset.f;
  if (f === "q") { q.q = e.target.value; const n = plain(q.q).length, c = card.querySelector(".cnt"); c.textContent = n + "/140"; c.classList.toggle("over", n > 140); }
  else if (f === "choice") q.choices[+e.target.dataset.j] = e.target.value;
  else if (f === "explain") { if (e.target.value.trim()) q.explain = e.target.value; else delete q.explain; }
  else return;
  refreshCard(card, q);
});
$("#edQs").addEventListener("change", e => {
  const card = e.target.closest(".qed"); if (!card) return;
  const q = draft.questions[+card.dataset.i], f = e.target.dataset.f;
  if (f === "answer") {
    if (q.type === "multi") q.answer = [...card.querySelectorAll('input[data-f="answer"]:checked')].map(x => +x.value);
    else q.answer = +e.target.value;
    const ans = answersOf(q);
    card.querySelectorAll(".chrow").forEach((r,j) => r.classList.toggle("ok", ans.includes(j)));
    refreshCard(card, q);
  } else if (f === "time") { if (e.target.value) q.time = +e.target.value; else delete q.time; }
  else if (f === "difficulty") { if (e.target.value) q.difficulty = e.target.value; else delete q.difficulty; }
  else if (f === "type") {
    const nt = e.target.value, ot = q.type;
    if (nt === "tf") { q.choices = ["True","False"]; q.answer = 0; }
    else if (ot === "tf") { q.choices = ["",""]; q.answer = nt === "multi" ? [0] : 0; }
    else if (nt === "multi") q.answer = [answersOf(q)[0] ?? 0];
    else q.answer = answersOf(q)[0] ?? 0;
    q.type = nt; renderEditorQs();
  }
});
$("#edQs").addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const i = +b.closest(".qed").dataset.i, q = draft.questions[i];
  if (b.dataset.a === "delq") draft.questions.splice(i,1);
  else if (b.dataset.a === "addc" && q.choices.length < 4) q.choices.push("");
  else if (b.dataset.a === "delc" && q.choices.length > 2) {
    const j = +b.dataset.j; q.choices.splice(j,1);
    if (q.type === "multi") q.answer = answersOf(q).filter(a => a !== j).map(a => a > j ? a-1 : a);
    else if (q.answer === j) q.answer = 0; else if (q.answer > j) q.answer--;
  }
  renderEditorQs();
});
$("#mdbar").addEventListener("pointerdown", e => { if (e.target.closest("button")) e.preventDefault(); });
$("#mdbar").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const el = lastField;
  if (!el || !el.isConnected) { toast("Tap into a question, choice or explanation first"); return; }
  const a = el.selectionStart ?? el.value.length, z = el.selectionEnd ?? el.value.length, v = el.value;
  const sel = v.slice(a, z) || "text";
  const open = b.dataset.mdc ? `{${b.dataset.mdc}|` : b.dataset.md, close = b.dataset.mdc ? "}" : b.dataset.md;
  el.value = v.slice(0,a) + open + sel + close + v.slice(z);
  el.focus(); el.setSelectionRange(a + open.length, a + open.length + sel.length);
  el.dispatchEvent(new Event("input", {bubbles:true}));
});
$("#btnAddQ").onclick = () => {
  draft.questions.push(blankQ()); renderEditorQs();
  const last = $("#edQs").lastElementChild; last?.scrollIntoView({behavior:"smooth", block:"center"}); last?.querySelector("textarea")?.focus({preventScroll:true});
};
function leaveEditor(){ show("lib"); setTab("mine"); }
$("#btnEditBack").onclick = leaveEditor;
$("#btnEditCancel").onclick = leaveEditor;
function edFail(i, msg){
  $("#edErr").textContent = `Question ${i+1} ${msg}`;
  $("#edQs").children[i]?.scrollIntoView({behavior:"smooth", block:"center"});
}
$("#btnEditSave").onclick = () => {
  draft.title = $("#edTitle").value.trim(); draft.description = $("#edDesc").value.trim();
  if (!draft.title) { $("#edErr").textContent = "Give the pack a name."; $("#edTitle").focus(); return; }
  const cleaned = [];
  for (let i=0;i<draft.questions.length;i++){
    const q = draft.questions[i], t = q.type;
    const filled = t === "tf" ? [{c:"True",j:0},{c:"False",j:1}] : q.choices.map((c,j) => ({c:c.trim(), j})).filter(x => x.c);
    if (!q.q.trim() && (t === "tf" || !filled.length)) continue;
    if (!q.q.trim()) return edFail(i, "is missing its text.");
    if (plain(q.q).length > 140) return edFail(i, "is over 140 characters. Shorter questions play better.");
    if (filled.length < 2) return edFail(i, "needs at least 2 choices.");
    if (filled.some(x => plain(x.c).length > 48)) return edFail(i, "has a choice over 48 characters.");
    const o = {q:q.q.trim(), choices:filled.map(x => x.c)};
    if (t === "multi") {
      const ans = answersOf(q).map(a => filled.findIndex(x => x.j === a)).filter(a => a >= 0);
      if (!ans.length) return edFail(i, "needs at least one correct door ticked.");
      if (ans.length >= filled.length) return edFail(i, "needs at least one wrong door.");
      o.type = "multi"; o.answer = ans.sort((x,y) => x-y);
    } else {
      const ans = filled.findIndex(x => x.j === q.answer);
      if (ans < 0) return edFail(i, "has its correct answer on an empty choice.");
      o.answer = ans; if (t === "tf") o.type = "tf";
    }
    if (q.time) o.time = q.time;
    if (q.difficulty) o.difficulty = q.difficulty;
    if (q.explain && q.explain.trim()) o.explain = q.explain.trim();
    cleaned.push(o);
  }
  if (!cleaned.length) { $("#edErr").textContent = "Add at least one question."; return; }
  let pub = false;
  if (draftId) { const p = S.packs.find(x => x.id === draftId); Object.assign(p, {title:draft.title, description:draft.description, questions:cleaned, updatedAt:Date.now()}); pub = !!p.publishedAt; }
  else S.packs.unshift({id:newId(), title:draft.title, description:draft.description, questions:cleaned, source:"mine", updatedAt:Date.now()});
  save(); leaveEditor(); toast(pub ? "Pack saved. Tap “Update public copy” to share the changes." : "Pack saved");
};

/* ================= Audio (synthesized) ================= */
const Snd = {
  ac:null, out:null, mus:null, fx:null, nb:null, step:0, next:0,
  init(){
    if (this.ac) { if (this.ac.state === "suspended") this.ac.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { this.ac = new AC(); } catch { return; }
    const ac = this.ac;
    this.out = ac.createGain(); this.out.gain.value = 0.8;
    const comp = ac.createDynamicsCompressor(); this.out.connect(comp); comp.connect(ac.destination);
    this.mus = ac.createGain(); this.mus.gain.value = 0.3; this.mus.connect(this.out);
    this.fx = ac.createGain(); this.fx.gain.value = 0.9; this.fx.connect(this.out);
    this.nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.nb.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
  },
  env(g,t,a,p,d){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(p,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+d); },
  osc(type,f,t,dur,p,dest,f2){
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f,t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t+dur);
    this.env(g,t,0.006,p,dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t+dur+0.05);
  },
  noise(t,dur,p,dest,type,f,f2,q){
    const ac = this.ac, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.nb; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f,t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t+dur); fl.Q.value = q || 1;
    this.env(g,t,0.005,p,dur); s.connect(fl); fl.connect(g); g.connect(dest); s.start(t, Math.random()*0.5); s.stop(t+dur+0.05);
  },
  sfx(name){
    if (!this.ac || !S.settings.sfx) return;
    const t = this.ac.currentTime + 0.005, d = this.fx;
    try {
      switch (name) {
        case "lane": this.noise(t,0.1,0.18,d,"bandpass",900,2600,0.9); break;
        case "click": this.osc("square",660,t,0.035,0.04,d); break;
        case "swoosh": this.noise(t,0.35,0.3,d,"bandpass",350,2800,0.7); break;
        case "gem": [1318.5,1760,2637].forEach((f,i) => this.osc("triangle",f,t+i*0.06,0.28,0.22,d)); break;
        case "thud": this.osc("sine",150,t,0.4,0.9,d,38); this.noise(t,0.3,0.5,d,"lowpass",900,150,0.7); break;
        case "pickup": [880,1174.7,1568].forEach((f,i) => this.osc("square",f,t+i*0.05,0.1,0.06,d)); break;
        case "boss": this.osc("sawtooth",110,t,0.9,0.12,d,104); this.osc("sawtooth",164.8,t+0.02,0.9,0.1,d,156); this.osc("sine",55,t,1.0,0.4,d); break;
        case "fever": this.osc("sawtooth",220,t,0.6,0.1,d,1320); this.osc("triangle",440,t+0.1,0.5,0.12,d,1760); break;
        case "burn": this.noise(t,0.7,0.28,d,"highpass",2400,500,0.6); break;
        case "shield": this.osc("sine",500,t,0.35,0.3,d,1400); this.osc("triangle",1000,t+0.05,0.3,0.12,d,2000); break;
        case "cheer": this.noise(t,0.9,0.14,d,"bandpass",1400,1100,0.5); break;
        case "groan": this.osc("triangle",230,t,0.55,0.12,d,140); break;
        case "biome": [523.25,659.25,783.99].forEach((f,i) => this.osc("sine",f,t+i*0.09,0.4,0.1,d)); break;
      }
    } catch {}
  },
  tick(){
    const ac = this.ac; if (!ac) return;
    if (!(S.settings.music && G.mode === "play" && !paused)) { this.next = 0; return; }
    const spb = 60/(G.fever ? 132 : 104)/4;
    if (this.next < ac.currentTime) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.12) { try { this.beat(this.step, this.next); } catch {} this.step = (this.step + 1) % 64; this.next += spb; }
  },
  beat(s,t){
    const m = this.mus, bar = Math.floor(s/16), p = s % 16;
    if (p % 4 === 0) this.osc("sine",150,t,0.16,0.7,m,42);
    if (p % 4 === 2) this.noise(t,0.035,0.14,m,"highpass",7000);
    if (p === 4 || p === 12) this.noise(t,0.1,0.2,m,"bandpass",1700,900,0.8);
    const r = [110,87.31,98,82.41][bar % 4];
    if (p === 0 || p === 6 || p === 10) this.osc("triangle",r,t,0.22,0.35,m);
    if (p === 3 || p === 14) this.osc("triangle",r*2,t,0.1,0.16,m);
    if ((G.fever || bar % 2 === 1) && p % 2 === 1) {
      const sc = [440,523.25,587.33,659.25,783.99,880];
      this.osc("square", sc[(s*7 + bar*3) % sc.length], t, 0.07, G.fever ? 0.05 : 0.028, m);
    }
  }
};
addEventListener("pointerdown", () => Snd.init(), true);
addEventListener("keydown", () => Snd.init(), true);

/* ================= GAME: world ================= */
const cv = $("#cv"), ctx = cv.getContext("2d");
let W=0, H=0, F=1, HZ=0;
const ZC = 4, CAMH = 2.2, HALF = 1.8, FAR = 80, LOCKZ = 1.35, LANE_L = 7;
const MINS = 5, MAXS = 17, STARTS = 9;
function resize(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  F = Math.min(1.0*W, 0.95*H);
  HZ = Math.max(H*0.3, H*0.9 - (CAMH/ZC)*F);
}
addEventListener("resize", resize); resize();

const curveX = d => 2.6*Math.sin(d*0.021) + 1.4*Math.sin(d*0.047+1.3);
const dCurve = d => 2.6*0.021*Math.cos(d*0.021) + 1.4*0.047*Math.cos(d*0.047+1.3);
const hillY = d => 1.3*Math.sin(d*0.028+0.5) + 0.6*Math.sin(d*0.061+2);
const dHill = d => 1.3*0.028*Math.cos(d*0.028+0.5) + 0.6*0.061*Math.cos(d*0.061+2);
let D = 0, C0 = 0, DC0 = 0, H0 = 0, DH0 = 0;
function setView(){ D = G.dist; C0 = curveX(D); DC0 = dCurve(D); H0 = hillY(D); DH0 = dHill(D); }
const xo = z => curveX(D+z) - C0 - z*DC0;
const yo = z => hillY(D+z) - H0 - z*DH0;
function basis(z){ const s = F/(z+ZC); return {s, ox: W/2 + xo(z)*s, oy: HZ + (CAMH - yo(z))*s}; }
const hash = k => { const x = Math.sin(k*127.1 + 311.7)*43758.5453; return x - Math.floor(x); };

/* colors */
const RGB = {};
function rgb(h){ if (Array.isArray(h)) return h; if (RGB[h]) return RGB[h]; const n = parseInt(h.slice(1),16); return RGB[h] = [n>>16 & 255, n>>8 & 255, n & 255]; }
const mixA = (a,b,t) => { a = rgb(a); b = rgb(b); return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; };
const css = (c,a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const mix = (a,b,t) => css(mixA(a,b,t));

const C_DEF = ["#E0782E","#3B7DD8","#F2C14E","#8E5BD6","#2FA878","#D6508E","#F4ECDD"];
const BIOMES = [
  {name:"Lantern Meadow", ground:["#1E4A43","#1A433C"], hills:["#1F4F4A","#143A36"], shape:0, road:["#D9C4A1","#CDB690"], curb:["#8C6F4E","#6B5238"], side:"lamp", stone:["#8A7560","#6F5D4B"],
    crowd:{cols:C_DEF, banner:["#F4ECDD","#B3263A"]}},
  {name:"Red Canyon", ground:["#B5643A","#A85B34"], hills:["#C9784A","#8E4526"], shape:1, road:["#E3C9A0","#D6B98B"], curb:["#7A4A2E","#5E3620"], side:"cactus", stone:["#A0573A","#81422A"],
    crowd:{hat:"cowboy", cols:["#C0392B","#E0A526","#6B8E23","#8B5A2B","#F4ECDD"], banner:["#E9C893","#7A3A1E"]}},
  {name:"Rope Bridge", ground:["#1F5E7A","#1B5670"], hills:["#3E6E86","#2C5468"], shape:2, road:["#B98A5A","#A87B4E"], curb:["#5A3B24","#46301D"], side:"rail", water:true, stone:["#6B6A66","#55544F"],
    crowd:{hat:"sailor", boat:true, cols:["#F4ECDD","#3B7DD8","#D0384F","#1B3F6B"], banner:["#F4ECDD","#1B3F6B"]}},
  {name:"Pine Hollow", ground:["#244A2C","#1F4227"], hills:["#1D3B26","#132C1A"], shape:3, road:["#CFC0A0","#C2B290"], curb:["#5B6B3A","#46552C"], side:"pine", stone:["#6E7461","#565C4A"],
    crowd:{hat:"beanie", cols:["#B3263A","#2F6B6A","#E0782E","#5B6B3A","#F2C14E"], banner:["#F4ECDD","#1F4D2B"]}},
  {name:"Chinatown", ground:["#5B3A2E","#523429"], hills:["#7C8C91","#56666E"], shape:4, road:["#B9AC9C","#AC9E8D"], curb:["#8E2A2A","#6E1E1E"], side:"china", arch:"paifang", stone:["#A32B2B","#7E1F1F"],
    crowd:{prop:"lantern", cols:["#D0384F","#F2C14E","#1F8A5B","#2B2B6E","#F4ECDD"], banner:["#B3263A","#F2C14E"]}},
  {name:"Silk Road Bazaar", ground:["#D8B47A","#CFAA6E"], hills:["#E3BD80","#C99A58"], shape:2, road:["#EBDDBF","#DFCDA8"], curb:["#1FA3A8","#16808A"], side:"bazaar", arch:"iwan", stone:["#D9BE8C","#B89968"],
    crowd:{hat:"doppi", robe:true, cols:["#1FA3A8","#8E2A6B","#E0A526","#2C5AA0","#B3263A"], banner:["#1FA3A8","#FFF4DE"]}},
  {name:"Snow Peaks", ground:["#E6EEF3","#DAE5EC"], hills:["#C4D3E0","#93A9BF"], shape:5, road:["#D3E3EC","#C5D8E4"], curb:["#7FA3BF","#5F83A0"], side:"snowpine", snow:true, stone:["#AFC6D6","#8EA9BE"],
    crowd:{hat:"beanie", scarf:true, cols:["#D0384F","#3B7DD8","#2FA878","#F2C14E","#8E5BD6"], banner:["#FFFFFF","#3B7DD8"]}},
  {name:"Neon City", ground:["#17152C","#131126"], hills:["#2A2352","#1B1638"], shape:6, road:["#2B2942","#26243B"], curb:["#FF3DA5","#2FE0FF"], side:"neon", arch:"neon", neon:true, stone:["#2B2750","#221F42"],
    crowd:{prop:"phone", cols:["#FF3DA5","#2FE0FF","#8E5BD6","#C6FF3D","#F4ECDD"], banner:["#1A1638","#FF3DA5"]}},
];
const NB = BIOMES.length;
const biomeIdx = d => G.biomeOrder[Math.floor(Math.max(0, d - (G.startD||0))/450) % NB];
const biomeAt = d => BIOMES[biomeIdx(d)];

const SKY = [
  {top:"#0B2F35", mid:"#2F6B6A", hor:"#F0B865", sun:0.14, night:0},
  {top:"#040A18", mid:"#0E1D38", hor:"#2A3F5E", sun:-0.7, night:1},
  {top:"#2B3A67", mid:"#B86F7A", hor:"#F6C28B", sun:0.14, night:0.15},
  {top:"#1B6A86", mid:"#6CB0B5", hor:"#F1E3B8", sun:0.8, night:0},
];
let SK = null;
function skyNow(){
  const p = ((G.tod||0) % 1) * 4, i = Math.floor(p), f = smooth(p - i), A = SKY[i], B = SKY[(i+1) % 4];
  SK = {top:mixA(A.top,B.top,f), mid:mixA(A.mid,B.mid,f), hor:mixA(A.hor,B.hor,f), sun:lerp(A.sun,B.sun,f), night:lerp(A.night,B.night,f)};
  const w = k => { const bt = smooth(G.biomeT ?? 1), c = BIOMES[G.curBiome], p = BIOMES[G.prevBiome]; return (c?.[k] ? (G.prevBiome >= 0 ? bt : 1) : 0) + (p?.[k] && G.prevBiome >= 0 ? 1 - bt : 0); };
  const nw = w("neon")*0.9, sw = w("snow")*0.6;
  if (nw > 0.01) { const N = SKY[1]; SK.top = mixA(SK.top, "#0A0620", nw); SK.mid = mixA(SK.mid, "#2A1650", nw); SK.hor = mixA(SK.hor, "#6A2A6E", nw); SK.night = Math.max(SK.night, nw); SK.sun = lerp(SK.sun, -0.7, nw); }
  if (sw > 0.01) { SK.hor = mixA(SK.hor, "#E8F0F6", sw*(1-SK.night)); SK.mid = mixA(SK.mid, "#9FBCD2", sw*0.6*(1-SK.night)); }
  SK.snow = w("snow");
}
const STARS = Array.from({length:90}, (_,i) => ({x:hash(i+1), y:hash(i+101)*0.8, r:0.5 + hash(i+201)*1.3, ph:hash(i+301)*6}));

/* lane layout morphing */
const SLOTS = {2:[[0,0],[0,1],[0,0]], 3:[[-0.6,1],[0,0],[0.6,1]], 4:[[-0.9,1],[0,1],[0.9,1]]};
const laneW = n => (2*HALF)/n;
const laneCenter = (i,n) => -HALF + laneW(n)*(i+0.5);
function slotsAt(d){
  const L = G.lanes; let i = L.length - 1;
  while (i > 0 && L[i].d0 > d) i--;
  const cur = SLOTS[L[i].n];
  if (i > 0 && d < L[i].d0 + LANE_L) {
    const t = smooth(clamp((d - L[i].d0)/LANE_L, 0, 1)), prev = SLOTS[L[i-1].n];
    return cur.map((c,j) => [lerp(prev[j][0], c[0], t), lerp(prev[j][1], c[1], t)]);
  }
  return cur;
}

/* ================= rich text on canvas ================= */
const MDCACHE = new Map(), LCACHE = new Map();
const runsOf = src => { let r = MDCACHE.get(src); if (!r) { r = parseMd(src); if (MDCACHE.size > 300) MDCACHE.clear(); MDCACHE.set(src, r); } return r; };
const fontFor = (r, fs) => `${r.i ? "italic " : ""}${r.b || r.hl || r.color ? 800 : 600} ${fs}px ${r.code ? '"JetBrains Mono", monospace' : '"Bricolage Grotesque", system-ui, sans-serif'}`;
function doLayout(runs, maxW){
  const toks = [];
  for (const r of runs) for (const p of r.t.split(/(\s+)/)) if (p) toks.push({t:p, r, sp:/^\s+$/.test(p)});
  const lines = [[]], widths = [0]; let maxTok = 0;
  for (const tk of toks) {
    ctx.font = fontFor(tk.r, 20); tk.w = ctx.measureText(tk.t).width + ((tk.r.hl||tk.r.color||tk.r.code) && !tk.sp ? 8 : 0);
    const li = lines.length - 1;
    if (tk.sp) { if (lines[li].length) { lines[li].push(tk); widths[li] += tk.w; } continue; }
    maxTok = Math.max(maxTok, tk.w);
    if (widths[li] + tk.w > maxW && lines[li].some(x => !x.sp)) {
      while (lines[li].length && lines[li][lines[li].length-1].sp) widths[li] -= lines[li].pop().w;
      lines.push([tk]); widths.push(tk.w);
    } else { lines[li].push(tk); widths[li] += tk.w; }
  }
  const li = lines.length - 1;
  while (lines[li].length && lines[li][lines[li].length-1].sp) widths[li] -= lines[li].pop().w;
  return {lines, widths, maxTok};
}
function fitRich(src, maxW, fs0, maxLines){
  let fs = fs0, L = null;
  for (let k=0; k<10; k++) {
    const ratio = Math.max(1, Math.round(maxW/fs*4)/4), key = src + "|" + ratio;
    L = LCACHE.get(key);
    if (!L) { L = doLayout(runsOf(src), ratio*20); if (LCACHE.size > 500) LCACHE.clear(); LCACHE.set(key, L); }
    if (L.lines.length <= maxLines && L.maxTok <= ratio*20 + 0.5) break;
    fs *= 0.88; if (fs < 6) break;
  }
  return {L, fs};
}
function drawRich(src, cx, cy, maxW, fs0, maxLines, fg){
  const {L, fs} = fitRich(src, maxW, fs0, maxLines); if (fs < 6) return;
  const k = fs/20, lh = fs*1.18, y0 = cy - (L.lines.length-1)*lh/2;
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  L.lines.forEach((line, li) => {
    let x = cx - L.widths[li]*k/2; const y = y0 + li*lh;
    for (const tk of line) {
      const w = tk.w*k, r = tk.r, boxed = (r.hl || r.color || r.code) && !tk.sp;
      if (tk.sp) { x += w; continue; }
      ctx.font = fontFor(r, fs);
      if (boxed) {
        ctx.fillStyle = r.hl ? "#F2C14E" : r.code ? "rgba(10,20,22,.55)" : "#FFF4DE";
        rr(x, y - fs*0.62, w, fs*1.24, fs*0.25); ctx.fill();
      }
      const tx = boxed ? x + 4*k : x;
      if (!boxed) { ctx.fillStyle = "rgba(30,6,14,.55)"; ctx.fillText(tk.t, tx, y + fs*0.07); }
      ctx.fillStyle = r.hl ? "#13292B" : r.color ? r.color : fg;
      ctx.fillText(tk.t, tx, y);
      if (r.u || r.s) { ctx.fillRect(tx, r.u ? y + fs*0.5 : y, w - (boxed ? 8*k : 0), Math.max(1, fs*0.08)); }
      x += w;
    }
  });
}
function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

/* ================= GAME: state ================= */
let G = {};
let paused = false;
function baseState(){
  return {speed:7, target:7, dist:0, startD:0, n:3, lane:1, laneX:0, phase:0, wall:null, parts:[], floats:[], shake:0, flash:0, gflash:0, tilt:0, rock:null, t:0,
    lanes:[{d0:-1e9, n:3}], crowds:[], pickups:[], tod:0.02, bgX:0, biomeOrder:shuffle([...Array(NB).keys()]), flakes:[], curBiome:-1, prevBiome:-1, biomeT:1, tunnelDark:0,
    fever:false, shield:false, slow:0, double:0, glows:[]};
}
function attract(){
  G = {...baseState(), mode:"attract", nextSwitch:1.5};
  G.curBiome = biomeIdx(0);
  $("#hud").hidden = true; $("#powers").hidden = true;
}
function prepQuestion(q){
  const type = qType(q);
  const order = type === "tf" ? [0,1] : shuffle(q.choices.map((_,i) => i));
  return {q:q.q, type, choices: order.map(i => q.choices[i]), correct: answersOf(q).map(a => order.indexOf(a)),
    time:qTime(q), diff:q.difficulty || "", explain:q.explain || ""};
}
function startRun(pack, mode){
  const qs = pack.questions.map(prepQuestion);
  G = {...baseState(), mode:"play", runMode:mode, pack, source:pack.questions, queue:shuffle(qs.slice()), asked:0, total: mode==="endless" ? null : qs.length,
       speed:STARTS, target:STARTS, bonus:0, streak:0, bestStreak:0, correct:0, wrong:0, gap:1.4, log:[], ending:0, endReason:""};
  G.curBiome = biomeIdx(0);
  paused = false;
  $("#qcard").classList.add("idle"); $("#qcard").classList.remove("boss"); $("#qText").textContent = "Get ready…"; $("#qExplain").hidden = true;
  const key = packKey(pack); if (key) recordPlay(key);
  G.playKey = key;
  updateHud(); renderPowers(); show("game"); banner("GO!", biomeAt(0).name, 1100);
}
function banner(text, sub, ms){
  const b = $("#banner"); b.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
  b.classList.add("on"); clearTimeout(banner._t); banner._t = setTimeout(() => b.classList.remove("on"), ms || 1100);
}
function makeCrowd(d, boss){
  const bio = biomeAt(d), cs = bio.crowd, people = [];
  const count = boss ? 6 : 4;
  for (const side of [-1,1]) for (let i=0;i<count;i++) {
    const inBoat = cs.boat;
    people.push({x: side*(HALF + (inBoat ? 1.15 : 0.75) + i*0.42 + Math.random()*0.12), dz: inBoat ? (i%2)*0.35 : (Math.random()-0.5)*1.2 + (i%2)*0.5, h:0.8 + Math.random()*0.25,
      c: cs.cols[Math.floor(Math.random()*cs.cols.length)], c2: cs.cols[Math.floor(Math.random()*cs.cols.length)],
      skin:["#F1C9A5","#D9A47A","#A8744F","#6B4430"][Math.floor(Math.random()*4)], ph:Math.random()*6});
  }
  const words = bio.neon ? ["GO!","WOW","RUN!","YES!"] : ["GO!","RUN!","THINK!","YES!"];
  return {d, boss, people, bio, mood:"idle", mt:0, word: boss ? "BOSS" : words[Math.floor(Math.random()*words.length)]};
}
function spawn(){
  if (!G.queue.length) {
    if (G.runMode === "endless") G.queue = shuffle(G.source.map(prepQuestion));
    else { finish("complete"); return; }
  }
  const q = G.queue.shift(); G.asked++;
  const boss = G.asked % 5 === 0;
  const n = q.choices.length;
  const rel = (G.laneX + HALF) / (2*HALF);
  G.lane = clamp(Math.floor(rel*n), 0, n-1);
  if (n !== G.n) { G.lanes.push({d0: G.dist + 0.5, n}); if (G.lanes.length > 5) G.lanes.splice(0, G.lanes.length - 5); G.n = n; }
  const time = boss ? Math.max(3.5, q.time*0.8) : q.time;
  const z0 = G.speed * time;
  const w = G.wall = {q, n, d: G.dist + z0, z: z0, z0, age:0, time, boss, open:Array(n).fill(0), burn:Array(n).fill(0), burning:Array(n).fill(false),
    shown:Array(n).fill(!boss), revealAt:[], locked:-1, resolved:false, reveal:false, gemBob:Math.random()*6};
  if (boss) for (let i=0;i<n;i++) w.revealAt[i] = time*0.08 + i*(time*0.4/n);
  G.crowds.push(makeCrowd(w.d - 1.4, boss));
  // pickups
  const used = new Set();
  if (q.type !== "tf" && n - q.correct.length >= 2 && z0 > 14 && Math.random() < 0.45) {
    const lane = Math.floor(Math.random()*n); used.add(lane);
    G.pickups.push({kind:"lantern", x:laneCenter(lane,n), d:G.dist + Math.max(9, z0*0.55), bob:Math.random()*6});
  }
  if (z0 > 15 && Math.random() < 0.32) {
    const kinds = ["slow","double"].concat(G.shield ? [] : ["shield"]);
    let lane = Math.floor(Math.random()*n); if (used.has(lane)) lane = (lane + 1) % n;
    G.pickups.push({kind:kinds[Math.floor(Math.random()*kinds.length)], x:laneCenter(lane,n), d:G.dist + Math.max(9, z0*0.3), bob:Math.random()*6});
  }
  // card
  const card = $("#qcard");
  $("#qText").innerHTML = mdHtml(q.q);
  $("#qCount").textContent = G.total ? `Q${G.asked}/${G.total}` : `Q${G.asked}`;
  $("#qTags").innerHTML = (boss ? `<span class="qt boss">👑 Boss ×5</span>` : "") + (q.type === "tf" ? `<span class="qt tf">True / False</span>` : "") +
    (q.type === "multi" ? `<span class="qt multi">Any correct</span>` : "") + (q.diff ? `<span class="qt ${q.diff}">${DIFF[q.diff].label}</span>` : "");
  const ch = $("#qChips"); ch.style.setProperty("--n", n); ch.dataset.n = n;
  ch.innerHTML = q.choices.map((c,i) => `<button class="qchip ${q.type==="tf" ? (i ? "tff" : "tft") : ""}" data-l="${i}"><b class="l">${q.type==="tf" ? (i ? "F" : "T") : LETTERS[i]}</b><span class="t md">${mdHtml(c)}</span></button>`).join("");
  $("#qExplain").hidden = true;
  card.classList.toggle("boss", boss);
  card.classList.remove("idle");
  paintChips();
  if (boss) { banner("BOSS GATE", "Less time · ×5 points · a miss hits hard", 1900); Snd.sfx("boss"); }
}
function paintChips(){
  const w = G.wall; if (!w) return;
  [...$("#qChips").children].forEach((c,i) => {
    c.classList.toggle("here", i === G.lane && !w.resolved);
    c.classList.toggle("right", w.resolved && w.q.correct.includes(i));
    c.classList.toggle("wrong", w.resolved && i === w.locked && !w.q.correct.includes(i));
    c.classList.toggle("gone", w.burn[i] > 0 && !w.resolved);
    c.classList.toggle("hidden", !w.shown[i]);
  });
}
$("#qChips").addEventListener("pointerdown", e => { const c = e.target.closest(".qchip"); if (c) { e.preventDefault(); setLane(+c.dataset.l); } });
function setLane(i){
  if (G.mode !== "play" || paused) return;
  if (G.wall && G.wall.locked >= 0) return;
  const n = G.wall ? G.wall.n : G.n, nl = clamp(i, 0, n-1);
  if (nl !== G.lane) Snd.sfx("lane");
  G.lane = nl; paintChips();
}
const moveLane = d => setLane(G.lane + d);
const plainAns = w => w.q.correct.map(i => plain(w.q.choices[i])).join(" / ");

function resolve(){
  const w = G.wall; w.resolved = true; w.reveal = true;
  const ok = w.q.correct.includes(w.locked);
  const b0 = basis(0), cxp = b0.ox + G.laneX*b0.s, cyp = b0.oy - 0.8*b0.s, s0 = b0.s;
  const crowd = G.crowds.find(c => Math.abs(c.d - (w.d - 1.4)) < 0.01);
  if (ok) {
    G.streak++; G.correct++; G.bestStreak = Math.max(G.bestStreak, G.streak);
    if (G.streak >= 5 && !G.fever) { G.fever = true; banner("FEVER!", "Points ×3 until you miss", 1300); Snd.sfx("fever"); }
    else banner(w.boss ? "BOSS DOWN!" : G.streak > 1 ? `STREAK ${G.streak}` : "NICE!", "", 750);
    const mult = 1 + Math.min(G.streak-1, 4)*0.25;
    const pts = Math.round(100 * mult * (DIFF[w.q.diff]?.pts || 1) * (G.fever ? 3 : 1) * (G.double > 0 ? 2 : 1) * (w.boss ? 5 : 1));
    G.bonus += pts;
    G.target = Math.min(MAXS, G.target + 0.7);
    burst(cxp, cyp - s0*0.2, ["#F2C14E","#FFF1C7","#3FCB94"], w.boss ? 44 : 26, s0);
    G.floats.push({text:"+" + pts, x:cxp, y:cyp - s0*0.6, life:1.2, color:"#F2C14E"});
    G.gflash = 0.35; Snd.sfx("gem");
    if (crowd) { crowd.mood = "cheer"; crowd.mt = 0; Snd.sfx("cheer"); }
  } else {
    const atFloor = G.target <= MINS + 0.01;
    if (G.fever) banner("FEVER OVER", "", 900);
    G.streak = 0; G.fever = false; G.wrong++;
    if (G.shield && w.boss) {
      G.shield = false; G.rock = {t:0, x:cxp, big:true};
      G.speed = Math.max(MINS, G.speed*0.7); G.target = Math.max(MINS, G.target*0.7);
      banner("SHIELD SMASHED!", "It was: " + plainAns(w), 1700);
    } else if (G.shield) {
      G.shield = false; G.rock = {t:0, x:cxp, shielded:true};
      banner("SHIELD!", "It was: " + plainAns(w), 1600); Snd.sfx("shield");
    } else {
      const k = w.boss ? 0.4 : 0.6;
      G.rock = {t:0, x:cxp, big:w.boss};
      G.speed = Math.max(MINS, G.speed*k); G.target = Math.max(MINS, G.target*k);
      banner(w.boss ? "CRUSHED!" : "OUCH!", "It was: " + plainAns(w), 1700);
      if (G.runMode === "endless" && atFloor) { G.ending = 1.6; G.endReason = "Out of steam"; }
    }
    if (crowd) { crowd.mood = "wince"; crowd.mt = 0; Snd.sfx("groan"); }
  }
  G.log.push({q:w.q.q, choices:w.q.choices, correct:w.q.correct, pick:w.locked, ok, explain:w.q.explain});
  if (w.q.explain) { const ex = $("#qExplain"); ex.innerHTML = `<b>${ok ? "✓" : "✗"}</b> ` + mdHtml(w.q.explain); ex.hidden = false; }
  paintChips(); updateHud(); renderPowers();
}
function burst(x,y,colors,n,s){
  for (let i=0;i<n;i++){ const a = Math.random()*Math.PI*2, v = (0.6+Math.random())*s*1.4;
    G.parts.push({x,y,vx:Math.cos(a)*v, vy:Math.sin(a)*v - s*0.8, life:0.7+Math.random()*0.5, size:2+Math.random()*s*0.03, color:colors[i%colors.length], g:s*3}); }
}
function collect(p){
  const b0 = basis(0), x = b0.ox + G.laneX*b0.s, y = b0.oy - 0.9*b0.s;
  burst(x, y, p.kind === "lantern" ? ["#F2C14E","#E0782E","#FFF1C7"] : p.kind === "shield" ? ["#3FCB94","#DDF2E7"] : p.kind === "slow" ? ["#6FB3E8","#DDEBFA"] : ["#F2C14E","#FFF"], 18, b0.s*0.6);
  Snd.sfx("pickup");
  if (p.kind === "lantern") {
    const w = G.wall;
    if (w && !w.resolved) {
      const cands = w.q.choices.map((_,i) => i).filter(i => !w.q.correct.includes(i) && w.burn[i] === 0 && !w.burning[i]);
      if (cands.length) { const i = cands[Math.floor(Math.random()*cands.length)]; w.burning[i] = true; w.shown[i] = true; banner("LANTERN!", "A wrong curtain burns away", 1100); Snd.sfx("burn"); paintChips(); return; }
    }
    G.bonus += 50; G.floats.push({text:"+50", x, y:y - 20, life:1, color:"#F2C14E"});
  } else if (p.kind === "shield") { G.shield = true; banner("SHIELD", "Blocks the next rock", 900); }
  else if (p.kind === "slow") { G.slow = 7; banner("SLOW-MO", "More time to think", 900); }
  else if (p.kind === "double") { G.double = 20; banner("2× POINTS", "For 20 seconds", 900); }
  renderPowers();
}
function finish(reason){
  if (G.mode !== "play") return;
  G.mode = "over";
  const score = Math.floor(G.dist) + G.bonus;
  const st = S.stats, isPub = String(G.pack.id).startsWith("pub-");
  const prevBest = st.best || 0;
  st.best = Math.max(prevBest, score);
  if (!isPub) st.perPack[G.pack.id] = Math.max(st.perPack[G.pack.id]||0, score);
  st.answered = (st.answered||0) + G.correct + G.wrong; st.correct = (st.correct||0) + G.correct;
  st.totalRuns = (st.totalRuns || st.runs.length) + 1;
  st.runs.unshift({pack:G.pack.title, score, correct:G.correct, total:G.correct+G.wrong, at:Date.now()});
  st.runs = st.runs.slice(0,20);
  save();
  $("#rReason").textContent = reason === "complete" ? `Pack complete · ${G.pack.title}` : `${G.endReason || "Run over"} · ${G.pack.title}`;
  $("#rScore").textContent = score.toLocaleString();
  $("#rBest").hidden = !(score > prevBest && score > 0);
  $("#rCorrect").textContent = `${G.correct}/${G.correct+G.wrong}`;
  $("#rStreak").textContent = G.bestStreak;
  $("#rDist").textContent = Math.floor(G.dist).toLocaleString();
  const log = G.log.filter(l => !l.ok).concat(G.log.filter(l => l.ok));
  $("#rReviewWrap").hidden = !log.length;
  $("#rReview").innerHTML = log.slice(0,40).map(l => `<li class="${l.ok ? "" : "bad"}"><span class="md">${l.ok ? "✓" : "✗"} ${mdHtml(l.q)}</span>
    <span class="md">${l.ok ? "" : `<span class="muted">You: ${mdHtml(l.choices[l.pick] ?? "–")}</span> · `}<b>${l.correct.map(i => mdHtml(l.choices[i])).join(" / ")}</b></span>
    ${l.explain ? `<span class="ex md">${mdHtml(l.explain)}</span>` : ""}</li>`).join("");
  const key = G.playKey, likeable = !!(key && B && B.signedIn() && !key.startsWith(B.uid + "~") && !key.startsWith("team~"));
  const lb = $("#rLike"); lb.hidden = !likeable;
  if (likeable) { lb.setAttribute("aria-pressed", !!myLikes[key]); lb.textContent = myLikes[key] ? "👍 Liked" : "👍 Like this pack"; }
  setTimeout(() => { $("#qcard").classList.add("idle"); show("results"); }, 700);
}
$("#rLike").onclick = () => { const key = G.playKey, on = !myLikes[key]; if (on) myLikes[key] = true; else delete myLikes[key]; B.like(key, on).catch(() => {}); const lb = $("#rLike"); lb.setAttribute("aria-pressed", on); lb.textContent = on ? "👍 Liked" : "👍 Like this pack"; };
$("#btnAgain").onclick = () => startRun(G.pack, G.runMode);

let hudCache = "";
function updateHud(){
  $("#hScore").textContent = (Math.floor(G.dist) + (G.bonus||0)).toLocaleString();
  const wrap = $("#hStreakWrap");
  wrap.classList.toggle("fever", !!G.fever);
  $("#hStreakLbl").textContent = G.fever ? "Fever" : "Streak";
  $("#hStreak").textContent = G.fever ? `×3 · ${G.streak}` : (G.streak ? "×" + G.streak : "0");
  $("#hSpeed").textContent = (G.speed*3.6).toFixed(0) + " km/h";
}
function renderPowers(){
  const bits = [];
  if (G.shield) bits.push(`<div class="pill">🛡 <small>Shield</small></div>`);
  if (G.slow > 0) bits.push(`<div class="pill">⏳ <small>Slow-mo</small> ${G.slow.toFixed(0)}s</div>`);
  if (G.double > 0) bits.push(`<div class="pill">2× <small>Points</small> ${G.double.toFixed(0)}s</div>`);
  const h = bits.join("");
  if (h !== hudCache) { hudCache = h; $("#powers").innerHTML = h; }
}

/* ---------- pause ---------- */
function pause(){ if (G.mode !== "play" || paused) return; paused = true; show("pause"); }
function resume(){ paused = false; show("game"); last = performance.now(); }
$("#btnPause").onclick = pause;
$("#btnResume").onclick = resume;
$("#btnQuit").onclick = () => { paused = false; show("menu"); };
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

/* ---------- input ---------- */
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input,textarea,select")) return;
  if (!$("#modal").hidden) { if (e.key === "Escape") closeModal(); return; }
  if (G.mode === "play") {
    if (e.key === "Escape" || e.key === "p" || e.key === "P") { paused ? resume() : pause(); e.preventDefault(); return; }
    if (paused) return;
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { moveLane(-1); e.preventDefault(); }
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { moveLane(1); e.preventDefault(); }
    else if (/^[1-4]$/.test(e.key)) setLane(+e.key - 1);
  } else if (e.key === "Escape" && currentScreen !== "menu" && currentScreen !== "edit") show("menu");
});
let ptr = null;
cv.addEventListener("pointerdown", e => { ptr = {x:e.clientX, y:e.clientY}; });
cv.addEventListener("pointerup", e => {
  if (!ptr || G.mode !== "play") { ptr = null; return; }
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr = null;
  if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) moveLane(dx > 0 ? 1 : -1);
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) moveLane(e.clientX < W/2 ? -1 : 1);
});

/* ---------- update ---------- */
function tunnelsNear(){
  const out = [];
  for (let kb = Math.floor((D-40)/80); kb <= Math.floor((D+FAR)/80); kb++) {
    const r = hash(kb + 0.5), start = kb*80;
    if (start < (G.startD||0) + 50) continue;
    if (r < 0.28) out.push({kind:"arch", d:start+40, kb});
    else if (r < 0.46 && !biomeAt(start+30).water) out.push({kind:"tunnel", a:start+18, b:start+46, kb});
  }
  return out;
}
function update(dt){
  G.t += dt;
  if (G.mode === "attract") {
    G.nextSwitch -= dt;
    if (G.nextSwitch <= 0) { G.lane = clamp(G.lane + (Math.random()<0.5?-1:1), 0, 2); G.nextSwitch = 1 + Math.random()*2; }
  }
  if (G.mode === "play" && paused) return;
  const ts = G.slow > 0 ? 0.55 : 1, wdt = dt*ts;
  if (G.mode === "play") {
    G.target = Math.min(MAXS, G.target + wdt*0.04);
    G.speed += (G.target - G.speed) * Math.min(1, dt*1.5);
    const hadSlow = G.slow > 0, hadDouble = G.double > 0;
    G.slow = Math.max(0, G.slow - dt); G.double = Math.max(0, G.double - dt);
    if ((hadSlow && !G.slow) || (hadDouble && !G.double) || Math.floor(G.t*2) !== Math.floor((G.t-dt)*2)) renderPowers();
  }
  const v = (G.mode === "over" ? G.speed*0.4 : G.speed) * ts;
  G.dist += v*dt; G.phase += dt*v*1.25;
  G.tod = (G.tod + dt/200) % 1;
  setView();
  G.bgX += DC0 * v * dt * 55;
  const bi = biomeIdx(G.dist);
  if (bi !== G.curBiome) { G.prevBiome = G.curBiome; G.curBiome = bi; G.biomeT = 0; if (G.mode === "play") { banner(BIOMES[bi].name, "", 1200); Snd.sfx("biome"); } }
  G.biomeT = Math.min(1, G.biomeT + dt/2.5);
  const inT = tunnelsNear().some(t => t.kind === "tunnel" && D > t.a - 1 && D < t.b);
  G.tunnelDark += ((inT ? 1 : 0) - G.tunnelDark) * Math.min(1, dt*2.5);
  const n = G.wall ? G.wall.n : G.n;
  G.laneX += (laneCenter(G.lane, n) - G.laneX) * Math.min(1, dt*10);

  if (G.mode === "play") {
    const w = G.wall;
    if (w) {
      w.z = w.d - G.dist; w.age += wdt; w.gemBob += dt*4;
      for (let i=0;i<w.n;i++) if (!w.shown[i] && w.age >= w.revealAt[i]) { w.shown[i] = true; Snd.sfx("click"); paintChips(); }
      const remain = Math.max(0, w.z) / (G.speed*ts);
      $("#qSecs").textContent = remain.toFixed(1) + "s";
      const bar = $("#qBar"); bar.style.transform = `scaleX(${clamp(w.z/w.z0,0,1)})`; bar.classList.toggle("low", remain < 2);
      if (w.locked < 0 && w.z <= LOCKZ) { w.locked = G.lane; w.shown.fill(true); Snd.sfx("swoosh"); paintChips(); }
      if (w.locked >= 0) w.open[w.locked] = Math.min(1, w.open[w.locked] + dt*5);
      if (w.reveal) for (const c of w.q.correct) w.open[c] = Math.min(1, w.open[c] + dt*4);
      for (let i=0;i<w.n;i++) if (w.burning[i]) {
        w.burn[i] = Math.min(1, w.burn[i] + dt*1.1);
        if (w.burn[i] < 1 && Math.random() < 0.8) {
          const b = basis(w.z), x0 = -HALF + i*laneW(w.n) + 0.07, x1 = x0 + laneW(w.n) - 0.14;
          const px_ = b.ox + (x0 + Math.random()*(x1-x0))*b.s, py_ = b.oy - (w.burn[i]*2.1)*b.s;
          G.parts.push({x:px_, y:py_, vx:(Math.random()-0.5)*b.s*0.3, vy:-b.s*(0.6+Math.random()*0.6), life:0.5+Math.random()*0.4, size:2+b.s*0.03, color:["#F2C14E","#E0782E","#D0384F"][Math.floor(Math.random()*3)], g:-b.s*0.2});
        }
        if (w.burn[i] >= 1) w.burning[i] = false;
      }
      if (!w.resolved && w.z <= 0) resolve();
      if (w.z < -0.9) {
        G.wall = null;
        const exLen = w.q.explain ? plain(w.q.explain).length : 0;
        G.gap = 0.9 + (exLen ? clamp(exLen*0.035, 1.4, 4) : 0);
        if (!exLen) $("#qcard").classList.add("idle");
      }
    } else if (!G.ending) {
      G.gap -= dt; if (G.gap <= 0) spawn();
    }
    if (G.ending) { G.ending -= dt; if (G.ending <= 0) { G.ending = 0; finish("steam"); } }
    for (const p of G.pickups) {
      const z = p.d - G.dist; p.bob += dt*3;
      if (!p.taken && z <= 0.25 && z > -0.8 && Math.abs(G.laneX - p.x) < laneW(n)*0.55) { p.taken = true; collect(p); }
    }
    G.pickups = G.pickups.filter(p => !p.taken && p.d - G.dist > -2);
    if (G.fever && Math.random() < 0.6) {
      const b0 = basis(0);
      G.parts.push({x:b0.ox + (G.laneX + (Math.random()-0.5)*0.3)*b0.s, y:b0.oy - Math.random()*0.3*b0.s, vx:(Math.random()-0.5)*20, vy:-40 - Math.random()*40, life:0.5, size:3, color:Math.random()<0.5 ? "#F2C14E" : "#E0782E", g:0});
    }
    updateHud();
  }
  for (const c of G.crowds) { c.mt += dt; if (c.mood !== "idle" && c.mt > 2.2) c.mood = "idle"; }
  G.crowds = G.crowds.filter(c => c.d - G.dist > -6);
  if (G.rock) {
    G.rock.t += dt;
    if (G.rock.t >= 0.28 && !G.rock.hit) {
      G.rock.hit = true;
      const b0 = basis(0), x = b0.ox + G.laneX*b0.s, y = b0.oy - 0.9*b0.s;
      if (G.rock.shielded) { burst(x, y - b0.s*0.3, ["#3FCB94","#DDF2E7","#8A8578"], 20, b0.s); G.shake = 0.15; }
      else { const bg = G.rock.big ? 1.6 : 1; G.shake = 0.45*bg; G.flash = 0.5*bg; G.tilt = 0.6*bg; burst(x, y, ["#8A8578","#5E594F","#B8B2A3"], 22, b0.s); Snd.sfx("thud"); }
    }
    if (G.rock.t > 0.45) G.rock = null;
  }
  G.shake = Math.max(0, G.shake - dt); G.flash = Math.max(0, G.flash - dt); G.gflash = Math.max(0, G.gflash - dt);
  G.tilt += (0 - G.tilt) * Math.min(1, dt*3);
  for (const p of G.parts) { p.life -= dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += p.g*dt; }
  G.parts = G.parts.filter(p => p.life > 0);
  if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
  for (const f of G.floats) { f.life -= dt; f.y -= 60*dt; }
  G.floats = G.floats.filter(f => f.life > 0);
}

/* ================= render ================= */
const fogAt = z => Math.pow(clamp((z-12)/(FAR-12), 0, 1), 1.1) * 0.9;
const fogc = (c, z, extra) => mix(c, SK.hor, Math.min(1, fogAt(z) + (extra||0)));
function glow(x, y, r, c, a){ G.glows.push({x, y, r, c, a}); }
const lightLevel = () => 0.25 + 0.75*Math.max(SK.night, G.tunnelDark);

function drawSky(){
  const g = ctx.createLinearGradient(0,0,0,HZ);
  g.addColorStop(0, css(SK.top)); g.addColorStop(0.55, css(SK.mid)); g.addColorStop(1, css(SK.hor));
  ctx.fillStyle = g; ctx.fillRect(0,0,W,HZ+1);
  const sr = Math.min(W,H)*0.1;
  if (SK.sun > -0.3) {
    const sy = HZ - SK.sun*HZ*0.75 - sr*0.15, sx = W*0.5;
    const gg = ctx.createRadialGradient(sx, sy, sr*0.2, sx, sy, sr*3.2);
    gg.addColorStop(0, "rgba(255,228,160,.5)"); gg.addColorStop(1, "rgba(255,228,160,0)");
    ctx.fillStyle = gg; ctx.fillRect(0,0,W,HZ);
    ctx.fillStyle = mix("#FBD98F", "#FFF6DA", clamp(SK.sun,0,1));
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
  }
  if (SK.night > 0.05) {
    const mx = W*0.78, my = HZ - (0.2 + SK.night*0.5)*HZ, mr = sr*0.55;
    ctx.globalAlpha = Math.min(1, SK.night*1.5);
    ctx.fillStyle = "#E8EEF7"; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(160,175,200,.6)"; ctx.beginPath(); ctx.arc(mx - mr*0.3, my - mr*0.2, mr*0.2, 0, 7); ctx.arc(mx + mr*0.35, my + mr*0.25, mr*0.14, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    glow(mx, my, mr*4, "200,215,255", 0.25*SK.night);
  }
}
function hillShape(shape, t, s){
  const v0 = 0.55*Math.sin(t*1.3+s) + 0.3*Math.sin(t*2.9+s*2) + 0.15*Math.sin(t*6.1+s*3);
  if (shape === 1) return Math.round(v0*3)/3*1.2 + 0.25;
  if (shape === 2) return 0.22*Math.sin(t*0.8+s) + 0.08*Math.sin(t*3.3+s) - 0.1;
  if (shape === 4) { const a = Math.abs(Math.sin(t*2.2+s)), b2 = Math.abs(Math.sin(t*3.7+s*2)); return Math.pow(a,3)*1.5 + Math.pow(b2,4)*0.9 - 0.2; }
  if (shape === 5) { const tri = k => 1 - Math.abs((((t*k+s) % 1) + 1) % 1 * 2 - 1); return tri(2.3)*1.2 + tri(5.1)*0.4 - 0.15; }
  if (shape === 6) { const i = Math.floor(t*9 + s*3); return 0.15 + hash(i)*1.25 + (hash(i+99) > 0.85 ? 0.5 : 0); }
  if (shape === 3) { const tri = 1 - Math.abs((((t*7+s) % 1) + 1) % 1 * 2 - 1); return v0*0.55 + tri*0.4; }
  return v0;
}
function hillLayer(b, layer, alpha){
  if (alpha <= 0.01) return;
  const amp = layer ? H*0.04 : H*0.065, base = layer ? 0 : H*0.022, off = G.bgX*(layer ? 1 : 0.45) + layer*300;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = mix(b.hills[layer], SK.hor, layer ? 0.12 : 0.32);
  ctx.beginPath(); ctx.moveTo(0, HZ+2);
  for (let x=0; x<=W+6; x+=6) ctx.lineTo(x, HZ - base - amp*hillShape(b.shape, (x+off)*0.004, layer*3+1.7));
  ctx.lineTo(W, HZ+2); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
function drawHills(){
  const cur = BIOMES[G.curBiome] || BIOMES[0], prev = G.prevBiome >= 0 ? BIOMES[G.prevBiome] : cur, bt = smooth(G.biomeT);
  for (const layer of [0,1]) { if (bt < 1) hillLayer(prev, layer, 1); hillLayer(cur, layer, bt < 1 ? bt : 1); }
}

/* ---------- scenery objects ---------- */
function drawLamp(z){
  const b = basis(z), fog = fogAt(z);
  for (const x of [-2.45, 2.45]) {
    const bx = b.ox + x*b.s, by = b.oy, top = b.oy - 2.3*b.s;
    ctx.fillStyle = mix("#0E2A2C", SK.hor, fog);
    ctx.fillRect(bx - b.s*0.05, top, b.s*0.1, by - top);
    ctx.fillRect(bx - b.s*0.14, by - b.s*0.08, b.s*0.28, b.s*0.08);
    ctx.fillStyle = "#FFE3A3"; ctx.beginPath(); ctx.arc(bx, top, b.s*0.1, 0, 7); ctx.fill();
    glow(bx, top, b.s*0.9, "255,214,130", (0.35 + 0.65*lightLevel())*(1-fog));
  }
}
function drawCactus(z, d){
  const b = basis(z);
  for (const side of [-1,1]) {
    const h = hash(d*1.7 + side), x = side*(2.6 + h*1.6), bx = b.ox + x*b.s, by = b.oy;
    if (h < 0.55) {
      const ht = (1.1 + h*0.9)*b.s, wd = 0.2*b.s;
      ctx.fillStyle = fogc("#3E7D4A", z);
      rr(bx - wd/2, by - ht, wd, ht, wd/2); ctx.fill();
      rr(bx - wd*2, by - ht*0.72, wd*0.8, ht*0.35, wd*0.4); ctx.fill();
      ctx.fillRect(bx - wd*1.6, by - ht*0.45, wd*1.2, wd*0.7);
      rr(bx + wd*1.2, by - ht*0.85, wd*0.8, ht*0.4, wd*0.4); ctx.fill();
      ctx.fillRect(bx + wd*0.4, by - ht*0.55, wd*1.2, wd*0.7);
    } else {
      const rw = (0.5 + h*0.6)*b.s;
      ctx.fillStyle = fogc("#7A4A2E", z);
      ctx.beginPath(); ctx.ellipse(bx, by - rw*0.35, rw, rw*0.55, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = fogc("#9C6040", z);
      ctx.beginPath(); ctx.ellipse(bx - rw*0.25, by - rw*0.55, rw*0.45, rw*0.2, -0.2, 0, 7); ctx.fill();
    }
  }
}
function drawPines(z, d){
  const b = basis(z);
  const trees = [];
  for (const side of [-1,1]) {
    const h1 = hash(d*1.3 + side), h2 = hash(d*2.9 - side);
    trees.push({x: side*(4.2 + h2*1.8), h: 2.6 + h2*1.6, dark:true}, {x: side*(2.65 + h1*0.7), h: 2.0 + h1*1.3});
  }
  for (const t of trees) {
    const bx = b.ox + t.x*b.s, by = b.oy, ht = t.h*b.s, wd = ht*0.42;
    ctx.fillStyle = fogc("#4A3524", z); ctx.fillRect(bx - ht*0.03, by - ht*0.2, ht*0.06, ht*0.2);
    ctx.fillStyle = fogc(t.dark ? "#173D22" : "#1F4D2B", z);
    for (let k=0;k<3;k++) {
      const ty = by - ht*0.15 - k*ht*0.26, tw = wd*(1 - k*0.25);
      ctx.beginPath(); ctx.moveTo(bx - tw/2, ty); ctx.lineTo(bx + tw/2, ty); ctx.lineTo(bx, ty - ht*0.42); ctx.closePath(); ctx.fill();
    }
  }
}
function drawRail(z, d){
  const b = basis(z), nb = z + 3 < FAR ? basis(z + 3) : null;
  ctx.lineWidth = Math.max(1, b.s*0.035); ctx.strokeStyle = fogc("#D9B98A", z);
  for (const x of [-2.1, 2.1]) {
    const bx = b.ox + x*b.s, top = b.oy - 1.0*b.s;
    ctx.fillStyle = fogc("#5A3B24", z);
    ctx.fillRect(bx - b.s*0.06, top, b.s*0.12, b.oy - top + b.s*0.4);
    if (nb) {
      const nx = nb.ox + x*nb.s, ny = nb.oy - 0.95*nb.s, sag = (b.oy - 0.7*b.s + nb.oy - 0.7*nb.s)/2;
      ctx.beginPath(); ctx.moveTo(bx, top + b.s*0.05); ctx.quadraticCurveTo((bx+nx)/2, sag, nx, ny); ctx.stroke();
    }
  }
}
function archPath(b, rIn, rOut, outerRect){
  const X = x => b.ox + x*b.s, Y = y => b.oy - y*b.s;
  ctx.beginPath();
  if (outerRect) ctx.rect(X(-10), Y(10), 20*b.s, 10*b.s + 1);
  else { ctx.moveTo(X(-rOut), Y(0)); ctx.lineTo(X(-rOut), Y(2.6)); ctx.arc(X(0), Y(2.6), rOut*b.s, Math.PI, 2*Math.PI); ctx.lineTo(X(rOut), Y(0)); ctx.closePath(); }
  ctx.moveTo(X(rIn), Y(0)); ctx.lineTo(X(rIn), Y(2.6)); ctx.arc(X(0), Y(2.6), rIn*b.s, 0, Math.PI, true); ctx.lineTo(X(-rIn), Y(0)); ctx.closePath();
}
function drawRing(z, d, i){
  const b = basis(z); if (b.s < 0.5) return;
  const bio = biomeAt(d);
  ctx.fillStyle = fogc(bio.stone[i & 1], z, 0.05);
  archPath(b, 2.8, 0, true); ctx.fill("evenodd");
  if (i % 2 === 0) {
    const lx = b.ox, ly = b.oy - 5.15*b.s;
    ctx.fillStyle = "#FFE3A3"; ctx.beginPath(); ctx.arc(lx, ly, b.s*0.08, 0, 7); ctx.fill();
    glow(lx, ly, b.s*1.2, "255,214,130", 0.5*(1-fogAt(z)));
  }
}
function drawPickup(p){
  const z = p.d - D; if (z > FAR - 2 || z < -1.5) return;
  const b = basis(z), x = b.ox + p.x*b.s, y = b.oy - (0.75 + Math.sin(p.bob)*0.08)*b.s, r = 0.26*b.s;
  const col = {lantern:"255,170,80", shield:"63,203,148", slow:"111,179,232", double:"242,193,78"}[p.kind];
  glow(x, y, r*3.5, col, 0.6*(1 - fogAt(z)));
  ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.beginPath(); ctx.ellipse(x, b.oy, r*0.8, r*0.2, 0, 0, 7); ctx.fill();
  if (p.kind === "lantern") {
    ctx.fillStyle = "#D0384F"; ctx.beginPath(); ctx.ellipse(x, y, r*0.8, r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#F2C14E"; ctx.fillRect(x - r*0.5, y - r*1.05, r, r*0.18); ctx.fillRect(x - r*0.5, y + r*0.88, r, r*0.18);
    ctx.fillStyle = "rgba(255,230,160,.9)"; ctx.beginPath(); ctx.ellipse(x, y, r*0.3, r*0.55, 0, 0, 7); ctx.fill();
    return;
  }
  ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.lineWidth = Math.max(1, r*0.12); ctx.strokeStyle = "#13292B"; ctx.stroke();
  ctx.fillStyle = "#13292B"; ctx.strokeStyle = "#13292B";
  if (p.kind === "shield") {
    ctx.beginPath(); ctx.moveTo(x, y - r*0.6); ctx.lineTo(x + r*0.5, y - r*0.35); ctx.quadraticCurveTo(x + r*0.45, y + r*0.35, x, y + r*0.62); ctx.quadraticCurveTo(x - r*0.45, y + r*0.35, x - r*0.5, y - r*0.35); ctx.closePath(); ctx.fill();
  } else if (p.kind === "slow") {
    ctx.beginPath(); ctx.moveTo(x - r*0.4, y - r*0.55); ctx.lineTo(x + r*0.4, y - r*0.55); ctx.lineTo(x - r*0.4, y + r*0.55); ctx.lineTo(x + r*0.4, y + r*0.55); ctx.closePath(); ctx.fill();
  } else {
    const fs = r*0.95; if (fs > 5) { ctx.font = `800 ${fs}px "JetBrains Mono", monospace`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("2×", x, y + fs*0.05); }
  }
}

/* ---------- gate ---------- */
const PAL = {mc:{d:"#7E1629", l:"#C93247", v:"#6E1426"}, t:{d:"#0F5A3A", l:"#2FA878", v:"#0B4A2F"}, f:{d:"#7E1629", l:"#D0384F", v:"#6E1426"}, multi:{d:"#27235E", l:"#5B55B8", v:"#1D1A4A"}};
function drawCurtainHalf(x0, x1, top, bot, pal, z){
  if (x1 - x0 < 1 || bot - top < 1) return;
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (let k=0;k<=6;k++) g.addColorStop(k/6, fogc(k % 2 ? pal.l : pal.d, z));
  ctx.fillStyle = g; ctx.fillRect(x0, top, x1 - x0, bot - top);
}
function drawWall(w){
  const z = w.z; if (z > FAR - 1) return;
  const b = basis(z), s = b.s; if (s < 0.5) return;
  const X = x => b.ox + x*s, Y = y => b.oy - y*s;
  const lw = laneW(w.n), doorH = 2.1, lintel = 2.35, pil = 0.07;
  const yb = Y(0), yt = Y(doorH), yl = Y(lintel + 0.28);
  const fade = clamp((FAR - z)/14, 0, 1), type = w.q.type;
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(X(-HALF-0.1), yb, 2*(HALF+0.1)*s, s*0.08);
  for (let i=0;i<w.n;i++) {
    const x0 = -HALF + i*lw + pil, x1 = -HALF + (i+1)*lw - pil;
    const L = X(x0), R = X(x1), dw = R - L, cxp = (L+R)/2;
    ctx.fillStyle = fogc("#123236", z); ctx.fillRect(L, yt, dw, yb - yt);
    const o = w.open[i], br = w.burn[i], right = w.q.correct.includes(i);
    if (o > 0.02 || br > 0.02) {
      if (right) {
        const gy0 = yb - (yb-yt)*0.4, gg = ctx.createRadialGradient(cxp, gy0, 0, cxp, gy0, dw*0.7);
        gg.addColorStop(0, "rgba(255,226,140,.95)"); gg.addColorStop(1, "rgba(255,226,140,0)");
        ctx.fillStyle = gg; ctx.fillRect(L, yt, dw, yb - yt);
        if (!(w.resolved && w.locked === i)) {
          const gy = yb - (yb-yt)*0.45 + Math.sin(w.gemBob)*s*0.05, gs = s*0.2;
          ctx.fillStyle = "#3FCB94"; ctx.beginPath(); ctx.moveTo(cxp, gy-gs); ctx.lineTo(cxp+gs*0.75, gy-gs*0.25); ctx.lineTo(cxp, gy+gs); ctx.lineTo(cxp-gs*0.75, gy-gs*0.25); ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#B8F5D8"; ctx.beginPath(); ctx.moveTo(cxp, gy-gs); ctx.lineTo(cxp+gs*0.75, gy-gs*0.25); ctx.lineTo(cxp, gy-gs*0.1); ctx.closePath(); ctx.fill();
        }
      } else {
        const rr_ = Math.min(dw*0.34, s*0.42), ry = yb - rr_;
        ctx.fillStyle = "#7B766A"; ctx.beginPath(); ctx.ellipse(cxp, ry, rr_*1.05, rr_, 0, 0, 7); ctx.fill();
        ctx.fillStyle = "#5E594F"; ctx.beginPath(); ctx.arc(cxp - rr_*0.35, ry - rr_*0.2, rr_*0.2, 0, 7); ctx.arc(cxp + rr_*0.4, ry + rr_*0.25, rr_*0.14, 0, 7); ctx.fill();
        ctx.fillStyle = "#A39E90"; ctx.beginPath(); ctx.ellipse(cxp - rr_*0.3, ry - rr_*0.55, rr_*0.35, rr_*0.15, -0.3, 0, 7); ctx.fill();
      }
    }
    const pal = type === "tf" ? (i ? PAL.f : PAL.t) : type === "multi" ? PAL.multi : PAL.mc;
    const half = dw/2, shut = half*(1 - o*0.92), cbot = yb - (yb - yt)*br;
    drawCurtainHalf(L, L + shut, yt, cbot, pal, z);
    drawCurtainHalf(R - shut, R, yt, cbot, pal, z);
    if (w.burning[i] && br < 1 && shut > 1) {
      const fg = ctx.createLinearGradient(0, cbot - s*0.12, 0, cbot + s*0.05);
      fg.addColorStop(0, "rgba(242,193,78,0)"); fg.addColorStop(0.6, "rgba(242,140,40,.95)"); fg.addColorStop(1, "rgba(208,56,79,0)");
      ctx.fillStyle = fg; ctx.fillRect(L, cbot - s*0.12, dw, s*0.17);
      glow(cxp, cbot, dw*0.6, "255,150,60", 0.7);
    }
    const vh = s*0.22, n_ = Math.max(3, Math.round(dw/(s*0.25)));
    ctx.fillStyle = fogc(pal.v, z);
    ctx.beginPath(); ctx.moveTo(L, yt);
    for (let k=0;k<n_;k++){ const a = L + dw*k/n_, e = L + dw*(k+1)/n_; ctx.lineTo(a, yt+vh*0.55); ctx.quadraticCurveTo((a+e)/2, yt+vh*1.3, e, yt+vh*0.55); }
    ctx.lineTo(R, yt); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fogc(w.boss ? "#F2C14E" : "#E0B84A", z); ctx.fillRect(L, yt + vh*0.5, dw, Math.max(1, s*0.02));
    if (o < 0.6 && br < 0.35) {
      ctx.save(); ctx.globalAlpha = fade * (1 - Math.max(o/0.6, br/0.35));
      const bR = clamp(s*0.13, 3, 26), bcx = cxp, bcy = yt + vh + bR + s*0.08;
      ctx.fillStyle = type === "tf" ? "#FFF4DE" : "#F2C14E"; ctx.beginPath(); ctx.arc(bcx, bcy, bR, 0, 7); ctx.fill();
      ctx.lineWidth = Math.max(1, bR*0.12); ctx.strokeStyle = "#13292B"; ctx.stroke();
      if (bR > 6) {
        ctx.fillStyle = type === "tf" ? (i ? "#B3263A" : "#1F8A5B") : "#13292B";
        ctx.font = `${Math.round(bR*1.1)}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(type === "tf" ? (i ? "F" : "T") : LETTERS[i], bcx, bcy + bR*0.06);
      }
      const fs = clamp(s*0.19, 0, 44), top = bcy + bR + s*0.06, midY = top + (yb - top)*0.42;
      if (!w.shown[i]) {
        const qs = clamp(s*0.5, 0, 90);
        if (qs > 8) { ctx.font = `${qs}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "rgba(255,244,222,.85)"; ctx.fillText("?", cxp, midY); }
      } else if (fs >= 7) drawRich(w.q.choices[i], cxp, midY, dw*0.84, fs, 3, "#FFF4DE");
      ctx.restore();
    }
  }
  const frame = fogc(w.boss ? "#D9A93B" : type === "multi" ? "#8C86B8" : "#9C8467", z);
  ctx.fillStyle = frame;
  for (let i=0;i<=w.n;i++) { const x = -HALF + i*lw; ctx.fillRect(X(x-pil), yl, 2*pil*s, yb - yl); }
  ctx.fillRect(X(-HALF-pil), yl, (2*HALF+2*pil)*s, Y(doorH) - yl);
  ctx.fillStyle = fogc(w.boss ? "#A77E22" : "#7A6550", z); ctx.fillRect(X(-HALF-pil), Y(doorH) - s*0.05, (2*HALF+2*pil)*s, s*0.05);
  ctx.fillStyle = fogc(w.boss ? "#FBE08A" : "#BFA682", z); ctx.fillRect(X(-HALF-pil), yl, (2*HALF+2*pil)*s, s*0.05);
  const plaque = w.boss ? "BOSS ×3" : type === "tf" ? "TRUE OR FALSE" : type === "multi" ? "ANY CORRECT" : "";
  if (plaque) {
    const fs = s*0.13;
    if (fs > 6) { ctx.font = `${fs}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = w.boss ? "#6E1426" : "#13292B"; ctx.fillText(plaque, X(0), (yl + Y(doorH))/2 + fs*0.08); }
  }
  if (w.boss) {
    const cx_ = X(0), cy_ = yl - s*0.05, cw = s*0.5;
    ctx.fillStyle = "#F2C14E"; ctx.beginPath(); ctx.moveTo(cx_ - cw/2, cy_); ctx.lineTo(cx_ - cw/2, cy_ - cw*0.45); ctx.lineTo(cx_ - cw/4, cy_ - cw*0.2); ctx.lineTo(cx_, cy_ - cw*0.55); ctx.lineTo(cx_ + cw/4, cy_ - cw*0.2); ctx.lineTo(cx_ + cw/2, cy_ - cw*0.45); ctx.lineTo(cx_ + cw/2, cy_); ctx.closePath(); ctx.fill();
  }
  for (const x of [-HALF - pil, HALF + pil]) glow(X(x), yl, s*0.45, "255,190,110", 0.08 + 0.25*lightLevel());
  ctx.restore();
}

/* ---------- runner ---------- */
function drawRunner(){
  const b = basis(0), s = b.s, x = b.ox + G.laneX*s, y = b.oy, u = s*0.8;
  const ph = G.phase, sw = Math.sin(ph), bob = Math.abs(Math.cos(ph))*u*0.05;
  const target = laneCenter(G.lane, G.wall ? G.wall.n : G.n);
  const lean = clamp((target - G.laneX)*0.25, -0.25, 0.25) - DC0*1.2;
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(x, y, u*0.28, u*0.06, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y - bob); ctx.rotate(lean + G.tilt*Math.sin(G.t*30)*0.4);
  const ink = "#13292B";
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = ink; ctx.lineWidth = u*0.1;
  for (const d of [-1,1]) {
    const k = d*sw;
    ctx.beginPath(); ctx.moveTo(d*u*0.08, -u*0.5); ctx.lineTo(d*u*0.1, -u*0.26 + k*u*0.06); ctx.lineTo(d*u*0.1, -u*0.02 - Math.max(0,k)*u*0.14); ctx.stroke();
    ctx.fillStyle = "#F4ECDD"; ctx.beginPath(); ctx.ellipse(d*u*0.1, -u*0.02 - Math.max(0,k)*u*0.14, u*0.07, u*0.045, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = G.fever ? "#F2C14E" : "#B3263A";
  ctx.beginPath(); ctx.moveTo(-u*0.04, -u*0.98); ctx.quadraticCurveTo(u*0.22 + Math.sin(G.t*9)*u*0.05, -u*0.9, u*0.3 + Math.sin(G.t*11)*u*0.06, -u*0.72); ctx.lineTo(u*0.24, -u*0.7); ctx.quadraticCurveTo(u*0.14, -u*0.84, -u*0.04, -u*0.9); ctx.fill();
  ctx.strokeStyle = "#E3D5BB"; ctx.lineWidth = u*0.08;
  for (const d of [-1,1]) { ctx.beginPath(); ctx.moveTo(d*u*0.17, -u*0.88); ctx.lineTo(d*u*0.25, -u*0.66 - d*sw*u*0.08); ctx.stroke(); }
  ctx.fillStyle = "#F4ECDD"; rr(-u*0.19, -u*0.95, u*0.38, u*0.47, u*0.12); ctx.fill();
  ctx.lineWidth = u*0.025; ctx.strokeStyle = ink; ctx.stroke();
  ctx.fillStyle = "#2F6B6A"; rr(-u*0.13, -u*0.88, u*0.26, u*0.3, u*0.07); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#F2C14E"; ctx.fillRect(-u*0.09, -u*0.76, u*0.18, u*0.035);
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(0, -u*1.08, u*0.14, 0, 7); ctx.fill();
  ctx.fillStyle = G.fever ? "#F2C14E" : "#B3263A"; rr(-u*0.16, -u*1.0, u*0.32, u*0.08, u*0.04); ctx.fill();
  ctx.restore();
  if (G.shield) {
    const pr = 0.5 + 0.5*Math.sin(G.t*4);
    ctx.strokeStyle = `rgba(63,203,148,${0.55 + 0.3*pr})`; ctx.lineWidth = Math.max(2, u*0.03);
    ctx.fillStyle = `rgba(63,203,148,${0.08 + 0.06*pr})`;
    ctx.beginPath(); ctx.ellipse(x, y - u*0.58, u*0.46, u*0.66, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
}
function drawRock(){
  const r = G.rock; if (!r) return;
  const b = basis(0), s = b.s, tx = b.ox + G.laneX*s, ty = b.oy - 0.9*s;
  if (!r.hit) {
    const k = r.t/0.28, y = -s*0.4 + (ty + s*0.4)*k*k;
    ctx.fillStyle = "#7B766A"; ctx.beginPath(); ctx.ellipse(tx, y, s*0.22, s*0.19, r.t*6, 0, 7); ctx.fill();
    ctx.fillStyle = "#5E594F"; ctx.beginPath(); ctx.arc(tx - s*0.07, y - s*0.03, s*0.05, 0, 7); ctx.fill();
  } else if (r.shielded) {
    const k = (r.t - 0.28)/0.17, bx = tx + k*s*1.4, by = ty - s*0.5 - Math.sin(k*Math.PI)*s*0.6;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = "#7B766A"; ctx.beginPath(); ctx.ellipse(bx, by, s*0.22, s*0.19, r.t*9, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- scene ---------- */
function drawCrowd(c){
  const z0 = c.d - D; if (z0 > FAR - 2) return;
  const t = G.t, mood = c.mood, cs = c.bio.crowd, boat = !!cs.boat;
  const lift = boat ? 0.28 + Math.sin(t*1.8)*0.04 : 0;
  const count = c.people.length/2;
  // boats (Rope Bridge): the crowd floats beside the bridge instead of standing on water
  if (boat) for (const side of [-1,1]) {
    const za = z0 - 0.4, zb = z0 + 0.9, a = basis(za), b2 = basis(zb), f = fogAt(z0);
    const xi = side*(HALF + 0.85), xo_ = side*(HALF + 1.35 + count*0.42);
    const bob = Math.sin(t*1.8)*0.04;
    ctx.fillStyle = mix("#6B4226", SK.hor, f);
    ctx.beginPath();
    ctx.moveTo(a.ox + xi*a.s, a.oy - (0.35+bob)*a.s); ctx.lineTo(a.ox + xo_*a.s, a.oy - (0.35+bob)*a.s);
    ctx.lineTo(a.ox + (xo_ - side*0.25)*a.s, a.oy + 0.05*a.s); ctx.lineTo(a.ox + (xi + side*0.2)*a.s, a.oy + 0.05*a.s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mix("#8C5A34", SK.hor, f);
    ctx.fillRect(a.ox + Math.min(xi,xo_)*a.s, a.oy - (0.38+bob)*a.s, Math.abs(xo_-xi)*a.s, 0.07*a.s);
    ctx.fillStyle = `rgba(255,255,255,${0.35*(1-f)})`;
    ctx.fillRect(a.ox + Math.min(xi,xo_)*a.s, a.oy + 0.03*a.s, Math.abs(xo_-xi)*a.s, 0.04*a.s);
  }
  // banner
  const b = basis(z0 + 0.6), fog = fogAt(z0), bl = boat ? lift + 0.1 : 0;
  for (const side of [-1,1]) {
    const x0 = HALF + (boat ? 1.0 : 0.55);
    const xa = side*x0, xb = side*(x0 + (c.boss ? 2.4 : 1.6));
    const Xa = b.ox + xa*b.s, Xb = b.ox + xb*b.s, top = b.oy - (1.75+bl)*b.s, bot = b.oy - (1.25+bl)*b.s, foot = b.oy - bl*b.s;
    ctx.fillStyle = mix(c.bio.neon ? "#0E0C20" : "#3A2A1E", SK.hor, fog);
    ctx.fillRect(Xa - b.s*0.03, top, b.s*0.06, foot - top); ctx.fillRect(Xb - b.s*0.03, top, b.s*0.06, foot - top);
    const L = Math.min(Xa, Xb), R = Math.max(Xa, Xb);
    ctx.fillStyle = mix(c.boss ? "#F2C14E" : cs.banner[0], SK.hor, fog);
    ctx.fillRect(L, top, R - L, bot - top);
    if (c.bio.neon) { ctx.strokeStyle = cs.banner[1]; ctx.lineWidth = Math.max(1, b.s*0.03); ctx.strokeRect(L, top, R-L, bot-top); glow((L+R)/2, (top+bot)/2, (R-L)*0.7, "255,61,165", 0.35*(1-fog)); }
    const fs = (bot - top)*0.7;
    if (fs > 6) { ctx.font = `${fs}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = mix(c.boss ? "#6E1426" : cs.banner[1], SK.hor, fog); ctx.fillText(c.word, (L+R)/2, (top+bot)/2 + fs*0.05); }
  }
  const ppl = c.people.slice().sort((a,b) => b.dz - a.dz);
  for (const p of ppl) {
    const z = z0 + p.dz; if (z < -3.5) continue;
    const pb = basis(z), u = pb.s*p.h, X = pb.ox + p.x*pb.s, Y = pb.oy - lift*pb.s, f = fogAt(z);
    const jump = mood === "cheer" ? Math.abs(Math.sin(t*9 + p.ph))*u*(boat ? 0.12 : 0.28) : Math.abs(Math.sin(t*3 + p.ph))*u*0.03;
    const cr = mood === "wince" ? u*0.12 : 0, y = Y - jump + cr;
    const col = mix(p.c, SK.hor, f), col2 = mix(p.c2, SK.hor, f);
    ctx.fillStyle = mix(c.bio.snow ? "#2B3A55" : "#1E2A2C", SK.hor, f);
    ctx.fillRect(X - u*0.1, y - u*0.3, u*0.07, u*0.3 - cr); ctx.fillRect(X + u*0.03, y - u*0.3, u*0.07, u*0.3 - cr);
    ctx.fillStyle = col;
    if (cs.robe) {
      rr(X - u*0.17, y - u*0.68, u*0.34, u*0.6, u*0.08); ctx.fill();
      ctx.fillStyle = col2; for (let k=-1;k<=1;k++) ctx.fillRect(X + k*u*0.1 - u*0.02, y - u*0.66, u*0.04, u*0.56);
    } else { rr(X - u*0.15, y - u*0.68, u*0.3, u*0.42, u*0.09); ctx.fill(); }
    if (cs.scarf) { ctx.fillStyle = col2; ctx.fillRect(X - u*0.14, y - u*0.7, u*0.28, u*0.07); ctx.fillRect(X + u*0.04, y - u*0.68, u*0.07, u*0.2); }
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, u*0.07); ctx.lineCap = "round";
    const hands = [];
    ctx.beginPath();
    if (mood === "cheer") { const wv = Math.sin(t*12 + p.ph)*u*0.06; ctx.moveTo(X - u*0.13, y - u*0.62); ctx.lineTo(X - u*0.28 + wv, y - u*1.02); ctx.moveTo(X + u*0.13, y - u*0.62); ctx.lineTo(X + u*0.28 - wv, y - u*1.02); hands.push([X - u*0.28 + wv, y - u*1.02], [X + u*0.28 - wv, y - u*1.02]); }
    else if (mood === "wince") { ctx.moveTo(X - u*0.13, y - u*0.62); ctx.lineTo(X - u*0.12, y - u*0.88); ctx.moveTo(X + u*0.13, y - u*0.62); ctx.lineTo(X + u*0.12, y - u*0.88); }
    else { ctx.moveTo(X - u*0.14, y - u*0.62); ctx.lineTo(X - u*0.2, y - u*0.36); ctx.moveTo(X + u*0.14, y - u*0.62); ctx.lineTo(X + u*0.2, y - u*0.36); hands.push([X + u*0.2, y - u*0.36]); }
    ctx.stroke();
    // head
    ctx.fillStyle = mix(p.skin, SK.hor, f); ctx.beginPath(); ctx.arc(X, y - u*0.8, u*0.12, 0, 7); ctx.fill();
    if (mood === "wince") { ctx.fillStyle = mix(p.skin, "#000", 0.25); ctx.beginPath(); ctx.arc(X, y - u*0.9, u*0.09, Math.PI, 0); ctx.fill(); }
    // hats
    const hy = y - u*0.88;
    if (cs.hat === "cowboy") { ctx.fillStyle = mix("#7A4A2E", SK.hor, f); ctx.beginPath(); ctx.ellipse(X, hy + u*0.02, u*0.24, u*0.05, 0, 0, 7); ctx.fill(); rr(X - u*0.1, hy - u*0.12, u*0.2, u*0.14, u*0.04); ctx.fill(); }
    else if (cs.hat === "sailor") { ctx.fillStyle = mix("#FFFFFF", SK.hor, f); ctx.beginPath(); ctx.ellipse(X, hy, u*0.14, u*0.06, 0, 0, 7); ctx.fill(); ctx.fillStyle = mix("#1B3F6B", SK.hor, f); ctx.fillRect(X - u*0.12, hy + u*0.02, u*0.24, u*0.03); }
    else if (cs.hat === "beanie") { ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(X, hy + u*0.03, u*0.125, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(X, hy - u*0.11, u*0.045, 0, 7); ctx.fill(); }
    else if (cs.hat === "doppi") { ctx.fillStyle = mix("#15161A", SK.hor, f); ctx.fillRect(X - u*0.11, hy - u*0.06, u*0.22, u*0.09); ctx.fillStyle = mix("#F4ECDD", SK.hor, f); for (let k=-1;k<=1;k++) ctx.fillRect(X + k*u*0.065 - u*0.015, hy - u*0.035, u*0.03, u*0.03); }
    // props
    if (cs.prop === "lantern" && hands.length) {
      const [hx, hyy] = hands[hands.length-1], r = u*0.09;
      ctx.fillStyle = "#D0384F"; ctx.beginPath(); ctx.ellipse(hx, hyy - r*0.6, r*0.8, r, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "#F2C14E"; ctx.fillRect(hx - r*0.5, hyy - r*1.7, r, r*0.25);
      glow(hx, hyy - r*0.6, r*4, "255,120,80", 0.35*(1-f));
    } else if (cs.prop === "phone" && mood === "cheer") {
      for (const [hx, hyy] of hands) { ctx.fillStyle = "#EAF6FF"; ctx.fillRect(hx - u*0.035, hyy - u*0.1, u*0.07, u*0.1); glow(hx, hyy - u*0.05, u*0.5, "180,230,255", 0.5*(1-f)); }
    }
  }
}
function crowdNear(d){ for (const c of G.crowds) if (d > c.d - 5 && d < c.d + 4) return true; return false; }
function drawChinaHouse(z, d){
  const b = basis(z), f = fogAt(z);
  for (const side of [-1,1]) {
    const h = 2.3 + hash(d*1.3 + side)*1.3, xa = side*3.0, xb = side*5.6;
    const L = b.ox + Math.min(xa,xb)*b.s, R = b.ox + Math.max(xa,xb)*b.s, top = b.oy - h*b.s, bot = b.oy;
    const wall = ["#A8322B","#C9913E","#6E2C22"][Math.floor(hash(d*2.1 + side)*3)];
    ctx.fillStyle = fogc(wall, z); ctx.fillRect(L, top, R-L, bot-top);
    for (let row=0; row<2; row++) for (let k=0;k<3;k++) {
      const wx = L + (R-L)*(0.12 + k*0.3), wy = top + (bot-top)*(0.2 + row*0.4), ww = (R-L)*0.16, wh = (bot-top)*0.2;
      const lit = hash(d + k*7 + row*13 + side) > 0.35;
      ctx.fillStyle = lit ? fogc("#FFD58A", z, 0) : fogc("#3A1A14", z); ctx.fillRect(wx, wy, ww, wh);
      if (lit) glow(wx + ww/2, wy + wh/2, ww*1.2, "255,200,120", 0.25*lightLevel()*(1-f));
    }
    const ov = 0.35*b.s, rh = 0.55*b.s;
    ctx.fillStyle = fogc("#2F4A44", z);
    ctx.beginPath(); ctx.moveTo(L - ov, top); ctx.lineTo(L - ov*1.3, top - rh*0.35); ctx.lineTo(L + ov*0.4, top - rh); ctx.lineTo(R - ov*0.4, top - rh); ctx.lineTo(R + ov*1.3, top - rh*0.35); ctx.lineTo(R + ov, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fogc("#E0B84A", z); ctx.fillRect(L + ov*0.4, top - rh - b.s*0.04, R - L - ov*0.8, b.s*0.05);
  }
}
function drawLanternString(z, d){
  const b = basis(z), f = fogAt(z);
  const X = x => b.ox + x*b.s, Y = y => b.oy - y*b.s;
  ctx.fillStyle = fogc("#3A1A14", z);
  for (const x of [-2.35, 2.35]) ctx.fillRect(X(x) - b.s*0.05, Y(3.3), b.s*0.1, Y(0) - Y(3.3));
  ctx.strokeStyle = fogc("#2A1A14", z); ctx.lineWidth = Math.max(1, b.s*0.02);
  ctx.beginPath(); ctx.moveTo(X(-2.35), Y(3.2)); ctx.quadraticCurveTo(X(0), Y(2.5), X(2.35), Y(3.2)); ctx.stroke();
  for (let i=1;i<=5;i++) {
    const tt = i/6, x = -2.35 + 4.7*tt, y = 3.2 - 4*0.35*tt*(1-tt)*2 - 0.25, r = 0.15*b.s;
    const cx_ = X(x), cy_ = Y(y);
    ctx.fillStyle = "#D0384F"; ctx.beginPath(); ctx.ellipse(cx_, cy_, r*0.85, r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#F2C14E"; ctx.fillRect(cx_ - r*0.4, cy_ - r*1.1, r*0.8, r*0.22); ctx.fillRect(cx_ - r*0.4, cy_ + r*0.9, r*0.8, r*0.22);
    glow(cx_, cy_, r*4, "255,110,70", (0.25 + 0.5*lightLevel())*(1-f));
  }
}
function drawBazaar(z, d, k){
  const b = basis(z), f = fogAt(z);
  if (k % 2 === 0) for (const side of [-1,1]) {
    const hh = hash(d*1.7 + side), h = 2.1 + hh*1.1, xa = side*3.1, xb = side*5.4;
    const L = b.ox + Math.min(xa,xb)*b.s, R = b.ox + Math.max(xa,xb)*b.s, top = b.oy - h*b.s, bot = b.oy, cx_ = (L+R)/2;
    if (hh > 0.82) { // minaret behind
      const mx = b.ox + side*6.2*b.s, mt = b.oy - 6.2*b.s, mw = 0.5*b.s;
      ctx.fillStyle = fogc("#D9BE8C", z); ctx.fillRect(mx - mw/2, mt, mw, bot - mt);
      ctx.fillStyle = fogc("#1FA3A8", z); for (const yy of [0.25, 0.55, 0.8]) ctx.fillRect(mx - mw/2, mt + (bot-mt)*yy, mw, b.s*0.12);
      ctx.fillRect(mx - mw*0.8, mt - b.s*0.1, mw*1.6, b.s*0.14);
      ctx.beginPath(); ctx.arc(mx, mt - b.s*0.1, mw*0.5, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = fogc(hh > 0.5 ? "#E2C48E" : "#D4B07A", z); ctx.fillRect(L, top, R-L, bot-top);
    ctx.fillStyle = fogc("#2C5AA0", z); ctx.fillRect(L, top, R-L, b.s*0.14);
    ctx.fillStyle = fogc("#1FA3A8", z); for (let i=0;i<6;i++) ctx.fillRect(L + (R-L)*(i+0.35)/6, top + b.s*0.03, (R-L)*0.05, b.s*0.08);
    // arched doorway
    const dw = (R-L)*0.22, dh = (bot-top)*0.55;
    ctx.fillStyle = fogc("#5A3B24", z); ctx.beginPath(); ctx.moveTo(cx_ - dw/2, bot); ctx.lineTo(cx_ - dw/2, bot - dh*0.7); ctx.quadraticCurveTo(cx_ - dw/2, bot - dh, cx_, bot - dh*1.08); ctx.quadraticCurveTo(cx_ + dw/2, bot - dh, cx_ + dw/2, bot - dh*0.7); ctx.lineTo(cx_ + dw/2, bot); ctx.closePath(); ctx.fill();
    if (hh < 0.5) { // turquoise dome
      const dr = (R-L)*0.28;
      ctx.fillStyle = fogc("#1FA3A8", z); ctx.beginPath(); ctx.ellipse(cx_, top, dr, dr*1.05, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = fogc("#7FD6D6", z); ctx.beginPath(); ctx.ellipse(cx_ - dr*0.35, top - dr*0.55, dr*0.2, dr*0.12, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = fogc("#E0B84A", z); ctx.fillRect(cx_ - b.s*0.02, top - dr*1.05 - b.s*0.25, b.s*0.04, b.s*0.25);
    }
  }
  if (k % 2 === 1) { // market stall on one side
    const side = hash(d*3.3) < 0.5 ? -1 : 1, x0 = side*2.45, x1 = side*3.0;
    const L = b.ox + Math.min(x0,x1)*b.s, R = b.ox + Math.max(x0,x1)*b.s, top = b.oy - 1.6*b.s, bot = b.oy;
    ctx.fillStyle = fogc("#5A3B24", z); ctx.fillRect(L, top, b.s*0.05, bot-top); ctx.fillRect(R - b.s*0.05, top, b.s*0.05, bot-top);
    const cols = ["#B3263A","#F4ECDD"];
    for (let i=0;i<5;i++) { ctx.fillStyle = fogc(cols[i&1], z); ctx.fillRect(L - b.s*0.1 + (R-L+b.s*0.2)*i/5, top, (R-L+b.s*0.2)/5 + 1, b.s*0.28); }
    ctx.fillStyle = fogc("#8E2A6B", z); ctx.fillRect(L + b.s*0.06, top + b.s*0.35, R-L-b.s*0.12, b.s*0.75);
    ctx.fillStyle = fogc("#E0A526", z); ctx.beginPath(); const mx = (L+R)/2, my = top + b.s*0.72; ctx.moveTo(mx, my - b.s*0.25); ctx.lineTo(mx + (R-L)*0.3, my); ctx.lineTo(mx, my + b.s*0.25); ctx.lineTo(mx - (R-L)*0.3, my); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fogc("#7A4A2E", z); ctx.fillRect(L, bot - b.s*0.45, R-L, b.s*0.12);
    for (let i=0;i<4;i++) { ctx.fillStyle = fogc(["#E0782E","#C6D23D","#D0384F","#F2C14E"][i], z); ctx.beginPath(); ctx.arc(L + (R-L)*(0.2+i*0.2), bot - b.s*0.5, b.s*0.06, 0, 7); ctx.fill(); }
  }
}
function drawSnowPines(z, d){
  const b = basis(z);
  const trees = [];
  for (const side of [-1,1]) {
    const h1 = hash(d*1.3 + side), h2 = hash(d*2.9 - side);
    trees.push({x: side*(4.2 + h2*1.8), h: 2.6 + h2*1.6, dark:true}, {x: side*(2.7 + h1*0.7), h: 2.0 + h1*1.3});
    if (h1 > 0.88) trees.push({x: side*2.6, snowman:true});
  }
  for (const t of trees) {
    const bx = b.ox + t.x*b.s, by = b.oy;
    if (t.snowman) {
      const r = 0.22*b.s;
      ctx.fillStyle = fogc("#FFFFFF", z);
      ctx.beginPath(); ctx.arc(bx, by - r, r, 0, 7); ctx.arc(bx, by - r*2.5, r*0.7, 0, 7); ctx.arc(bx, by - r*3.6, r*0.5, 0, 7); ctx.fill();
      ctx.fillStyle = fogc("#E0782E", z); ctx.beginPath(); ctx.moveTo(bx, by - r*3.6); ctx.lineTo(bx + r*0.7, by - r*3.5); ctx.lineTo(bx, by - r*3.45); ctx.fill();
      ctx.fillStyle = fogc("#D0384F", z); ctx.fillRect(bx - r*0.6, by - r*3.1, r*1.2, r*0.2);
      continue;
    }
    const ht = t.h*b.s, wd = ht*0.42;
    ctx.fillStyle = fogc("#FFFFFF", z); ctx.beginPath(); ctx.ellipse(bx, by, wd*0.6, ht*0.06, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = fogc("#4A3524", z); ctx.fillRect(bx - ht*0.03, by - ht*0.2, ht*0.06, ht*0.18);
    for (let k=0;k<3;k++) {
      const ty = by - ht*0.15 - k*ht*0.26, tw = wd*(1 - k*0.25), th = ht*0.42;
      ctx.fillStyle = fogc(t.dark ? "#1E4230" : "#285540", z);
      ctx.beginPath(); ctx.moveTo(bx - tw/2, ty); ctx.lineTo(bx + tw/2, ty); ctx.lineTo(bx, ty - th); ctx.closePath(); ctx.fill();
      ctx.fillStyle = fogc("#F4FAFF", z);
      ctx.beginPath(); ctx.moveTo(bx - tw*0.22, ty - th*0.55); ctx.lineTo(bx + tw*0.22, ty - th*0.55); ctx.lineTo(bx, ty - th); ctx.closePath(); ctx.fill();
    }
  }
}
function drawNeon(z, d){
  const b = basis(z), f = fogAt(z);
  const NEON = [["255,61,165","#FF3DA5"],["47,224,255","#2FE0FF"],["198,255,61","#C6FF3D"],["170,110,255","#AA6EFF"]];
  const WORDS = ["QUIZ","24H","OPEN","RUN","WOW","CAFE"];
  for (const side of [-1,1]) {
    const hh = hash(d*1.9 + side), h = 4 + hh*5, xa = side*3.2, xb = side*5.4;
    const L = b.ox + Math.min(xa,xb)*b.s, R = b.ox + Math.max(xa,xb)*b.s, top = b.oy - h*b.s, bot = b.oy;
    ctx.fillStyle = fogc("#1C1936", z, 0); ctx.fillRect(L, top, R-L, bot-top);
    const cols = 4, rows = Math.max(3, Math.floor(h*1.5));
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      if (hash(d*3 + r*17 + c*5 + side) < 0.45) continue;
      const wx = L + (R-L)*(0.1 + c*0.22), wy = top + (bot-top)*(0.05 + r*0.9/rows), ww = (R-L)*0.12, wh = (bot-top)*0.45/rows;
      ctx.fillStyle = hash(r + c + d) < 0.5 ? "rgba(120,220,255,.75)" : "rgba(255,200,120,.7)"; ctx.fillRect(wx, wy, ww, wh);
    }
    const n = NEON[Math.floor(hash(d*5.1 + side)*4)];
    const sx = side < 0 ? R - (R-L)*0.28 : L + (R-L)*0.04, sy = top + (bot-top)*0.25, sw = (R-L)*0.24, sh = (bot-top)*0.45;
    ctx.strokeStyle = n[1]; ctx.lineWidth = Math.max(1, b.s*0.04); ctx.strokeRect(sx, sy, sw, sh);
    glow(sx + sw/2, sy + sh/2, Math.max(sw, sh)*0.9, n[0], 0.45*(1-f));
    const word = WORDS[Math.floor(hash(d*7.7 + side)*WORDS.length)], fs = sw*0.62;
    if (fs > 6) { ctx.save(); ctx.font = `${fs}px Bungee, Impact, sans-serif`; ctx.fillStyle = n[1]; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const step = Math.min(sh/word.length, fs*1.05); for (let i=0;i<word.length;i++) ctx.fillText(word[i], sx + sw/2, sy + sh/2 + (i - (word.length-1)/2)*step); ctx.restore(); }
  }
}
function drawArch(z, d){
  const b = basis(z); if (b.s < 0.5) return;
  const bio = biomeAt(d), X = x => b.ox + x*b.s, Y = y => b.oy - y*b.s;
  if (bio.arch === "paifang") {
    ctx.fillStyle = fogc("#A32B2B", z);
    for (const x of [-2.95, 2.95]) ctx.fillRect(X(x) - 0.14*b.s, Y(4.0), 0.28*b.s, Y(0) - Y(4.0));
    ctx.fillRect(X(-3.2), Y(3.4), 6.4*b.s, 0.25*b.s);
    ctx.fillStyle = fogc("#E0B84A", z); ctx.fillRect(X(-0.6), Y(3.95), 1.2*b.s, 0.55*b.s);
    const fs = 0.34*b.s; if (fs > 6) { ctx.font = `${fs}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#6E1426"; ctx.fillText("RUN", X(0), Y(3.68)); }
    for (const [yy, w] of [[4.0, 3.8], [4.75, 2.2]]) {
      ctx.fillStyle = fogc("#2F4A44", z);
      ctx.beginPath(); ctx.moveTo(X(-w), Y(yy)); ctx.lineTo(X(-w - 0.3), Y(yy + 0.35)); ctx.lineTo(X(-w + 0.4), Y(yy + 0.55)); ctx.lineTo(X(w - 0.4), Y(yy + 0.55)); ctx.lineTo(X(w + 0.3), Y(yy + 0.35)); ctx.lineTo(X(w), Y(yy)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = fogc("#E0B84A", z); ctx.fillRect(X(-w + 0.4), Y(yy + 0.6), (2*w - 0.8)*b.s, 0.05*b.s);
    }
    return;
  }
  if (bio.arch === "iwan") {
    ctx.fillStyle = fogc("#D9BE8C", z);
    ctx.beginPath(); ctx.rect(X(-3.5), Y(6.0), 7*b.s, 6*b.s);
    ctx.moveTo(X(-2.7), Y(0)); ctx.lineTo(X(-2.7), Y(3.1)); ctx.quadraticCurveTo(X(-2.7), Y(4.5), X(0), Y(5.2)); ctx.quadraticCurveTo(X(2.7), Y(4.5), X(2.7), Y(3.1)); ctx.lineTo(X(2.7), Y(0)); ctx.closePath();
    ctx.fill("evenodd");
    ctx.strokeStyle = fogc("#1FA3A8", z); ctx.lineWidth = Math.max(1, 0.16*b.s);
    ctx.beginPath(); ctx.moveTo(X(-2.8), Y(0)); ctx.lineTo(X(-2.8), Y(3.1)); ctx.quadraticCurveTo(X(-2.8), Y(4.6), X(0), Y(5.35)); ctx.quadraticCurveTo(X(2.8), Y(4.6), X(2.8), Y(3.1)); ctx.lineTo(X(2.8), Y(0)); ctx.stroke();
    ctx.fillStyle = fogc("#2C5AA0", z); ctx.fillRect(X(-3.5), Y(6.0), 7*b.s, 0.35*b.s);
    ctx.fillStyle = fogc("#1FA3A8", z); for (let i=0;i<9;i++) ctx.fillRect(X(-3.3 + i*0.8), Y(5.9), 0.25*b.s, 0.15*b.s);
    return;
  }
  if (bio.arch === "neon") {
    const pulse = 0.6 + 0.4*Math.sin(G.t*5 + d);
    ctx.strokeStyle = `rgba(255,61,165,${0.6 + 0.4*pulse})`; ctx.lineWidth = Math.max(1, 0.1*b.s);
    ctx.beginPath(); ctx.moveTo(X(-2.8), Y(0)); ctx.lineTo(X(-2.8), Y(2.6)); ctx.arc(X(0), Y(2.6), 2.8*b.s, Math.PI, 2*Math.PI); ctx.lineTo(X(2.8), Y(0)); ctx.stroke();
    ctx.strokeStyle = `rgba(47,224,255,${0.5 + 0.4*(1-pulse)})`; ctx.lineWidth = Math.max(1, 0.05*b.s);
    ctx.beginPath(); ctx.moveTo(X(-3.1), Y(0)); ctx.lineTo(X(-3.1), Y(2.6)); ctx.arc(X(0), Y(2.6), 3.1*b.s, Math.PI, 2*Math.PI); ctx.lineTo(X(3.1), Y(0)); ctx.stroke();
    for (let i=0;i<=6;i++) { const a = Math.PI + Math.PI*i/6; glow(X(0) + Math.cos(a)*2.8*b.s, Y(2.6) + Math.sin(a)*2.8*b.s, b.s*0.9, "255,61,165", 0.25*(1-fogAt(z))); }
    return;
  }
  ctx.fillStyle = fogc(bio.stone[0], z);
  archPath(b, 2.75, 3.25, false); ctx.fill("evenodd");
  ctx.fillStyle = fogc(bio.stone[1], z);
  ctx.fillRect(b.ox - 3.25*b.s, b.oy - 0.3*b.s, 0.5*b.s, 0.3*b.s); ctx.fillRect(b.ox + 2.75*b.s, b.oy - 0.3*b.s, 0.5*b.s, 0.3*b.s);
  ctx.fillStyle = fogc("#F2C14E", z, 0.1);
  ctx.fillRect(b.ox - 0.2*b.s, b.oy - 5.85*b.s, 0.4*b.s, 0.5*b.s);
}
function buildObjects(){
  const objs = [];
  for (let k = Math.ceil((D-1.5)/3); k <= Math.floor((D+FAR)/3); k++) {
    const d = k*3, z = d - D, bio = biomeAt(d), side = bio.side;
    if (side === "rail") { objs.push({z, f:() => drawRail(z, d)}); continue; }
    if (side === "china" && k % 4 === 1) objs.push({z, f:() => drawLanternString(z, d)});
    if (k % 2 !== 0 && side !== "bazaar") continue;
    const clear = crowdNear(d);
    if (side === "bazaar") { if (!clear) objs.push({z, f:() => drawBazaar(z, d, k)}); continue; }
    if (clear) continue;
    const fn = side === "lamp" ? () => drawLamp(z) : side === "cactus" ? () => drawCactus(z, d) : side === "pine" ? () => drawPines(z, d)
      : side === "china" ? () => drawChinaHouse(z, d) : side === "snowpine" ? () => drawSnowPines(z, d) : () => drawNeon(z, d);
    objs.push({z, f:fn});
  }
  for (const t of tunnelsNear()) {
    if (t.kind === "arch") { const z = t.d - D; if (z > -1.5 && z < FAR) objs.push({z, f:() => drawArch(z, t.d)}); }
    else for (let d = t.a, i = 0; d <= t.b; d += 2.5, i++) { const z = d - D; if (z > -1.5 && z < FAR) { const ii = i, dd = d; objs.push({z, f:() => drawRing(z, dd, ii)}); } }
  }
  for (const c of G.crowds) { const z = c.d - D; if (z > -4 && z < FAR) objs.push({z: z + 0.8, f:() => drawCrowd(c)}); }
  for (const p of G.pickups) { const z = p.d - D; if (z > -1.5 && z < FAR) objs.push({z, f:() => drawPickup(p)}); }
  if (G.wall && G.wall.z < FAR) objs.push({z:G.wall.z, f:() => drawWall(G.wall)});
  objs.push({z:0.001, f:drawRunner});
  return objs.sort((a,b) => b.z - a.z);
}
function drawScene(){
  const objs = buildObjects();
  const N = FAR, frac = D - Math.floor(D), zs = [], bs = [];
  for (let k=0;k<=N;k++) { const z = k - frac - 1; zs.push(z); bs.push(basis(z)); }
  const farBio = biomeAt(D + FAR);
  ctx.fillStyle = mix(farBio.ground[0], SK.hor, 0.85); ctx.fillRect(0, HZ, W, H - HZ);
  let oi = 0;
  while (oi < objs.length && objs[oi].z >= zs[N]) oi++;
  const pulse = 0.5 + 0.5*Math.sin(G.t*8);
  const quad = (a, b, y1, y2, xa1, xb1, xa2, xb2) => { ctx.beginPath(); ctx.moveTo(a.ox + xa1*a.s, y1); ctx.lineTo(a.ox + xb1*a.s, y1); ctx.lineTo(b.ox + xb2*b.s, y2); ctx.lineTo(b.ox + xa2*b.s, y2); ctx.closePath(); ctx.fill(); };
  for (let k=N-1; k>=0; k--) {
    const a = bs[k], b = bs[k+1], y1 = a.oy + 0.6, y2 = b.oy;
    if (y1 > y2 + 0.6 && y2 < H) {
      const dN = D + zs[k], idx = Math.round(dN), bio = biomeAt(dN), z = zs[k], fog = fogAt(z);
      ctx.fillStyle = mix(bio.ground[Math.floor(idx/3) & 1], SK.hor, fog); ctx.fillRect(0, y2, W, y1 - y2);
      if (bio.water && hash(idx) < 0.45) {
        ctx.fillStyle = `rgba(255,255,255,${0.22*(1-fog)})`;
        const sx = hash(idx + 7)*W, sw = (0.6 + hash(idx+3))*a.s*0.5;
        ctx.fillRect(sx, y2 + (y1-y2)*0.3, sw, Math.max(1, (y1-y2)*0.25));
        ctx.fillRect(W - sx*0.7, y2 + (y1-y2)*0.6, sw*0.6, Math.max(1, (y1-y2)*0.2));
      }
      ctx.fillStyle = mix(bio.curb[1], SK.hor, fog); quad(a, b, y1, y2, -HALF-0.3, HALF+0.3, -HALF-0.3, HALF+0.3);
      ctx.fillStyle = mix(idx & 1 ? bio.curb[0] : mixA(bio.curb[0], "#FFFFFF", 0.18), SK.hor, fog);
      quad(a, b, y1, y2, -HALF-0.18, HALF+0.18, -HALF-0.18, HALF+0.18);
      ctx.fillStyle = mix(bio.road[bio.water ? idx & 1 : (idx >> 1) & 1], SK.hor, fog); quad(a, b, y1, y2, -HALF, HALF, -HALF, HALF);
      if (idx % 3 !== 2) {
        const sa = slotsAt(dN), sb = slotsAt(dN + 1);
        ctx.fillStyle = bio.water ? "rgba(60,35,20,.55)" : bio.neon ? "rgba(47,224,255,.9)" : bio.snow ? "rgba(90,130,170,.5)" : "rgba(255,250,235,.6)";
        for (let j=0;j<3;j++) {
          const al = Math.min(sa[j][1], sb[j][1]) * (1 - fog); if (al < 0.03) continue;
          ctx.globalAlpha = al; quad(a, b, y1, y2, sa[j][0]-0.03, sa[j][0]+0.03, sb[j][0]-0.03, sb[j][0]+0.03);
        }
        ctx.globalAlpha = 1;
      }
      if (bio.neon && !G.fever) {
        ctx.fillStyle = `rgba(255,61,165,${0.8*(1-fog)})`;
        quad(a, b, y1, y2, -HALF-0.05, -HALF+0.03, -HALF-0.05, -HALF+0.03);
        quad(a, b, y1, y2, HALF-0.03, HALF+0.05, HALF-0.03, HALF+0.05);
      }
      if (G.fever) {
        ctx.fillStyle = `rgba(242,193,78,${(0.5 + 0.4*pulse)*(1-fog)})`;
        quad(a, b, y1, y2, -HALF-0.05, -HALF+0.05, -HALF-0.05, -HALF+0.05);
        quad(a, b, y1, y2, HALF-0.05, HALF+0.05, HALF-0.05, HALF+0.05);
      }
    }
    while (oi < objs.length && objs[oi].z >= zs[k]) objs[oi++].f();
  }
  while (oi < objs.length) objs[oi++].f();
}
function render(){
  setView(); skyNow(); G.glows = [];
  ctx.save();
  if (G.shake > 0) { const m = G.shake*18; ctx.translate((Math.random()-0.5)*m, (Math.random()-0.5)*m); }
  drawSky(); drawHills(); drawScene();
  const hz = ctx.createLinearGradient(0, HZ - 2, 0, HZ + H*0.06);
  hz.addColorStop(0, css(SK.hor, 0.5)); hz.addColorStop(1, css(SK.hor, 0));
  ctx.fillStyle = hz; ctx.fillRect(0, HZ - 2, W, H*0.06 + 2);
  drawRock();
  for (const p of G.parts) { ctx.globalAlpha = clamp(p.life*1.6, 0, 1); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size); }
  ctx.globalAlpha = 1;
  if (SK.snow > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${0.85*SK.snow})`;
    for (let i=0;i<110;i++) {
      const sp = 30 + hash(i+3)*70, r = 1 + hash(i+11)*2.2;
      const x = ((hash(i)*W + G.t*(12 + hash(i+5)*20) + Math.sin(G.t*1.3 + i)*14) % W + W) % W;
      const y = ((hash(i+9)*H + G.t*sp) % H);
      ctx.fillRect(x, y, r, r);
    }
  }
  // darkness
  const dark = 0.45*SK.night;
  if (dark > 0.01) { ctx.fillStyle = `rgba(6,12,34,${dark})`; ctx.fillRect(-20, -20, W+40, H+40); }
  if (G.tunnelDark > 0.01) { ctx.fillStyle = `rgba(0,0,0,${0.35*G.tunnelDark})`; ctx.fillRect(-20, -20, W+40, H+40); }
  // light pass
  ctx.globalCompositeOperation = "lighter";
  if (SK.night > 0.05) for (const st of STARS) { const a = SK.night*(0.55 + 0.45*Math.sin(G.t*2 + st.ph)); ctx.fillStyle = `rgba(255,255,240,${a})`; ctx.fillRect(st.x*W, st.y*(HZ - H*0.12), st.r, st.r); }
  for (const g of G.glows) {
    if (g.a <= 0.01 || g.r < 1) continue;
    const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    gr.addColorStop(0, `rgba(${g.c},${g.a})`); gr.addColorStop(1, `rgba(${g.c},0)`);
    ctx.fillStyle = gr; ctx.fillRect(g.x - g.r, g.y - g.r, g.r*2, g.r*2);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of G.floats) { ctx.globalAlpha = clamp(f.life*1.5, 0, 1); ctx.font = `700 ${Math.round(clamp(basis(0).s*0.2, 18, 34))}px "JetBrains Mono", monospace`; ctx.fillStyle = "#13292B"; ctx.fillText(f.text, f.x+2, f.y+2); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (G.slow > 0) {
    ctx.fillStyle = "rgba(80,140,220,.12)"; ctx.fillRect(0,0,W,H);
    const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.35, W/2, H/2, Math.max(W,H)*0.75);
    vg.addColorStop(0, "rgba(40,80,160,0)"); vg.addColorStop(1, "rgba(40,80,160,.35)"); ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  }
  if (G.fever) {
    const vg = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.4, W/2, H/2, Math.max(W,H)*0.75);
    vg.addColorStop(0, "rgba(242,193,78,0)"); vg.addColorStop(1, `rgba(242,160,60,${0.18 + 0.12*Math.sin(G.t*8)})`); ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(179,38,58,${G.flash*0.5})`; ctx.fillRect(0,0,W,H); }
  if (G.gflash > 0) { ctx.fillStyle = `rgba(242,193,78,${G.gflash*0.35})`; ctx.fillRect(0,0,W,H); }
  if (G.mode === "attract") { ctx.fillStyle = "rgba(8,30,33,.28)"; ctx.fillRect(0,0,W,H); }
}
let last = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now - last)/1000); last = now;
  if (currentScreen !== "lib" && currentScreen !== "edit") { update(dt); render(); Snd.tick(); }
  requestAnimationFrame(loop);
}
attract();
if (/debug/.test(location.hash)) window.__cr = {get G(){ return G; }, get S(){ return S; }, BIOMES, startRun, show};
show("menu");
requestAnimationFrame(loop);
connect();
})();
