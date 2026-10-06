// Publica en cada red las publicaciones de cola/ cuya fecha y hora ya llegaron.
// Lleva el registro en estado/<id>.json para no publicar dos veces. Reintenta hasta 3 veces por red.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const redes = JSON.parse(readFileSync(join(ROOT, 'config/redes.json'), 'utf8'));
const marcas = JSON.parse(readFileSync(join(ROOT, 'config/marcas.json'), 'utf8'));
const env = Object.assign({}, process.env, process.env.SECRETS_JSON ? JSON.parse(process.env.SECRETS_JSON) : {});
const GV = env.META_GRAPH_VERSION || 'v25.0';
const REPO = env.GITHUB_REPOSITORY || '';
const RAMA = env.GITHUB_REF_NAME || 'main';
const PRUEBA = env.PULSO_PRUEBA === '1'; // simula sin llamar a las redes
const MAX_INTENTOS = 3;
const VENTANA_HORAS = 36; // no publica piezas con más de 36 h de retraso

function linkedinVersion() { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 2); return env.LINKEDIN_VERSION || `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
const S = (name, marca) => env[`${name}_${marca.toUpperCase()}`];
const rawUrl = (file) => `https://raw.githubusercontent.com/${REPO}/${RAMA}/media/${file}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cuando(p) { return new Date(`${p.fecha}T${(p.hora || '19:00').padStart(5, '0')}:00-06:00`); }
function caption(p, red) {
  const tags = (p.hashtags || '').trim();
  const base = (p.textos && p.textos[red]) || p.texto || '';
  if (red === 'linkedin') return base.trim();
  return [base.trim(), tags].filter(Boolean).join('\n\n');
}
async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  let data; try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
  if (!res.ok || data.error) throw new Error(`${res.status} ${JSON.stringify(data.error || data).slice(0, 400)}`);
  return { data, headers: res.headers };
}
const form = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== ''));

/* ---------------- Facebook (página) ---------------- */
async function facebook(p) {
  const id = S('FB_PAGE_ID', p.marca), token = S('FB_TOKEN', p.marca);
  if (!id || !token) throw new Error('Faltan FB_PAGE_ID o FB_TOKEN');
  const fd = new FormData();
  fd.append('caption', caption(p, 'facebook')); fd.append('access_token', token);
  fd.append('source', new Blob([readFileSync(join(ROOT, 'media', p.id + '.png'))], { type: 'image/png' }), p.id + '.png');
  const { data } = await api(`https://graph.facebook.com/${GV}/${id}/photos`, { method: 'POST', body: fd });
  return { id: data.post_id || data.id, url: `https://www.facebook.com/${data.post_id || data.id}` };
}

/* ---------------- Instagram (cuenta profesional) ---------------- */
async function igEsperar(container, token) {
  for (let i = 0; i < 40; i++) {
    const { data } = await api(`https://graph.facebook.com/${GV}/${container}?fields=status_code&access_token=${token}`);
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR' || data.status_code === 'EXPIRED') throw new Error('Instagram no pudo procesar el archivo: ' + data.status_code);
    await sleep(6000);
  }
  throw new Error('Instagram tardó demasiado en procesar el archivo');
}
async function instagram(p) {
  const ig = S('IG_USER_ID', p.marca), token = S('FB_TOKEN', p.marca);
  if (!ig || !token) throw new Error('Faltan IG_USER_ID o FB_TOKEN');
  const mp4 = join(ROOT, 'media', p.id + '.mp4');
  let container;
  if (p.formato === 'Reel' && existsSync(mp4)) {
    const { data } = await api(`https://graph.facebook.com/${GV}/${ig}/media`, { method: 'POST', body: form({ media_type: 'REELS', upload_type: 'resumable', caption: caption(p, 'instagram'), share_to_feed: 'true', access_token: token }) });
    container = data.id;
    const buf = readFileSync(mp4);
    await api(`https://rupload.facebook.com/ig-api-upload/${GV}/${container}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length) }, body: buf });
  } else {
    const body = { image_url: rawUrl(p.id + '.png'), access_token: token };
    if (p.formato === 'Historia') body.media_type = 'STORIES'; else body.caption = caption(p, 'instagram');
    const { data } = await api(`https://graph.facebook.com/${GV}/${ig}/media`, { method: 'POST', body: form(body) });
    container = data.id;
  }
  await igEsperar(container, token);
  const { data } = await api(`https://graph.facebook.com/${GV}/${ig}/media_publish`, { method: 'POST', body: form({ creation_id: container, access_token: token }) });
  let url = '';
  try { url = (await api(`https://graph.facebook.com/${GV}/${data.id}?fields=permalink&access_token=${token}`)).data.permalink || ''; } catch {}
  return { id: data.id, url };
}

/* ---------------- Threads ---------------- */
async function threads(p) {
  const uid = S('THREADS_USER_ID', p.marca), token = S('THREADS_TOKEN', p.marca);
  if (!uid || !token) throw new Error('Faltan THREADS_USER_ID o THREADS_TOKEN');
  const texto = caption(p, 'threads').slice(0, 500);
  const { data: c } = await api(`https://graph.threads.net/v1.0/${uid}/threads`, { method: 'POST', body: form({ media_type: 'IMAGE', image_url: rawUrl(p.id + '.png'), text: texto, access_token: token }) });
  await sleep(30000);
  const { data } = await api(`https://graph.threads.net/v1.0/${uid}/threads_publish`, { method: 'POST', body: form({ creation_id: c.id, access_token: token }) });
  return { id: data.id, url: '' };
}

/* ---------------- LinkedIn (perfil personal o página con permiso) ---------------- */
async function linkedin(p) {
  const token = S('LINKEDIN_TOKEN', p.marca), author = S('LINKEDIN_AUTHOR', p.marca);
  if (!token || !author) throw new Error('Faltan LINKEDIN_TOKEN o LINKEDIN_AUTHOR');
  const h = { Authorization: `Bearer ${token}`, 'LinkedIn-Version': linkedinVersion(), 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
  const { data: up } = await api('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers: h, body: JSON.stringify({ initializeUploadRequest: { owner: author } }) });
  const put = await fetch(up.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: readFileSync(join(ROOT, 'media', p.id + '.png')) });
  if (!put.ok) throw new Error('LinkedIn no aceptó la imagen: ' + put.status);
  const res = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: h, body: JSON.stringify({
    author, commentary: caption(p, 'linkedin').slice(0, 2900), visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: up.value.image, title: (p.titular || '').slice(0, 200) } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }) });
  if (!res.ok) throw new Error('LinkedIn: ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const urn = res.headers.get('x-restli-id') || '';
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : '' };
}

