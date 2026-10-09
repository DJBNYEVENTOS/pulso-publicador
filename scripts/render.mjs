// Dibuja la imagen (y el video vertical cuando hace falta) de cada publicación en cola/.
// Usa las mismas plantillas que la app Pulso. Solo vuelve a dibujar si el contenido cambió.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicaPara } from './musica.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const marcas = JSON.parse(readFileSync(join(ROOT, 'config/marcas.json'), 'utf8'));
const redes = JSON.parse(readFileSync(join(ROOT, 'config/redes.json'), 'utf8'));
const plantillas = readFileSync(join(ROOT, 'render/plantillas.js'), 'utf8');

const FACES = [
  ['Bodoni Moda', 'BodoniModa.ttf', 'normal'], ['Bodoni Moda', 'BodoniModa-Italic.ttf', 'italic'],
  ['Hanken Grotesk', 'HankenGrotesk.ttf', 'normal'],
  ['Playfair Display', 'PlayfairDisplay.ttf', 'normal'], ['Playfair Display', 'PlayfairDisplay-Italic.ttf', 'italic'],
  ['Manrope', 'Manrope.ttf', 'normal'], ['Young Serif', 'YoungSerif-Regular.ttf', 'normal'],
  ['Figtree', 'Figtree.ttf', 'normal'],
  ['Cormorant Garamond', 'CormorantGaramond.ttf', 'normal'], ['Cormorant Garamond', 'CormorantGaramond-Italic.ttf', 'italic'],
  ['Jost', 'Jost.ttf', 'normal'],
  ['Tinos', 'Tinos-Regular.ttf', 'normal', '400'], ['Tinos', 'Tinos-Italic.ttf', 'italic', '400'], ['Tinos', 'Tinos-Bold.ttf', 'normal', '700'], ['Tinos', 'Tinos-BoldItalic.ttf', 'italic', '700'],
  ['Arimo', 'Arimo.ttf', 'normal'],
];

export function necesitaVideo(p) {
  const r = redes[p.marca] || {};
  return p.formato === 'Reel' || (r.videoParaTodo && (r.tiktok || r.youtube || r.instagram));
}

// Frase corta para una escena o lámina (primera oración, máx. ~110 caracteres).
const frase = (t) => { const f = String(t).split(/(?<=[.!?])\s+/)[0].trim(); return f.length > 110 ? f.slice(0, 107).replace(/\s+\S*$/, '') + '…' : f; };
const esContacto = (t) => /whatsapp|link en bio|netlify|\d{3} \d{3} \d{4}|es una experiencia bny|como las imaginas|gu[aá]rdalo|guarda este/i.test(t);
// Escenas de un reel: gancho, 2-3 ideas del texto y cierre con llamado a la acción.
export function escenasDe(p) {
  const m = marcas[p.marca] || {};
  if (Array.isArray(p.escenas) && p.escenas.length) return p.escenas;
  const parr = String(p.texto || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const cuerpo = parr.slice(1).filter(x => !esContacto(x)).slice(0, 3).map(x => ({ titular: frase(x) }));
  return [{ titular: p.titular || p.gancho, subtitulo: p.subtitulo || '' }, ...cuerpo, { titular: m.firma || p.cta, cta: p.cta || m.cta, final: true }];
}
// Láminas de un carrusel (la portada es la imagen principal).
export function laminasDe(p) {
  const m = marcas[p.marca] || {};
  if (Array.isArray(p.laminas) && p.laminas.length) return p.laminas;
  const parr = String(p.texto || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const cuerpo = parr.slice(1).filter(x => !esContacto(x)).slice(0, 3).map(x => ({ titular: frase(x) }));
  return [...cuerpo, { titular: p.cta || m.cta, subtitulo: m.firma || '', final: true }];
}
function tamano(p) {
  if (p.formato === 'Historia' || p.formato === 'Reel') return 'historia';
  if (p.formato === 'Carrusel') return 'vertical';
  return 'post';
}
function huella(p) {
  const m = marcas[p.marca] || {};
  return createHash('sha1').update(JSON.stringify([p.titular, p.gancho, p.subtitulo, p.cta, p.plantilla, p.formato, p.escenas, p.laminas, p.texto, m, 4])).digest('hex').slice(0, 12);
}

const posts = readdirSync(join(ROOT, 'cola')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ROOT, 'cola', f), 'utf8')));
const pendientes = posts.filter(p => {
  const marca = join(ROOT, 'media', p.id + '.huella');
  return !existsSync(join(ROOT, 'media', p.id + '.png')) || !existsSync(marca) || readFileSync(marca, 'utf8') !== huella(p)
    || (necesitaVideo(p) && !existsSync(join(ROOT, 'media', p.id + '.mp4')))
    || (p.formato === 'Carrusel' && !existsSync(join(ROOT, 'media', p.id + '-c2.png')));
});
if (!pendientes.length) { console.log('Nada que dibujar.'); process.exit(0); }

