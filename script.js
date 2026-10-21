'use strict';
const $ = s => document.querySelector(s);
const core = $('#core'), log = $('#log'), input = $('#input'), micBtn = $('#mic');
const MAX = 800, CTX = 6, KEEP = 40;

// ---------- almacenamiento seguro (solo en este navegador; sin claves ni datos sensibles) ----------
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar en este navegador.'); } }
};
const isStr = (s, n) => typeof s === 'string' && s.length <= n;
const prefs = { voice: true, name: 'JARVIS', ...(store.get('jv_prefs', {}) || {}) };
if (typeof prefs.voice !== 'boolean') prefs.voice = true;
if (!isStr(prefs.name, 20) || !prefs.name.trim()) prefs.name = 'JARVIS';
let notes = [].concat(store.get('jv_notes', [])).filter(n => n && isStr(n.id, 30) && isStr(n.text, 200)).slice(0, 100);
let hist = [].concat(store.get('jv_hist', [])).filter(h => h && (h.role === 'user' || h.role === 'model') && isStr(h.text, 4000) && isStr(h.time, 10)).slice(-KEEP);

// ---------- estado del núcleo ----------
let errTimer;
function setState(s) { core.dataset.state = s; $('#state').textContent = s; }
function fail(msg) { toast(msg); setState('ERROR'); clearTimeout(errTimer); errTimer = setTimeout(() => core.dataset.state === 'ERROR' && setState('IDLE'), 3500); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3500); }

// ---------- chat ----------
const hhmm = () => new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
function render(role, text, time, isErr) {
  const d = document.createElement('div'); d.className = 'm ' + (role === 'user' ? 'user' : 'bot') + (isErr ? ' err' : '');
  d.append(document.createTextNode(text));
  const sm = document.createElement('small'); sm.textContent = time;
  if (role === 'model') {
    const c = document.createElement('button'); c.textContent = 'Copiar';
    c.onclick = () => navigator.clipboard.writeText(text).then(() => toast('Copiado.'), () => toast('No se pudo copiar.'));
    sm.append(c);
  }
  d.append(sm); log.append(d); log.scrollTop = log.scrollHeight;
}
function say(role, text, isErr) {
  const time = hhmm(); render(role, text, time, isErr);
  if (!isErr) { hist.push({ role, text: text.slice(0, 4000), time }); hist = hist.slice(-KEEP); store.set('jv_hist', hist); }
}
function loadChat() {
  log.textContent = ''; hist.forEach(h => render(h.role, h.text, h.time));
  if (!hist.length) render('model', 'Hola, soy ' + prefs.name + '. Puedes escribirme o dictarme. Di «ayúdame» para ver los comandos locales.', hhmm());
}

