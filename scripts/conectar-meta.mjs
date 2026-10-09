// Conecta tus páginas de Facebook y tus cuentas de Instagram, y guarda los accesos cifrados en config/meta.enc.
//
// Facebook (opcional): META_APP_ID, META_APP_SECRET y META_USER_TOKEN (token del Explorador de la API Graph).
//   Cambia el token por uno de larga duración y obtiene el token permanente de cada página.
// Instagram (opcional): IG_TOKEN_BNY, IG_TOKEN_KOTIZO, IG_TOKEN_VARELIA, IG_TOKEN_INVITACIONES
//   (tokens del inicio de sesión de Instagram, generados en el panel de la app de Meta).
//   Los renueva y guarda; después Pulso los renueva solo para que nunca caduquen.
//
// Uso: node scripts/conectar-meta.mjs            → conecta con los secretos disponibles
//      node scripts/conectar-meta.mjs --renovar  → solo renueva los tokens de Instagram guardados (más de 7 días)
// Nunca imprime tokens: el registro de un repositorio público lo puede ver cualquiera.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cifrar, descifrar, marcaDePagina } from './meta-boveda.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.assign({}, process.env, process.env.SECRETS_JSON ? JSON.parse(process.env.SECRETS_JSON) : {});
const GV = env.META_GRAPH_VERSION || 'v25.0';
const RENOVAR = process.argv.includes('--renovar');
const MARCAS = ['bny', 'kotizo', 'varelia', 'invitaciones'];
const BOVEDA = join(ROOT, 'config/meta.enc');
const REDES = join(ROOT, 'config/redes.json');

if (!env.PULSO_KEY) {
  if (RENOVAR) process.exit(0);
  console.error('Falta el secreto PULSO_KEY. Agrégalo en Settings → Secrets and variables → Actions.'); process.exit(1);
}

async function get(url) {
  const res = await fetch(url); const data = await res.json();
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
  return data;
}

let boveda = { creado: new Date().toISOString(), marcas: {} };
if (existsSync(BOVEDA)) {
  try { boveda = descifrar(readFileSync(BOVEDA, 'utf8'), env.PULSO_KEY); boveda.marcas ||= {}; }
  catch { if (RENOVAR) { console.log('No se pudo leer config/meta.enc con PULSO_KEY.'); process.exit(0); } console.log('· La bóveda anterior no se pudo leer con esta PULSO_KEY: se crea una nueva.'); }
}
const redes = JSON.parse(readFileSync(REDES, 'utf8'));
let cambios = 0;
const diag = { fecha: new Date().toISOString(), facebook: [], instagram: [] }; // sin tokens: se puede publicar en el repo

