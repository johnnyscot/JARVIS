'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const core = $('#core'), log = $('#log'), input = $('#input'), micBtn = $('#mic'), sendBtn = $('#send');
const MAX = 800, CTX = 6, KEEP = 60, THEMES = ['cyan', 'amber', 'violet'];

// ---------- almacenamiento (solo este navegador; nunca claves) ----------
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar en este navegador.'); } }
};
const isStr = (s, n) => typeof s === 'string' && s.length <= n;
const prefs = { voice: true, name: 'JARVIS', theme: 'cyan', vname: '', rate: 1, ...(store.get('jv_prefs', {}) || {}) };
if (typeof prefs.voice !== 'boolean') prefs.voice = true;
if (!isStr(prefs.name, 20) || !prefs.name.trim()) prefs.name = 'JARVIS';
if (!THEMES.includes(prefs.theme)) prefs.theme = 'cyan';
if (!isStr(prefs.vname, 120)) prefs.vname = '';
if (!(prefs.rate >= 0.6 && prefs.rate <= 1.6)) prefs.rate = 1;
const savePrefs = () => store.set('jv_prefs', prefs);
let notes = [].concat(store.get('jv_notes', [])).filter(n => n && isStr(n.id, 30) && isStr(n.text, 200)).slice(0, 100);
let hist = [].concat(store.get('jv_hist', [])).filter(h => h && (h.role === 'user' || h.role === 'model') && isStr(h.text, 4000) && isStr(h.time, 16)).slice(-KEEP);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let use = store.get('jv_use', {}); if (!use || use.day !== today() || !(use.n >= 0)) use = { day: today(), n: 0 };

// ---------- utilidades de interfaz ----------
let errTimer;
function setState(s) { core.dataset.state = s; $('#state').textContent = s; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3800); }
function fail(msg) { toast(msg); setState('ERROR'); clearTimeout(errTimer); errTimer = setTimeout(() => core.dataset.state === 'ERROR' && setState('IDLE'), 3500); }
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [660, 880, 1100].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.value = .08; o.connect(g); g.connect(a.destination); o.start(a.currentTime + i * .25); o.stop(a.currentTime + i * .25 + .18); }); } catch { /* sin audio */ } }
function applyTheme() { document.body.dataset.theme = prefs.theme; $('#theme').value = prefs.theme; }
function showQuota() { $('#quota').textContent = 'HOY: ' + use.n + ' consulta' + (use.n === 1 ? '' : 's') + ' a Gemini'; }
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }, 5000);

