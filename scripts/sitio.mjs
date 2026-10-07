// Genera un sitio público por marca en docs/ (GitHub Pages, gratis).
// Cada página se actualiza sola con lo publicado y se puede incrustar en Google Sites.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paginaBNY } from './sitio-bny.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const marcas = JSON.parse(readFileSync(join(ROOT, 'config/marcas.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT_URL = { 'Bodoni Moda': 'Bodoni+Moda:ital,wght@0,400;0,500;1,400;1,500', 'Hanken Grotesk': 'Hanken+Grotesk:wght@400;600;700', 'Playfair Display': 'Playfair+Display:ital,wght@0,400;0,500;1,400', 'Manrope': 'Manrope:wght@400;600;700', 'Young Serif': 'Young+Serif', 'Figtree': 'Figtree:wght@400;600;700', 'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,500;1,500', 'Jost': 'Jost:wght@400;500' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = (s) => { const [y, m, d] = s.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };

const publicados = readdirSync(join(ROOT, 'cola')).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(ROOT, 'cola', f), 'utf8')))
  .filter(p => { const e = join(ROOT, 'estado', p.id + '.json'); return existsSync(e) && Object.values(JSON.parse(readFileSync(e, 'utf8')).redes).some(r => r.ok); })
  .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

mkdirSync(join(ROOT, 'docs', 'media'), { recursive: true });
let indice = '';
for (const [id, m] of Object.entries(marcas)) {
  const ps = publicados.filter(p => p.marca === id || (id === 'bny' && p.marca === 'invitaciones')).slice(0, 60);
  mkdirSync(join(ROOT, 'docs', id), { recursive: true });
  ps.forEach(p => { const src = join(ROOT, 'media', p.id + '.png'); if (existsSync(src)) copyFileSync(src, join(ROOT, 'docs', 'media', p.id + '.png')); });
  const dark = m.estilo === 'nocturno';
  const bg = dark ? m.colorPrincipal : m.colorFondo, fg = dark ? '#F4EFE6' : m.colorTexto, acc = m.colorDetalle || m.colorAcento;
  const items = ps.map(p => `<article><img src="../media/${esc(p.id)}.png" alt="${esc(p.titular || p.gancho)}" loading="lazy" width="540" height="540"><div><time datetime="${esc(p.fecha)}">${esc(fecha(p.fecha))}</time><h2>${esc(p.gancho || p.titular)}</h2><p>${esc(p.texto).replace(/\n/g, '<br>')}</p></div></article>`).join('\n');
  const html = `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.nombre)}</title><meta name="description" content="${esc(m.firma || m.nombre)}">
<meta property="og:title" content="${esc(m.nombre)}"><meta property="og:description" content="${esc(m.firma || '')}">${ps[0] ? `<meta property="og:image" content="../media/${esc(ps[0].id)}.png">` : ''}
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${FONT_URL[m.fuenteTitulo]}&family=${FONT_URL[m.fuenteTexto]}&display=swap">
<style>:root{color-scheme:${dark ? 'dark' : 'light'}}*{box-sizing:border-box}body{margin:0;background:${bg};color:${fg};font:17px/1.6 "${m.fuenteTexto}",system-ui,sans-serif;padding:0 16px}
header{max-width:980px;margin:0 auto;padding:56px 0 32px;border-bottom:1px solid ${acc}55}h1{font:${m.estilo === 'tecnico' ? '400' : 'italic 500'} clamp(40px,7vw,72px)/1.05 "${m.fuenteTitulo}",Georgia,serif;margin:0}
header p{margin:10px 0 0;opacity:.8}header a{display:inline-block;margin-top:18px;color:${acc};font-weight:700;text-decoration:none;border:1px solid ${acc};padding:10px 18px;border-radius:${m.estilo === 'editorial' ? '0' : '999px'}}
main{max-width:980px;margin:0 auto;padding:32px 0 80px;display:flex;flex-direction:column;gap:40px}article{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:28px;align-items:start}
@media(max-width:680px){article{grid-template-columns:minmax(0,1fr)}}img{width:100%;height:auto;border-radius:6px;display:block}time{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:${acc}}
h2{font:500 28px/1.2 "${m.fuenteTitulo}",Georgia,serif;margin:6px 0 10px}article p{margin:0;opacity:.88;max-width:62ch}.vacio{opacity:.7}</style></head><body>
<header><h1>${esc(m.nombre)}</h1><p>${esc(m.firma || '')}</p>${m.web ? `<a href="${esc(m.web)}">${esc(m.cta || 'Contáctanos')}</a>` : ''}</header>
<main>${items || '<p class="vacio">Pronto verás aquí nuestras publicaciones.</p>'}</main></body></html>`;
  if (id === 'bny') {
    // BNY tiene sitio completo con su logo real.
    if (m.logo && existsSync(join(ROOT, m.logo))) copyFileSync(join(ROOT, m.logo), join(ROOT, 'docs', id, 'logo.png'));
    const inv = marcas.invitaciones; if (inv && inv.logo && existsSync(join(ROOT, inv.logo))) copyFileSync(join(ROOT, inv.logo), join(ROOT, 'docs', id, 'invitaciones.png'));
    writeFileSync(join(ROOT, 'docs', id, 'index.html'), paginaBNY(ps, fecha));
  } else writeFileSync(join(ROOT, 'docs', id, 'index.html'), html);
  indice += `<li><a href="${id}/">${esc(m.nombre)}</a></li>`;
}
writeFileSync(join(ROOT, 'docs', 'index.html'), `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pulso</title></head><body style="font-family:system-ui;padding:40px"><h1>Marcas</h1><ul>${indice}</ul></body></html>`);
writeFileSync(join(ROOT, 'docs', '.nojekyll'), '');
writeFileSync(join(ROOT, 'docs', '_redirects'), '/   /bny/   301\n'); // Netlify: la dirección principal abre el sitio de BNY
console.log('Sitio actualizado:', publicados.length, 'publicaciones.');