async function renovarIG(token) {
  const d = await get(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  return d.access_token;
}

/* ---------- Solo renovar ---------- */
if (RENOVAR) {
  const semana = 7 * 864e5;
  for (const [marca, m] of Object.entries(boveda.marcas)) {
    if (!m.igLogin || Date.now() - new Date(m.igLogin.renovado || 0).getTime() < semana) continue;
    try { m.igLogin.token = await renovarIG(m.igLogin.token); m.igLogin.renovado = new Date().toISOString(); cambios++; console.log(`· Instagram de ${marca}: token renovado.`); }
    catch (e) { console.log(`· Instagram de ${marca}: no se pudo renovar (${e.message}). Genera un token nuevo y vuelve a correr "Conectar Meta".`); }
  }
  if (cambios) writeFileSync(BOVEDA, cifrar(boveda, env.PULSO_KEY));
  process.exit(0);
}

/* ---------- Facebook (páginas) ---------- */
if (env.META_USER_TOKEN) {
  for (const k of ['META_APP_ID', 'META_APP_SECRET']) if (!env[k]) { console.error(`Falta el secreto ${k}.`); process.exit(1); }
  try {
    // Token de usuario de larga duración (60 días). Los tokens de página que salen de él no caducan.
    const largo = await get(`https://graph.facebook.com/${GV}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.META_APP_ID}&client_secret=${env.META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(env.META_USER_TOKEN)}`);
    let url = `https://graph.facebook.com/${GV}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${largo.access_token}`;
    const paginas = [];
    while (url) { const d = await get(url); paginas.push(...(d.data || [])); url = d.paging && d.paging.next; }
    diag.facebook.push({ paginasRecibidas: paginas.length });
    if (!paginas.length) console.log('· Facebook: no llegó ninguna página. Al generar el token, selecciona tus páginas en la ventana de Facebook.');
    const vistas = new Set();
    for (const p of paginas) {
      const marca = marcaDePagina(p.name);
      const ig = p.instagram_business_account;
      console.log(`· Página "${p.name}" → ${marca || 'sin marca asignada'}${ig ? ` · Instagram @${ig.username}` : ''}`);
      diag.facebook.push({ pagina: p.name, marca: marca || null, instagram: ig ? ig.username : null });
      if (!marca || vistas.has(marca)) continue;
      vistas.add(marca);
      boveda.marcas[marca] = Object.assign({}, boveda.marcas[marca], { pageId: p.id, pageName: p.name, token: p.access_token, igId: ig ? ig.id : null, igUser: ig ? ig.username : null });
      redes[marca] = Object.assign({}, redes[marca], { facebook: true });
      if (ig) redes[marca].instagram = true;
      cambios++;
    }
  } catch (e) { console.log(`· Facebook: ${e.message}`); diag.facebook.push({ error: e.message }); }
}

/* ---------- Instagram (inicio de sesión de Instagram) ---------- */
for (const marca of MARCAS) {
  const t = env[`IG_TOKEN_${marca.toUpperCase()}`];
  if (!t) continue;
  try {
    let token = t;
    try { token = await renovarIG(t); } catch { /* un token recién creado no se puede renovar en sus primeras 24 h */ }
    const yo = await get(`https://graph.instagram.com/${GV}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
    boveda.marcas[marca] = Object.assign({}, boveda.marcas[marca], { igLogin: { token, igId: String(yo.user_id), user: yo.username, renovado: new Date().toISOString() } });
    redes[marca] = Object.assign({}, redes[marca], { instagram: true });
    cambios++;
    console.log(`· Instagram de ${marca} → @${yo.username} conectado.`);
    diag.instagram.push({ marca, usuario: yo.username });
  } catch (e) { console.log(`· Instagram de ${marca}: ${e.message}`); diag.instagram.push({ marca, error: e.message }); }
}

/* ---------- TikTok (cuenta de BNY Eventos) ---------- */
if (env.TIKTOK_CODE) {
  diag.tiktok = [];
  try {
    if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new Error('Faltan TIKTOK_CLIENT_KEY o TIKTOK_CLIENT_SECRET');
    // Acepta el código solo o la dirección completa que quedó en el navegador.
    let code = env.TIKTOK_CODE.trim(), marca = (env.TIKTOK_MARCA || 'bny').toLowerCase();
    const m = code.match(/[?&]code=([^&]+)/); if (m) code = decodeURIComponent(m[1]);
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: 'https://djbnyeventos.github.io/pulso-publicador/tiktok/' }) });
    const tok = await res.json();
    if (!tok.refresh_token) throw new Error(tok.error_description || tok.error || ('HTTP ' + res.status));
    let usuario = '';
    try { const u = await (await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', { headers: { Authorization: 'Bearer ' + tok.access_token } })).json(); usuario = (u.data && u.data.user && u.data.user.display_name) || ''; } catch {}
    boveda.marcas[marca] = Object.assign({}, boveda.marcas[marca], { tiktok: { refresh: tok.refresh_token, openId: tok.open_id, usuario, renovado: new Date().toISOString() } });
    redes[marca] = Object.assign({}, redes[marca], { tiktok: true });
    cambios++;
    console.log(`· TikTok de ${marca} conectado${usuario ? ' (' + usuario + ')' : ''}.`);
    diag.tiktok.push({ marca, usuario, ok: true });
  } catch (e) { console.log('· TikTok: ' + e.message); diag.tiktok.push({ error: e.message }); }
}

if (!RENOVAR) writeFileSync(join(ROOT, 'config/meta-diagnostico.json'), JSON.stringify(diag, null, 2));
if (!cambios) {
  console.error('No se conectó nada. Agrega META_USER_TOKEN (+ META_APP_ID y META_APP_SECRET) para Facebook, o IG_TOKEN_<MARCA> para Instagram.');
  process.exit(1);
}
boveda.actualizado = new Date().toISOString();
writeFileSync(BOVEDA, cifrar(boveda, env.PULSO_KEY));
writeFileSync(REDES, JSON.stringify(redes, null, 2));
console.log('Listo: ' + Object.entries(boveda.marcas).map(([m, v]) => `${m} (${[v.pageId && 'Facebook', (v.igId || v.igLogin) && 'Instagram'].filter(Boolean).join(' + ')})`).join(', '));