// ---------- markdown ligero (construye DOM, sin innerHTML) ----------
function inline(el, s) {
  s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(p => {
    if (!p) return; let n;
    if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) { n = document.createElement('strong'); n.textContent = p.slice(2, -2); }
    else if (p.length > 2 && p[0] === '`' && p.endsWith('`')) { n = document.createElement('code'); n.textContent = p.slice(1, -1); }
    else n = document.createTextNode(p);
    el.append(n);
  });
}
function md(text) {
  const box = document.createElement('div'); let list = null;
  text.split('```').forEach((seg, i) => {
    if (i % 2) { const pre = document.createElement('pre'); pre.textContent = seg.replace(/^\w*\n/, '').trim(); box.append(pre); return; }
    list = null;
    seg.split('\n').forEach(line => {
      const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)/);
      if (m) {
        const tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
        if (!list || list.tagName.toLowerCase() !== tag) { list = document.createElement(tag); box.append(list); }
        const li = document.createElement('li'); inline(li, m[1]); list.append(li);
      } else { list = null; if (!line.trim()) return; const p = document.createElement('p'); inline(p, line.replace(/^#+\s*/, '')); box.append(p); }
    });
  });
  return box;
}

// ---------- chat ----------
const hhmm = () => new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
function render(role, text, time, isErr) {
  const d = document.createElement('div'); d.className = 'm ' + (role === 'user' ? 'user' : 'bot') + (isErr ? ' err' : '');
  d.append(role === 'user' ? document.createTextNode(text) : md(text));
  const sm = document.createElement('small'); sm.textContent = time;
  if (role === 'model') { const c = document.createElement('button'); c.textContent = 'Copiar'; c.onclick = () => navigator.clipboard.writeText(text).then(() => toast('Copiado.'), () => toast('No se pudo copiar.')); sm.append(c); }
  d.append(sm); log.append(d); log.scrollTop = log.scrollHeight;
}
function say(role, text, isErr) {
  const time = hhmm(); render(role, text, time, isErr);
  if (!isErr) { hist.push({ role, text: text.slice(0, 4000), time }); hist = hist.slice(-KEEP); store.set('jv_hist', hist); }
}
function loadChat() {
  log.textContent = ''; hist.forEach(h => render(h.role, h.text, h.time));
  if (!hist.length) render('model', 'Hola, soy ' + prefs.name + '. Puedes escribirme o dictarme. Di «ayuda» para ver los comandos locales; el resto lo responde Gemini.', hhmm());
}

// ---------- voz: síntesis ----------
const synth = window.speechSynthesis; let spk = 0;
function loadVoices() {
  const sel = $('#vsel'); if (!synth) return; sel.textContent = '';
  const vs = synth.getVoices().filter(v => /^es/i.test(v.lang));
  vs.forEach(v => { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name + ' (' + v.lang + ')'; sel.append(o); });
  if (!vs.length) { const o = document.createElement('option'); o.textContent = 'Voz del sistema'; sel.append(o); }
  else sel.value = vs.some(v => v.name === prefs.vname) ? prefs.vname : vs[0].name;
}
function speak(text) {
  if (!prefs.voice || !synth) return;
  synth.cancel(); const id = ++spk;
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
  const vs = synth.getVoices(), v = vs.find(x => x.name === prefs.vname) || vs.find(x => /^es/i.test(x.lang));
  if (v) u.voice = v; u.lang = v ? v.lang : 'es-ES'; u.rate = prefs.rate;
  u.onstart = () => id === spk && setState('SPEAKING');
  u.onend = u.onerror = () => { if (id === spk && core.dataset.state === 'SPEAKING') setState('IDLE'); };
  synth.speak(u);
}
function stopSpeech() { spk++; if (synth) synth.cancel(); if (core.dataset.state === 'SPEAKING') setState('IDLE'); }

// ---------- voz: dictado (solo al pulsar; sin escucha permanente) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null, busy = false;
micBtn.onclick = () => {
  if (!SR) return toast('Tu navegador no admite dictado. Usa Chrome o Edge, o escribe.');
  if (rec) return rec.stop();
  if (busy) return;
  stopSpeech();
  rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true;
  rec.onstart = () => { setState('LISTENING'); micBtn.classList.add('on'); };
  rec.onresult = e => { input.value = [...e.results].map(r => r[0].transcript).join('').slice(0, MAX); };
  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    fail(e.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : e.error === 'network' ? 'El dictado necesita Chrome o Edge con conexión (Brave y algunas VPN lo bloquean). Puedes escribir.' : 'Error de dictado: ' + e.error);
  };
  rec.onend = () => { rec = null; micBtn.classList.remove('on'); if (core.dataset.state === 'LISTENING') setState('IDLE'); input.focus(); };
  try { rec.start(); } catch { rec = null; fail('No se pudo iniciar el micrófono.'); }
};

