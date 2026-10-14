// Lee las métricas de cada publicación ya hecha (Instagram y Facebook) y las guarda en metricas/<id>.json.
// Se actualiza como máximo cada 6 horas por publicación y solo durante 45 días después de publicarse.
// Nunca imprime tokens. Si una métrica no existe para ese tipo de publicación, simplemente se omite.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { descifrar } from './meta-boveda.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const redes = JSON.parse(readFileSync(join(ROOT, 'config/redes.json'), 'utf8'));
const env = Object.assign({}, process.env, process.env.SECRETS_JSON ? JSON.parse(process.env.SECRETS_JSON) : {});
if (env.PULSO_KEY && existsSync(join(ROOT, 'config/meta.enc'))) {
  try {
    const b = descifrar(readFileSync(join(ROOT, 'config/meta.enc'), 'utf8'), env.PULSO_KEY);
    for (const [marca, m] of Object.entries(b.marcas || {})) {
      const M = marca.toUpperCase();
      env[`FB_PAGE_ID_${M}`] ||= m.pageId; env[`FB_TOKEN_${M}`] ||= m.token;
      if (m.igId) env[`IG_USER_ID_${M}`] ||= m.igId;
      if (m.igLogin) { env[`IG_TOKEN_${M}`] = m.igLogin.token; env[`IG_LOGIN_ID_${M}`] = m.igLogin.igId; }
    }
  } catch { console.log('Métricas: no se pudo leer config/meta.enc.'); }
}
if (env.PULSO_PRUEBA === '1') { console.log('Métricas: modo prueba, no se consulta nada.'); process.exit(0); }
const GV = env.META_GRAPH_VERSION || 'v25.0';
const cuenta = (marca) => (redes[marca] && redes[marca].cuentaDe) || marca;
const S = (name, marca) => env[`${name}_${marca.toUpperCase()}`] || env[`${name}_${cuenta(marca).toUpperCase()}`];
const CADA_H = 6, DIAS = 45;

async function get(url) {
  const res = await fetch(url); const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
  return data;
}
// Pide varias métricas juntas; si la API rechaza alguna, las pide una por una y se queda con las que existen.
async function insights(base, metricas, token, extra = '') {
  const leer = (d) => { const o = {}; for (const x of d.data || []) { const v = x.total_value ? x.total_value.value : (x.values && x.values.length ? x.values[x.values.length - 1].value : null); if (v != null) o[x.name] = v; } return o; };
  try { return leer(await get(`${base}?metric=${metricas.join(',')}${extra}&access_token=${encodeURIComponent(token)}`)); }
  catch {
    const o = {};
    for (const m of metricas) { try { Object.assign(o, leer(await get(`${base}?metric=${m}${extra}&access_token=${encodeURIComponent(token)}`))); } catch { /* métrica no disponible */ } }
    return o;
  }
}
function igAcceso(marca) {
  const t = S('IG_TOKEN', marca);
  if (t) return { host: `https://graph.instagram.com/${GV}`, token: t };
  const token = S('FB_TOKEN', marca);
  return token ? { host: `https://graph.facebook.com/${GV}`, token } : null;
}
const IG_REEL = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time'];
const IG_FOTO = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'];
const FB_VIDEO = ['total_video_views', 'total_video_views_unique', 'total_video_impressions', 'total_video_impressions_unique', 'total_video_complete_views', 'total_video_avg_time_watched', 'total_video_10s_views', 'total_video_15s_views', 'blue_reels_play_count', 'fb_reels_total_plays', 'post_video_avg_time_watched'];
const FB_POST = ['post_media_view', 'post_total_media_view_unique', 'post_impressions_unique', 'post_clicks', 'post_reactions_by_type_total'];

function duracion(id) {
  const f = join(ROOT, 'media', id + '.mp4');
  if (!existsSync(f)) return null;
  try { return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()) || null; } catch { return null; }
}

mkdirSync(join(ROOT, 'metricas'), { recursive: true });
let leidas = 0;
for (const f of readdirSync(join(ROOT, 'estado')).filter(f => f.endsWith('.json'))) {
  const est = JSON.parse(readFileSync(join(ROOT, 'estado', f), 'utf8'));
  const colaF = join(ROOT, 'cola', f);
  const p = existsSync(colaF) ? JSON.parse(readFileSync(colaF, 'utf8')) : {};
  const mf = join(ROOT, 'metricas', f);
  const prev = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : null;
  if (prev && Date.now() - new Date(prev.actualizado).getTime() < (prev.vacio ? 24 : CADA_H) * 3.6e6) continue;
  const fechas = Object.values(est.redes || {}).filter(r => r.ok && r.en).map(r => new Date(r.en).getTime());
  if (!fechas.length || Date.now() - Math.min(...fechas) > DIAS * 864e5) continue;
  const marca = est.marca || p.marca;
  const reel = p.formato === 'Reel' || existsSync(join(ROOT, 'media', est.id + '.mp4')) && p.formato !== 'Post' && p.formato !== 'Carrusel';
  const out = { id: est.id, marca, formato: p.formato || null, actualizado: new Date().toISOString(), duracion: reel ? duracion(est.id) : null };
  const ig = est.redes.instagram, fb = est.redes.facebook;
  if (ig && ig.ok && ig.id) {
    const a = igAcceso(marca);
    if (a) out.instagram = await insights(`${a.host}/${ig.id}/insights`, reel ? IG_REEL : IG_FOTO, a.token);
  }
  if (fb && fb.ok && fb.id) {
    const token = S('FB_TOKEN', marca);
    if (token) {
      const G = `https://graph.facebook.com/${GV}`;
      out.facebook = reel && !String(fb.id).includes('_')
        ? await insights(`${G}/${fb.id}/video_insights`, FB_VIDEO, token, '&period=lifetime')
        : await insights(`${G}/${fb.id}/insights`, FB_POST, token);
    }
  }
  // Indicadores para Spot50: retención (gancho) y avance promedio del video.
  const d = {}, I = out.instagram || {}, F = out.facebook || {};
  if (F.total_video_impressions && F.total_video_views != null) d.ganchoFacebook = +(F.total_video_views / F.total_video_impressions * 100).toFixed(1);
  if (F.total_video_views && F.total_video_15s_views != null) d.retencion15Facebook = +(F.total_video_15s_views / F.total_video_views * 100).toFixed(1);
  if (out.duracion && I.ig_reels_avg_watch_time) d.vistoPromedioInstagram = +Math.min(100, I.ig_reels_avg_watch_time / 1000 / out.duracion * 100).toFixed(1);
  if (I.reach && I.total_interactions != null) d.interaccionInstagram = +(I.total_interactions / I.reach * 100).toFixed(2);
  d.vistas = (I.views || 0) + (F.total_video_views || F.blue_reels_play_count || F.post_media_view || 0);
  out.derivados = d;
  // Sin datos (falta permiso de estadísticas o token): se conserva lo anterior y se reintenta en 24 h.
  if (!Object.keys(I).length && !Object.keys(F).length) { writeFileSync(mf, JSON.stringify(Object.assign({}, prev || { id: est.id, marca }, { actualizado: out.actualizado, vacio: true }), null, 2)); continue; }
  writeFileSync(mf, JSON.stringify(out, null, 2));
  leidas++; console.log(`· Métricas de ${est.id}: ${d.vistas} vistas`);
}
console.log(`Métricas: ${leidas} publicaciones actualizadas.`);