/* ---------------- YouTube Shorts ---------------- */
async function youtube(p) {
  const refresh = S('YT_REFRESH_TOKEN', p.marca), cid = env.YT_CLIENT_ID, secret = env.YT_CLIENT_SECRET;
  if (!refresh || !cid || !secret) throw new Error('Faltan YT_CLIENT_ID, YT_CLIENT_SECRET o YT_REFRESH_TOKEN');
  const mp4 = join(ROOT, 'media', p.id + '.mp4');
  if (!existsSync(mp4)) throw new Error('No hay video para esta pieza');
  const { data: tok } = await api('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: cid, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }) });
  const meta = { snippet: { title: `${(p.titular || p.gancho || marcas[p.marca].nombre).slice(0, 90)} #Shorts`, description: caption(p, 'youtube').slice(0, 4900), categoryId: '22', defaultLanguage: 'es' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } };
  const b = 'pulso' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: video/mp4\r\n\r\n`),
    readFileSync(mp4), Buffer.from(`\r\n--${b}--`)]);
  const { data } = await api('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status', { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': `multipart/related; boundary=${b}` }, body });
  return { id: data.id, url: `https://youtube.com/shorts/${data.id}` };
}

/* ---------------- TikTok (sube como borrador a tu bandeja; tú tocas Publicar) ---------------- */
async function tiktok(p) {
  const key = env.TIKTOK_CLIENT_KEY, secret = env.TIKTOK_CLIENT_SECRET, refresh = S('TIKTOK_REFRESH_TOKEN', p.marca);
  if (!key || !secret || !refresh) throw new Error('Faltan TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET o TIKTOK_REFRESH_TOKEN');
  const mp4 = join(ROOT, 'media', p.id + '.mp4');
  if (!existsSync(mp4)) throw new Error('No hay video para esta pieza');
  const { data: tok } = await api('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ client_key: key, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }) });
  const size = statSync(mp4).size;
  const { data: init } = await api('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 } }) });
  const put = await fetch(init.data.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${size - 1}/${size}` }, body: readFileSync(mp4) });
  if (!put.ok) throw new Error('TikTok no aceptó el video: ' + put.status);
  return { id: init.data.publish_id, url: '', nota: 'En tu bandeja de TikTok: abre la app y toca Publicar. El texto está en Pulso.' };
}

const PUBLICADORES = { facebook, instagram, threads, linkedin, youtube, tiktok };
function redesDe(p) {
  const r = redes[p.marca] || {};
  const lista = [];
  if (r.facebook) lista.push('facebook');
  if (r.instagram) lista.push('instagram');
  if (r.threads && p.formato !== 'Historia') lista.push('threads');
  if (r.linkedin && p.formato !== 'Historia') lista.push('linkedin');
  const video = p.formato === 'Reel' || r.videoParaTodo;
  if (r.youtube && video) lista.push('youtube');
  if (r.tiktok && video) lista.push('tiktok');
  return lista;
}

const ahora = new Date();
let hechas = 0, errores = 0;
for (const f of readdirSync(join(ROOT, 'cola')).filter(f => f.endsWith('.json'))) {
  const p = JSON.parse(readFileSync(join(ROOT, 'cola', f), 'utf8'));
  if (p.estado && p.estado !== 'listo') continue;
  const t = cuando(p);
  if (t > ahora || (ahora - t) / 3.6e6 > VENTANA_HORAS) continue;
  if (!existsSync(join(ROOT, 'media', p.id + '.png'))) { console.log('Sin imagen todavía:', p.id); continue; }
  const ef = join(ROOT, 'estado', p.id + '.json');
  const est = existsSync(ef) ? JSON.parse(readFileSync(ef, 'utf8')) : { id: p.id, marca: p.marca, redes: {} };
  for (const red of redesDe(p)) {
    const r = est.redes[red] || {};
    if (r.ok || (r.intentos || 0) >= MAX_INTENTOS) continue;
    try {
      const out = PRUEBA ? { id: 'prueba', url: '' } : await PUBLICADORES[red](p);
      est.redes[red] = { ok: true, ...out, en: new Date().toISOString() };
      hechas++; console.log(`✔ ${p.id} → ${red}`);
    } catch (e) {
      est.redes[red] = { ok: false, error: String(e.message || e).slice(0, 500), intentos: (r.intentos || 0) + 1, en: new Date().toISOString() };
      errores++; console.log(`✖ ${p.id} → ${red}: ${e.message}`);
    }
  }
  writeFileSync(ef, JSON.stringify(est, null, 2));
}
console.log(`Listo: ${hechas} publicaciones, ${errores} errores.`);