// ---------- temporizador ----------
const T = { left: 0, end: 0, run: false, on: false, iv: null };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' : '') + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function tShow() { $('#tdisp').textContent = T.on ? mmss(T.run ? T.end - Date.now() : T.left) : '00:00'; $('#tpause').textContent = T.on && !T.run ? 'Reanudar' : 'Pausar'; document.title = T.on && T.run ? mmss(T.end - Date.now()) + ' · JARVIS' : 'JARVIS AI'; }
function tStop() { clearInterval(T.iv); T.on = T.run = false; tShow(); }
function tTick() { if (!T.run) return; if (Date.now() >= T.end) { tStop(); const m = 'El temporizador ha terminado.'; toast(m); beep(); say('model', m); speak(m); } else tShow(); }
function tStart(ms) { clearInterval(T.iv); Object.assign(T, { on: true, run: true, left: ms, end: Date.now() + ms }); T.iv = setInterval(tTick, 250); tShow(); }
function tToggle() {
  if (!T.on) return 'No hay ningún temporizador activo.';
  if (T.run) { T.left = T.end - Date.now(); T.run = false; tShow(); return 'Temporizador en pausa.'; }
  T.end = Date.now() + T.left; T.run = true; tShow(); return 'Temporizador reanudado.';
}
$('#tpause').onclick = () => toast(tToggle());
$('#tcancel').onclick = () => { if (T.on) { tStop(); toast('Temporizador cancelado.'); } };

