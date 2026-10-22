# JARVIS AI

Asistente web futurista: HTML + CSS + JavaScript vanilla en el navegador y una función serverless de Vercel (`api/chat.js`) que llama a **Google Gemini** con `@google/genai`. Sin frameworks ni base de datos.

## Archivos
`index.html`, `style.css`, `script.js` · `api/chat.js` · `package.json` · `.env.example` · `.gitignore` · `test/api.test.mjs`.
**Todos deben estar en la raíz del repositorio** (con la carpeta `api/` y `package.json`), o Vercel no creará la función.

## Estructura
```
index.html  style.css  script.js  package.json  README.md  .env.example  .gitignore
api/chat.js
test/api.test.mjs
```

## Qué hace
- Núcleo holográfico con estados reales (IDLE, LISTENING, THINKING, SPEAKING, ERROR) y 3 temas de color.
- Chat con Gemini (respuestas con negritas, listas y código), historial local, copiar y exportar.
- Dictado y voz del navegador (elige voz y velocidad). Sin escucha permanente.
- Comandos locales sin Gemini: hora, fecha, abrir webs, notas (crear/editar/eliminar), temporizador (pausar/reanudar/cancelar), calculadora, dado y moneda.
- Indicador real del backend: LISTO, FALTAN VARIABLES o SIN BACKEND. El contador «HOY» cuenta tus consultas desde este navegador; **no** es tu cuota oficial.

## Despliegue en Vercel
1. Sube todo a GitHub (sin `.env.local`; usa «Add file → Upload files» arrastrando también la carpeta `api`).
2. En Vercel: *Settings → Environment Variables* → `GEMINI_API_KEY` (clave de https://aistudio.google.com/apikey) y `GEMINI_MODEL=gemini-3.5-flash-lite`, en Production, Preview y Development.
3. *Deployments → Redeploy* (las variables solo afectan a despliegues nuevos).
4. Abre la web: arriba debe decir **GEMINI: LISTO**. Prueba con una pregunta general.

Verifica en https://ai.google.dev/gemini-api/docs/pricing que el modelo siga siendo gratuito; cuotas y regiones cambian. Si se agota, la app avisa y las funciones locales siguen funcionando.

## Local
`npm install` · `npm test` · crea `.env.local` desde `.env.example` · `npm i -g vercel && vercel dev` y abre `http://localhost:3000` (no `index.html` directamente).

## Seguridad
- La clave solo existe en variables de entorno del servidor.
- El backend valida método, origen, tipo, tamaño, campos y longitudes; limita 8 peticiones/min por IP **en memoria de cada instancia** (best-effort, no es protección real). Sin login, cualquiera con tu URL puede gastar tu cuota; para protegerla hace falta autenticación o un límite compartido (no implementado).
- No se guardan conversaciones en el servidor. En el nivel gratuito Google puede usar lo que envíes para mejorar sus productos.

## Limitaciones
No controla el ordenador ni envía mensajes. El dictado depende del navegador (Chrome/Edge; Brave lo bloquea). El temporizador se pierde al recargar. Datos solo en este navegador.