const css = FACES.map(([fam, file, style, weight]) => `@font-face{font-family:'${fam}';src:url(data:font/ttf;base64,${readFileSync(join(ROOT, 'fonts', file)).toString('base64')}) format('truetype');font-style:${style};font-weight:${weight || '100 900'}}`).join('');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><canvas id="c"></canvas><script>${plantillas}</script></body></html>`);
await page.evaluate(async (fams) => {
  for (const f of fams) for (const w of ['400', '500', '600', '700', '800', 'italic 400', 'italic 500']) { try { await document.fonts.load(`${w} 40px "${f}"`); } catch (e) {} }
  await document.fonts.ready;
  const faltan = fams.filter(f => !document.fonts.check(`400 40px "${f}"`));
  if (faltan.length) throw new Error('No cargaron las fuentes: ' + faltan.join(', '));
}, [...new Set(FACES.map(f => f[0]))]);

async function dibujar(p, size, extra) {
  const m = Object.assign({}, marcas[p.marca] || {});
  const d = Object.assign({ plantilla: p.plantilla || 'impacto', titular: p.titular || p.gancho, subtitulo: p.subtitulo || '', cta: p.cta || m.cta, size }, extra || {});
  const b64 = (f) => f && existsSync(join(ROOT, f)) ? 'data:image/png;base64,' + readFileSync(join(ROOT, f)).toString('base64') : null;
  const logo = b64(m.logo), logoClaro = b64(m.logoClaro);
  const dataUrl = await page.evaluate(async ({ d, m, logo, logoClaro }) => {
    const cargar = (src) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = src; });
    if (logo) m.logoImg = await cargar(logo);
    if (logoClaro) m.logoClaroImg = await cargar(logoClaro);
    const cv = document.getElementById('c'); drawDesign(cv, d, m, null); return cv.toDataURL('image/png');
  }, { d, m, logo, logoClaro });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

for (const p of pendientes) {
  const png = join(ROOT, 'media', p.id + '.png');
  writeFileSync(png, await dibujar(p, tamano(p)));
  if (p.formato === 'Carrusel') {
    // Carrusel real: portada + láminas (1080x1350).
    const ls = laminasDe(p), total = ls.length + 1;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i], n = i + 2;
      const extra = l.final
        ? { plantilla: 'oferta', titular: l.titular, subtitulo: l.subtitulo || '', cta: l.cta || p.cta }
        : { plantilla: 'tip', titular: l.titular, subtitulo: l.subtitulo || '', sinCta: true, etiqueta: l.etiqueta || `${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}` };
      writeFileSync(join(ROOT, 'media', `${p.id}-c${n}.png`), await dibujar(p, 'vertical', extra));
    }
  }
  if (necesitaVideo(p)) {
    // Reel de varias escenas: cada idea en su propia pantalla, con acercamiento lento y fundido entre escenas.
    const es = p.formato === 'Reel' ? escenasDe(p) : [{ titular: p.titular || p.gancho, subtitulo: p.subtitulo || '' }];
    const archivos = [];
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      const extra = i === 0 ? { subtitulo: e.subtitulo || p.subtitulo || '', titular: e.titular, sinCta: es.length > 1 }
        : e.final ? { plantilla: 'impacto', titular: e.titular, subtitulo: e.subtitulo || '', cta: e.cta || p.cta }
        : { plantilla: 'impacto', titular: e.titular, subtitulo: e.subtitulo || '', sinCta: true };
      const f = join(ROOT, 'media', `${p.id}-e${i + 1}.png`);
      writeFileSync(f, await dibujar(p, 'historia', extra));
      archivos.push(f);
    }
    writeFileSync(join(ROOT, 'media', p.id + '-vertical.png'), readFileSync(archivos[0]));
    const dur = (i) => (archivos.length === 1 ? 8 : i === 0 ? 3.6 : i === archivos.length - 1 ? 3.8 : 3.0), X = 0.5;
    const args = ['-y', '-loglevel', 'error'];
    archivos.forEach((f) => args.push('-i', f)); // una sola imagen por escena: zoompan genera los cuadros
    let fil = archivos.map((_, i) => `[${i}:v]scale=1188:2112,zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(dur(i) * 30)}:s=1080x1920:fps=30,format=yuv420p,setsar=1[v${i}]`).join(';');
    let prev = 'v0', t = dur(0);
    for (let i = 1; i < archivos.length; i++) { const out = i === archivos.length - 1 ? 'vout' : `x${i}`; fil += `;[${prev}][v${i}]xfade=transition=fade:duration=${X}:offset=${(t - X).toFixed(2)}[${out}]`; prev = out; t += dur(i) - X; }
    if (archivos.length === 1) fil += ';[v0]copy[vout]';
    // Música: pista libre de derechos de musica/<marca>/ o composición original.
    const total = archivos.length === 1 ? dur(0) : t;
    const wav = join(ROOT, 'media', p.id + '.wav');
    const origen = await musicaPara(ROOT, p.marca, p.id + (p.titular || ''), total, wav);
    if (origen) args.push('-i', wav);
    args.push('-filter_complex', fil, '-map', '[vout]', ...(origen ? ['-map', `${archivos.length}:a`, '-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(ROOT, 'media', p.id + '.mp4'));
    execFileSync('ffmpeg', args);
    try { (await import('node:fs')).unlinkSync(wav); } catch {}
    console.log('  música:', origen || 'sin música (agrega pistas en musica/ o config/musica.json)');
  }
  writeFileSync(join(ROOT, 'media', p.id + '.huella'), huella(p));
  console.log('Dibujado', p.id);
}
await browser.close();