// ---------- notas ----------
function drawNotes() {
  const ul = $('#notes'); ul.textContent = '';
  if (!notes.length) { const li = document.createElement('li'); li.textContent = 'Aún no hay notas.'; ul.append(li); return; }
  notes.forEach(n => {
    const li = document.createElement('li'), p = document.createElement('span'), row = document.createElement('div');
    p.textContent = n.text;
    const ed = document.createElement('button'); ed.textContent = 'Editar';
    ed.onclick = () => { const v = prompt('Editar nota', n.text); if (v && v.trim()) { n.text = v.trim().slice(0, 200); store.set('jv_notes', notes); drawNotes(); } };
    const del = document.createElement('button'); del.textContent = 'Eliminar';
    del.onclick = () => { notes = notes.filter(x => x !== n); store.set('jv_notes', notes); drawNotes(); };
    row.append(ed, del); li.append(p, row); ul.append(li);
  });
}
function addNote(t) {
  t = t.trim().slice(0, 200); if (!t) return false;
  notes.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: t }); notes = notes.slice(0, 100);
  store.set('jv_notes', notes); drawNotes(); return true;
}
$('#nadd').onclick = () => { const i = $('#ninput'); if (addNote(i.value)) i.value = ''; };
$('#ninput').onkeydown = e => e.key === 'Enter' && $('#nadd').click();
function openTab(name) { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name)); $$('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + name; }); }
$$('.tabs button').forEach(b => { b.onclick = () => openTab(b.dataset.tab); });

// ---------- calculadora segura (sin eval) ----------
function calc(src) {
  const s = src.replace(/,/g, '.').replace(/\bpor\b|[x×]/g, '*').replace(/\bentre\b|÷/g, '/').replace(/\bmas\b/g, '+').replace(/\bmenos\b/g, '-').replace(/\s+/g, '');
  if (!s || !/^[\d.+\-*/^%()]+$/.test(s)) return null;
  let i = 0;
  const atom = () => { if (s[i] === '(') { i++; const v = add(); if (s[i++] !== ')') throw 0; return v; } const m = s.slice(i).match(/^\d*\.?\d+/); if (!m) throw 0; i += m[0].length; return +m[0]; };
  const un = () => s[i] === '-' ? (i++, -un()) : s[i] === '+' ? (i++, un()) : atom();
  const pw = () => { const b = un(); return s[i] === '^' ? (i++, b ** pw()) : b; };
  const mul = () => { let v = pw(); while ('*/%'.includes(s[i] || '#')) { const o = s[i++], r = pw(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
  function add() { let v = mul(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = mul(); v = o === '+' ? v + r : v - r; } return v; }
  try { const v = add(); return i === s.length && Number.isFinite(v) ? v : null; } catch { return null; }
}

// ---------- comandos locales (no usan Gemini) ----------
const SITES = { google: 'https://www.google.com', youtube: 'https://www.youtube.com', wikipedia: 'https://es.wikipedia.org', github: 'https://github.com', vercel: 'https://vercel.com', gmail: 'https://mail.google.com' };
function openSite(raw) {
  const r = raw.trim(); let url = SITES[r.toLowerCase()];
  if (!url && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(r)) url = /^https?:\/\//i.test(r) ? r : 'https://' + r;
  if (!url) return 'No reconozco ese sitio. Prueba con google, youtube, wikipedia, github, gmail o un dominio como ejemplo.com.';
  try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 0; window.open(u.href, '_blank', 'noopener,noreferrer'); return 'Abriendo ' + u.hostname + '.'; }
  catch { return 'Esa dirección no es válida o no está permitida (solo http y https).'; }
}
function local(raw) {
  const t = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); let m;
  if (/\bque hora es\b|\bhora actual\b/.test(t)) return 'Son las ' + hhmm() + '.';
  if (/\bque fecha\b|\bque dia es\b/.test(t)) return 'Hoy es ' + new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  if (/^abr(e|eme|ir)\s+\S/.test(t)) return openSite(raw.trim().replace(/^\S+\s+/, ''));
  if (/\b(pausa|pausar|reanuda|reanudar)\b.*temporizador/.test(t)) return tToggle();
  if (/\b(cancela|cancelar|deten|detener)\b.*temporizador/.test(t)) { if (!T.on) return 'No hay ningún temporizador activo.'; tStop(); return 'Temporizador cancelado.'; }
  if (/temporizador|cronometro/.test(t)) {
    m = t.match(/(\d+)\s*(hora|horas|h|minuto|minutos|min|segundo|segundos|seg|s)?\b/);
    if (!m) return 'Indica la duración, por ejemplo: «temporizador 5 minutos».';
    const n = +m[1], u = m[2] || 'min', ms = n * (/^h/.test(u) ? 3600000 : /^(s|seg)/.test(u) ? 1000 : 60000);
    if (!n || ms > 86400000) return 'La duración debe estar entre 1 segundo y 24 horas.';
    openTab('timer'); tStart(ms); return 'Temporizador iniciado: ' + mmss(ms) + '.';
  }
  if ((m = raw.match(/^\s*(?:crear|crea|anota|añade|anade|guarda|nueva)?\s*(?:una\s+)?nota\b\s*[:\-]?\s*(.*)$/i))) {
    if (m[1].trim()) return addNote(m[1]) ? 'Nota guardada.' : 'No se pudo guardar la nota.';
    openTab('notes'); $('#ninput').focus(); return 'Escribe tu nota en el panel de la derecha, o di «crear nota comprar pan».';
  }
  if ((m = t.match(/^(?:calcula|calcular|cuanto es|resuelve)\s+(.+)$/))) { const v = calc(m[1]); return v === null ? 'No pude calcular eso. Usa números y + - * / ^ ( ).' : m[1].trim() + ' = ' + v.toLocaleString('es', { maximumFractionDigits: 10 }); }
  if (/\b(tira|lanza)\b.*\bdado\b/.test(t)) return 'Ha salido un ' + (1 + Math.floor(Math.random() * 6)) + '.';
  if (/\b(tira|lanza)\b.*\bmoneda\b/.test(t)) return Math.random() < .5 ? 'Cara.' : 'Cruz.';
  if ((m = t.match(/^(?:tema|cambia el tema a|modo)\s+(cian|azul|ambar|naranja|violeta|morado)$/))) { prefs.theme = /cian|azul/.test(m[1]) ? 'cyan' : /ambar|naranja/.test(m[1]) ? 'amber' : 'violet'; savePrefs(); applyTheme(); return 'Tema cambiado.'; }
  if ((m = t.match(/(?:llamate|tu nombre es|cambia tu nombre a)\s+(.{1,20})$/))) { prefs.name = raw.trim().slice(raw.trim().length - m[1].length); savePrefs(); $('#name').textContent = prefs.name; return 'Ahora me llamo ' + prefs.name + '.'; }
  if (/^(ayuda|ayudame|help)\b/.test(t)) return 'Comandos locales (sin Gemini):\n- «¿qué hora es?» · «¿qué fecha es hoy?»\n- «crear nota comprar pan»\n- «temporizador 5 minutos» (también pausar, reanudar, cancelar)\n- «abrir youtube» o «abrir ejemplo.com»\n- «calcula (12+8)*3» · «tira un dado» · «tira una moneda»\n- «tema ámbar» · «llámate Friday»\nTodo lo demás lo responde Gemini.';
  return null;
}

// ---------- envío ----------
async function send(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  if (text.length > MAX) return toast('Máximo ' + MAX + ' caracteres.');
  input.value = ''; stopSpeech();
  const ctx = hist.slice(-CTX).map(h => ({ role: h.role, text: h.text.slice(0, MAX) }));
  say('user', text);
  const l = local(text);
  if (l !== null) { say('model', l); speak(l); return; }
  busy = true; setState('THINKING'); sendBtn.disabled = true;
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: ctx }), signal: ctrl.signal });
    let data = null; try { data = await r.json(); } catch { /* no JSON */ }
    if (!r.ok || !data || typeof data.reply !== 'string') {
      const msg = (data && data.error) || 'El backend /api/chat no responde. Ejecuta «vercel dev» o usa la web desplegada en Vercel.';
      say('model', msg, true); return fail(msg);
    }
    use.n++; store.set('jv_use', use); showQuota();
    say('model', data.reply); setState('IDLE'); speak(data.reply);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'La solicitud tardó demasiado.' : 'Sin conexión con el servidor.';
    say('model', msg, true); fail(msg);
  } finally { clearTimeout(to); busy = false; sendBtn.disabled = false; }
}

