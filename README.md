# JARVIS AI

Asistente web futurista: HTML + CSS + JavaScript vanilla en el navegador y una función serverless de Vercel (`api/chat.js`) que llama a **Google Gemini** con el SDK oficial `@google/genai`. Sin frameworks ni base de datos.

## Estructura
`index.html`, `style.css`, `script.js` (interfaz) · `api/chat.js` (backend) · `package.json` · `.env.example` · `.gitignore` · `test/api.test.mjs` (pruebas del backend; archivo extra para poder verificarlo sin red).

## 1. Clave de Gemini
1. Entra en https://aistudio.google.com/apikey con tu cuenta de Google.
2. Pulsa **Create API key** y cópiala. No actives facturación: el nivel gratuito no la necesita.
3. `GEMINI_MODEL` por defecto es `gemini-3.5-flash-lite`, que el 21/10/2026 figuraba con entrada y salida «Free of charge» en https://ai.google.dev/gemini-api/docs/pricing. **Verifica la tabla antes de usarlo**: modelos, cuotas y regiones cambian. Los modelos Pro y `gemini-4-argon` no son gratuitos.

## 2. Probar en local
```bash
npm install
npm test                       # pruebas del backend (no necesitan clave)
cp .env.example .env.local     # rellena GEMINI_API_KEY (este archivo está en .gitignore)
npm i -g vercel && vercel dev  # abre http://localhost:3000
```
Abrir `index.html` con doble clic sirve para ver la interfaz y las funciones locales, pero el chat con Gemini necesita `/api/chat`.

## 3. GitHub
1. Crea el repositorio `jarvis-ai` (privado o público).
2. `git init && git add . && git commit -m "JARVIS AI" && git branch -M main`
3. `git remote add origin <URL> && git push -u origin main`
4. Antes del primer push: `git status` no debe listar `.env.local`, y `git log -p | grep -i "AIza"` no debe devolver nada.
5. Cada cambio: `git add . && git commit -m "..." && git push` (Vercel redespliega solo).

## 4. Vercel
1. Inicia sesión en https://vercel.com con GitHub e **Import** el repositorio (Framework: *Other*, sin comando de build).
2. En *Settings → Environment Variables* crea `GEMINI_API_KEY` y `GEMINI_MODEL` (Production, Preview y Development).
3. **Deploy**. Si ya habías desplegado, haz *Redeploy* tras añadir variables.
4. Abre la URL pública y envía una pregunta general. Si falla, mira *Logs* del despliegue y de la función.

## Cuota y límites
- Comprueba tu uso y límites en Google AI Studio (sección de uso/límites del proyecto) y en https://ai.google.dev/gemini-api/docs/rate-limits.
- Al agotarse el límite por minuto o por día, la app muestra un aviso y las funciones locales siguen funcionando. Espera a que se renueve; no uses cuentas o claves alternativas para eludirlo.
- En el nivel gratuito Google puede usar los datos enviados para mejorar sus productos: no envíes información privada.
- Costes controlados: mensajes ≤ 800 caracteres, 6 mensajes de contexto, salida ≤ 1024 tokens, y los comandos locales no llaman a Gemini.

## Seguridad: qué hay y qué no
- La clave solo vive en variables de entorno del servidor; no llega al navegador ni a `localStorage`.
- El backend valida método, origen, tipo, tamaño, campos y longitudes; limita 8 peticiones/minuto por IP **en memoria de cada instancia** (best-effort: se reinicia y no se comparte entre instancias).
- La comprobación de origen frena el uso desde otras webs en navegadores, **no** desde scripts. Sin autenticación, cualquiera con tu URL puede gastar tu cuota. Para protección real añade login o un límite compartido (p. ej. Vercel KV/Upstash, o Vercel Firewall), que no están implementados.
- No se registran conversaciones en el servidor; solo el código de error de Gemini.

## Limitaciones
- No controla Windows, programas, mensajes ni archivos. Sin escucha permanente ni palabra de activación.
- Dictado y voces dependen del navegador (el dictado funciona sobre todo en Chrome/Edge/Safari).
- Notas, temporizador (se pierde al recargar), preferencias e historial (40 mensajes) viven solo en este navegador.
- Los comandos locales se reconocen por patrones de texto simples en español.
