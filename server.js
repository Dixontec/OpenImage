// OpenImage — servidor local sem dependências.
// Serve a interface e faz proxy para a API da Cloudflare (o navegador não pode
// chamar api.cloudflare.com direto por causa de CORS). Nada é gravado em disco:
// as credenciais chegam por requisição e seguem direto para a Cloudflare.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 3210);
const MOCK = process.env.MOCK === '1';
const CF = 'https://api.cloudflare.com/client/v4';
const MAX_BODY = 48 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Corpo da requisição grande demais.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

const creds = (req) => ({
  account: String(req.headers['x-cf-account'] || '').trim(),
  token: String(req.headers['x-cf-token'] || '').trim(),
});

const validAccount = (a) => /^[a-f0-9]{32}$/i.test(a);
const validModel = (m) => /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(m);

// ---------- /api/generate ----------
async function generate(req, res) {
  const { account, token } = creds(req);
  const model = String(req.headers['x-cf-model'] || '');
  if (!validAccount(account)) return json(res, 400, { error: 'Account ID inválido (32 caracteres hexadecimais).' });
  if (!token) return json(res, 400, { error: 'Token da API ausente.' });
  if (!validModel(model)) return json(res, 400, { error: 'Modelo inválido.' });

  const body = await readBody(req);

  if (MOCK) {
    // Modo demonstração: devolve um SVG gerado a partir do prompt, sem tocar na Cloudflare.
    await new Promise((r) => setTimeout(r, 1800));
    // No modo demo, um prompt com "proibido" simula a recusa por política de conteúdo.
    if (/proibido/i.test(decodeURIComponent(String(req.headers['x-mock-seed'] || '')))) {
      return json(res, 400, { success: false, errors: [{ code: 3030, message: 'Input prompt contains NSFW content' }] });
    }
    const [w, h] = String(req.headers['x-mock-size'] || '1024x1024').split('x').map(Number);
    const seed = [...String(req.headers['x-mock-seed'] || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const hue = seed % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><radialGradient id="a" cx="30%" cy="25%" r="80%"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360} 55% 14%)"/></radialGradient>
<radialGradient id="b" cx="75%" cy="80%" r="60%"><stop offset="0" stop-color="hsl(${(hue + 150) % 360} 80% 60%)" stop-opacity=".85"/><stop offset="1" stop-color="hsl(${(hue + 150) % 360} 80% 60%)" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#a)"/><rect width="100%" height="100%" fill="url(#b)"/>
<circle cx="${w * 0.5}" cy="${h * 0.46}" r="${Math.min(w, h) * 0.22}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/></svg>`;
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    return res.end(svg);
  }

  try {
    const upstream = await fetch(`${CF}/accounts/${account}/ai/run/${model}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': req.headers['content-type'] || 'application/json',
      },
      body,
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const ct = upstream.headers.get('content-type') || '';
    console.log(`[${model}] ${upstream.status} ${ct} ${buf.length}B${upstream.ok && ct.startsWith('image/') ? '' : ' ' + buf.toString('utf8', 0, 400)}`);
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(buf);
  } catch (e) {
    json(res, 502, { error: `Falha ao contatar a Cloudflare: ${e.message}` });
  }
}

// ---------- /api/verify ----------
async function verify(req, res) {
  const { account, token } = creds(req);
  if (!validAccount(account)) return json(res, 400, { ok: false, error: 'Account ID inválido (32 caracteres hexadecimais).' });
  if (!token) return json(res, 400, { ok: false, error: 'Token ausente.' });
  if (MOCK) return json(res, 200, { ok: true, mock: true });
  const h = { authorization: `Bearer ${token}` };
  try {
    for (const url of [`${CF}/accounts/${account}/tokens/verify`, `${CF}/user/tokens/verify`]) {
      const r = await fetch(url, { headers: h });
      const j = await r.json().catch(() => null);
      if (j?.success && j.result?.status === 'active') return json(res, 200, { ok: true });
    }
    json(res, 200, { ok: false, error: 'Token recusado pela Cloudflare. Confira o token e o Account ID.' });
  } catch (e) {
    json(res, 502, { ok: false, error: `Falha ao contatar a Cloudflare: ${e.message}` });
  }
}

// ---------- /api/usage ----------
// Soma de neurônios consumidos no dia (UTC) via GraphQL Analytics. Requer permissão
// "Account Analytics: Read" no token. É opcional: sem ela o app usa a estimativa local.
async function usage(req, res) {
  const { account, token } = creds(req);
  if (!validAccount(account) || !token) return json(res, 400, { error: 'Credenciais ausentes.' });
  if (MOCK) return json(res, 200, { neurons: null, error: 'Modo demonstração: sem sincronização.' });

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const query = `query($acc:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$acc}){
    aiInferenceAdaptiveGroups(limit:1,filter:{datetime_geq:$from,datetime_leq:$to}){sum{totalNeurons}}}}}`;
  try {
    const r = await fetch(`${CF}/graphql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { acc: account, from, to: now.toISOString() } }),
    });
    const j = await r.json();
    if (j.errors?.length) return json(res, 200, { neurons: null, error: j.errors[0].message });
    const groups = j.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups || [];
    const neurons = groups.reduce((a, g) => a + (g.sum?.totalNeurons || 0), 0);
    json(res, 200, { neurons });
  } catch (e) {
    json(res, 200, { neurons: null, error: e.message });
  }
}

// ---------- estáticos ----------
async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && req.url === '/api/generate') return await generate(req, res);
      if (req.method === 'POST' && req.url === '/api/verify') return await verify(req, res);
      if (req.method === 'POST' && req.url === '/api/usage') return await usage(req, res);
      if (req.method === 'GET') return await serveStatic(req, res);
      res.writeHead(405);
      res.end();
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: e.message });
    }
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`\n  OpenImage rodando em http://localhost:${PORT}${MOCK ? '  (modo demonstração)' : ''}\n`);
  });