// ---------- estado real del backend ----------
async function ping() {
  const n = $('#net');
  try {
    const d = await (await fetch('/api/chat')).json();
    if (!d || d.ok !== true) throw 0;
    n.textContent = d.configured ? 'GEMINI: LISTO' : 'GEMINI: FALTAN VARIABLES'; n.dataset.s = d.configured ? 'ok' : 'warn';
  } catch { n.textContent = 'GEMINI: SIN BACKEND'; n.dataset.s = 'bad'; }
}

// ---------- eventos ----------
sendBtn.onclick = () => send(input.value);
input.onkeydown = e => e.key === 'Enter' && send(input.value);
$('#chips').onclick = e => { const q = e.target.dataset && e.target.dataset.q; if (q) send(q); };
$('#stop').onclick = stopSpeech;
$('#voice').onclick = () => { prefs.voice = !prefs.voice; savePrefs(); if (!prefs.voice) stopSpeech(); $('#voice').textContent = 'Voz: ' + (prefs.voice ? 'sí' : 'no'); };
$('#vsel').onchange = e => { prefs.vname = e.target.value; savePrefs(); };
$('#rate').oninput = e => { prefs.rate = +e.target.value; savePrefs(); };
$('#theme').onchange = e => { prefs.theme = THEMES.includes(e.target.value) ? e.target.value : 'cyan'; savePrefs(); applyTheme(); };
$('#clear').onclick = () => { hist = []; store.set('jv_hist', hist); loadChat(); toast('Historial borrado.'); };
$('#export').onclick = () => {
  if (!hist.length) return toast('No hay conversación que exportar.');
  const txt = hist.map(h => '[' + h.time + '] ' + (h.role === 'user' ? 'Tú' : prefs.name) + ': ' + h.text).join('\n\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'jarvis-conversacion.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') stopSpeech();
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
});
if (synth) { synth.onvoiceschanged = loadVoices; loadVoices(); } else { $('#voice').disabled = $('#stop').disabled = $('#vsel').disabled = $('#rate').disabled = true; }
if (!SR) micBtn.title = 'Tu navegador no admite dictado';
$('#name').textContent = prefs.name; $('#voice').textContent = 'Voz: ' + (prefs.voice ? 'sí' : 'no'); $('#rate').value = prefs.rate;
$('#clock').textContent = hhmm(); applyTheme(); showQuota(); loadChat(); drawNotes(); tShow(); ping();
