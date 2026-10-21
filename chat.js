// POST /api/chat — única pieza que habla con Gemini. La clave solo existe aquí (variable de entorno).
const MAX_BODY = 8000, MAX_MSG = 800, MAX_HIST = 8, MAX_OUT_TOKENS = 1024, TIMEOUT_MS = 25000;
const WINDOW_MS = 60000, MAX_PER_WINDOW = 8;
const hits = new Map(); // límite por IP en memoria: best-effort, cada instancia serverless tiene el suyo

const SYSTEM = 'Eres JARVIS, un asistente personal inteligente, educado, útil y tecnológico. ' +
  'Responde siempre en español, con claridad y brevedad. No afirmes controlar el ordenador del usuario, ' +
  'ejecutar programas, enviar mensajes ni acceder a archivos: solo conversas.';

const fail = (res, code, error) => res.status(code).json({ error });

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return list.length > MAX_PER_WINDOW;
}

const okText = s => typeof s === 'string' && s.trim().length > 0 && s.length <= MAX_MSG;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, 'Método no permitido.'); }

  const origin = req.headers.origin;
  if (origin) {
    let same = false;
    try { same = new URL(origin).host === req.headers.host; } catch { /* origen inválido */ }
    if (!same) return fail(res, 403, 'Origen no permitido.');
  }
  if (!String(req.headers['content-type'] || '').includes('application/json')) return fail(res, 415, 'Se requiere JSON.');
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) return fail(res, 413, 'Solicitud demasiado grande.');

  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return fail(res, 400, 'Cuerpo inválido.');
  if (Object.keys(b).some(k => k !== 'message' && k !== 'history')) return fail(res, 400, 'Parámetros no permitidos.');
  if (!okText(b.message)) return fail(res, 400, 'El mensaje está vacío o supera ' + MAX_MSG + ' caracteres.');
  const hist = b.history === undefined ? [] : b.history;
  if (!Array.isArray(hist) || hist.length > MAX_HIST ||
      !hist.every(h => h && typeof h === 'object' && (h.role === 'user' || h.role === 'model') && okText(h.text) &&
        Object.keys(h).every(k => k === 'role' || k === 'text'))) return fail(res, 400, 'Historial inválido.');

  const { GEMINI_API_KEY: key, GEMINI_MODEL: model } = process.env;
  if (!key || !model) return fail(res, 503, 'El servidor no tiene configurados GEMINI_API_KEY y GEMINI_MODEL. Las funciones locales siguen disponibles.');

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  if (limited(ip)) { res.setHeader('Retry-After', '60'); return fail(res, 429, 'Demasiadas solicitudes. Espera un minuto.'); }

  let timer;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: key });
    const contents = [...hist.map(h => ({ role: h.role, parts: [{ text: h.text }] })), { role: 'user', parts: [{ text: b.message }] }];
    const call = ai.models.generateContent({ model, contents, config: { systemInstruction: SYSTEM, maxOutputTokens: MAX_OUT_TOKENS, temperature: 0.7 } });
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('timeout'), { status: 504 })), TIMEOUT_MS); });
    const r = await Promise.race([call, timeout]);
    const text = (r && r.text) || '';
    if (!text.trim()) return fail(res, 502, 'Gemini no devolvió texto (puede haberse bloqueado la respuesta). Reformula la pregunta.');
    return res.status(200).json({ reply: text.slice(0, 4000) });
  } catch (e) {
    const s = Number(e?.status || e?.code) || 0;
    console.error('gemini_error', s); // sin contenido de conversaciones ni claves
    if (s === 429) return fail(res, 429, 'Se agotó la cuota gratuita de Gemini (por minuto o por día). Espera o revisa tu cuota en Google AI Studio.');
    if (s === 504) return fail(res, 504, 'Gemini tardó demasiado en responder.');
    if (s === 400 || s === 401 || s === 403 || s === 404) return fail(res, 502, 'Gemini rechazó la petición: revisa GEMINI_API_KEY, GEMINI_MODEL y que el modelo esté disponible en tu región.');
    return fail(res, 502, 'No se pudo contactar con Gemini.');
  } finally { clearTimeout(timer); }
}
