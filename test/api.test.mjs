import assert from 'node:assert/strict';
import handler from '../api/chat.js';
delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL;
const call = (req) => new Promise(resolve => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { resolve({ code: this.code, body: o }); } };
  handler({ headers: { host: 'x.test', 'content-type': 'application/json' }, socket: {}, ...req }, res);
});
const ok = { method: 'POST', body: { message: 'hola' } };
const cases = [
  ['PUT → 405', { method: 'PUT' }, 405],
  ['GET estado → 200', { method: 'GET' }, 200],
  ['origen ajeno → 403', { ...ok, headers: { host: 'x.test', origin: 'https://evil.test', 'content-type': 'application/json' } }, 403],
  ['sin JSON → 415', { ...ok, headers: { host: 'x.test', 'content-type': 'text/plain' } }, 415],
  ['mensaje vacío → 400', { method: 'POST', body: { message: '   ' } }, 400],
  ['mensaje largo → 400', { method: 'POST', body: { message: 'a'.repeat(801) } }, 400],
  ['parámetro extra → 400', { method: 'POST', body: { message: 'hi', model: 'x' } }, 400],
  ['historial malformado → 400', { method: 'POST', body: { message: 'hi', history: [{ role: 'system', text: 'x' }] } }, 400],
  ['sin credenciales → 503', ok, 503],
];
for (const [name, req, code] of cases) { const r = await call(req); assert.equal(r.code, code, name); console.log('OK  ', name); }