// ---------- voz: síntesis ----------
const synth = window.speechSynthesis; let spk = 0;
function speak(text) {
  if (!prefs.voice || !synth) return;
  synth.cancel(); const id = ++spk;
  const u = new SpeechSynthesisUtterance(text.replace(/[*_`#]/g, ''));
  const v = synth.getVoices().find(v => /^es/i.test(v.lang)); if (v) u.voice = v; u.lang = v ? v.lang : 'es-ES';
  u.onstart = () => id === spk && setState('SPEAKING');
  u.onend = u.onerror = () => { if (id === spk && core.dataset.state === 'SPEAKING') setState('IDLE'); };
  synth.speak(u);
}
function stopSpeech() { spk++; if (synth) synth.cancel(); if (core.dataset.state === 'SPEAKING') setState('IDLE'); }

// ---------- voz: dictado (solo al pulsar el micrófono; sin escucha permanente) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition; let rec = null;
micBtn.onclick = () => {
  if (!SR) return toast('Tu navegador no admite dictado. Escribe tu mensaje.');
  if (rec) return rec.stop();
  if (busy) return;
  stopSpeech(); // evita que escuche su propia voz
  rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true;
  rec.onstart = () => { setState('LISTENING'); micBtn.classList.add('on'); };
  rec.onresult = e => { input.value = [...e.results].map(r => r[0].transcript).join('').slice(0, MAX); };
  rec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') fail(e.error === 'not-allowed' ? 'Permiso de micrófono denegado.' : 'Error de dictado: ' + e.error); };
  rec.onend = () => { rec = null; micBtn.classList.remove('on'); if (core.dataset.state === 'LISTENING') setState('IDLE'); input.focus(); };
  try { rec.start(); } catch { rec = null; fail('No se pudo iniciar el micrófono.'); }
};

// ---------- temporizador ----------
const T = { left: 0, end: 0, run: false, on: false, iv: null };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ':' : '') + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
function tShow() { $('#tdisp').textContent = T.on ? mmss(T.run ? T.end - Date.now() : T.left) : '00:00'; $('#tpause').textContent = T.run || !T.on ? 'Pausar' : 'Reanudar'; }
function tTick() {
  if (!T.run) return;
  if (Date.now() >= T.end) { tStop(); const m = 'El temporizador ha terminado.'; toast(m); say('model', m); speak(m); } else tShow();
}
function tStop() { clearInterval(T.iv); T.on = T.run = false; tShow(); }
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
  if (!notes.length) { const li = document.createElement('li'); li.textContent = 'Aún no hay notas. Escribe una arriba.'; ul.append(li); return; }
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

// ---------- comandos locales (no usan Gemini) ----------
const SITES = { google: 'https://www.google.com', youtube: 'https://www.youtube.com', wikipedia: 'https://es.wikipedia.org', github: 'https://github.com', vercel: 'https://vercel.com' };
function openSite(raw) {
  const key = raw.toLowerCase().trim(); let url = SITES[key];
  if (!url && /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(raw.trim())) url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim();
  if (!url) return 'No reconozco ese sitio. Prueba con google, youtube, wikipedia, github o un dominio como ejemplo.com.';
  try { const u = new URL(url); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 0; window.open(u.href, '_blank', 'noopener,noreferrer'); return 'Abriendo ' + u.hostname + '.'; }
  catch { return 'Esa dirección no es válida o no está permitida (solo http y https).'; }
}
function local(raw) {
  const t = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (/\bque hora es\b|\bhora actual\b/.test(t)) return 'Son las ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) + '.';
  if (/\bque fecha\b|\bque dia es\b/.test(t)) return 'Hoy es ' + new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.';
  const ab = t.match(/^abre(?:me)?\s+(.+)|^abrir\s+(.+)/);
  if (ab) return openSite(raw.trim().replace(/^\S+\s+/, ''));
  if (/\b(pausa|pausar|reanuda|reanudar)\b.*temporizador/.test(t)) return tToggle();
  if (/\b(cancela|cancelar|deten|detener)\b.*temporizador/.test(t)) { if (!T.on) return 'No hay ningún temporizador activo.'; tStop(); return 'Temporizador cancelado.'; }
  if (/temporizador|cronometro/.test(t)) {
    const m = t.match(/(\d+)\s*(hora|horas|h|minuto|minutos|min|segundo|segundos|seg|s)?\b/);
    if (!m) return 'Indica la duración, por ejemplo: «temporizador 5 minutos».';
    const n = +m[1], u = m[2] || 'min', ms = n * (/^h/.test(u) ? 3600000 : /^(s|seg)/.test(u) ? 1000 : 60000);
    if (!n || ms > 86400000) return 'La duración debe estar entre 1 segundo y 24 horas.';
    tStart(ms); return 'Temporizador iniciado: ' + mmss(ms) + '.';
  }
  const nn = raw.match(/^\s*(?:crear|crea|anota|añade|guarda)?\s*(?:una\s+)?nota\s*[:\-]?\s*(.*)$/i);
  if (nn && /nota/i.test(t.slice(0, 20))) return nn[1].trim() ? (addNote(nn[1]) ? 'Nota guardada.' : 'No se pudo guardar la nota.') : (($('#ninput').focus(), 'Escribe el texto en el campo «Nueva nota» o di: «crear nota comprar pan».'));
  const nm = raw.match(/(?:llamate|tu nombre es|cambia tu nombre a)\s+(.{1,20})$/i);
  if (nm) { prefs.name = nm[1].trim(); store.set('jv_prefs', prefs); $('#name').textContent = prefs.name; return 'Ahora me llamo ' + prefs.name + '.'; }
  if (/^(ayuda|ayudame|help)\b/.test(t)) return 'Comandos locales: «¿qué hora es?», «¿qué fecha es hoy?», «crear nota …», «temporizador 5 minutos» (también pausar, reanudar, cancelar), «abrir google», «llámate …». Todo lo demás lo responde Gemini.';
  return null;
}

// ---------- envío ----------
let busy = false;
async function send(raw) {
  const text = raw.trim();
  if (!text || busy) return;
  if (text.length > MAX) return toast('Máximo ' + MAX + ' caracteres.');
  input.value = ''; stopSpeech();
  const ctx = hist.slice(-CTX).map(h => ({ role: h.role, text: h.text.slice(0, MAX) }));
  say('user', text);
  const l = local(text);
  if (l !== null) { say('model', l); speak(l); return; }
  busy = true; setState('THINKING'); $('#send').disabled = true;
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: ctx }), signal: ctrl.signal });
    let data = null; try { data = await r.json(); } catch { /* respuesta no JSON */ }
    if (!r.ok || !data || typeof data.reply !== 'string') {
      const msg = (data && data.error) || 'El backend /api/chat no responde. Ejecuta la app con «vercel dev» o desplegada en Vercel.';
      say('model', msg, true); return fail(msg);
    }
    say('model', data.reply); setState('IDLE'); speak(data.reply);
  } catch (e) {
    const msg = e.name === 'AbortError' ? 'La solicitud tardó demasiado.' : 'Sin conexión con el servidor.';
    say('model', msg, true); fail(msg);
  } finally { clearTimeout(to); busy = false; $('#send').disabled = false; }
}

// ---------- eventos ----------
$('#send').onclick = () => send(input.value);
input.onkeydown = e => e.key === 'Enter' && send(input.value);
$('#chips').onclick = e => { const q = e.target.dataset && e.target.dataset.q; if (q) send(q); };
$('#stop').onclick = stopSpeech;
$('#voice').onclick = () => { prefs.voice = !prefs.voice; store.set('jv_prefs', prefs); if (!prefs.voice) stopSpeech(); $('#voice').textContent = 'Voz: ' + (prefs.voice ? 'sí' : 'no'); };
$('#clear').onclick = () => { hist = []; store.set('jv_hist', hist); loadChat(); toast('Historial borrado.'); };
if (synth) synth.onvoiceschanged = () => {};
$('#name').textContent = prefs.name; $('#voice').textContent = 'Voz: ' + (prefs.voice ? 'sí' : 'no');
if (!synth) { $('#voice').disabled = $('#stop').disabled = true; }
if (!SR) { micBtn.title = 'Tu navegador no admite dictado'; }
loadChat(); drawNotes(); tShow();
