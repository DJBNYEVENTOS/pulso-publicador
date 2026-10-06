// Dibuja la imagen (y el video vertical cuando hace falta) de cada publicación en cola/.
// Usa las mismas plantillas que la app Pulso. Solo vuelve a dibujar si el contenido cambió.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
function tamano(p) {
  if (p.formato === 'Historia' || p.formato === 'Reel') return 'historia';
  if (p.formato === 'Carrusel') return 'vertical';
  return 'post';
}
function huella(p) {
  const m = marcas[p.marca] || {};
  return createHash('sha1').update(JSON.stringify([p.titular, p.gancho, p.subtitulo, p.cta, p.plantilla, p.formato, m])).digest('hex').slice(0, 12);
}

const posts = readdirSync(join(ROOT, 'cola')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(ROOT, 'cola', f), 'utf8')));
const pendientes = posts.filter(p => {
  const marca = join(ROOT, 'media', p.id + '.huella');
  return !existsSync(join(ROOT, 'media', p.id + '.png')) || !existsSync(marca) || readFileSync(marca, 'utf8') !== huella(p)
    || (necesitaVideo(p) && !existsSync(join(ROOT, 'media', p.id + '.mp4')));
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

async function dibujar(p, size) {
  const m = Object.assign({}, marcas[p.marca] || {});
  const d = { plantilla: p.plantilla || 'impacto', titular: p.titular || p.gancho, subtitulo: p.subtitulo || '', cta: p.cta || m.cta, size };
  const logo = m.logo && existsSync(join(ROOT, m.logo)) ? 'data:image/png;base64,' + readFileSync(join(ROOT, m.logo)).toString('base64') : null;
  const dataUrl = await page.evaluate(async ({ d, m, logo }) => {
    if (logo) { m.logoImg = await new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = logo; }); }
    const cv = document.getElementById('c'); drawDesign(cv, d, m, null); return cv.toDataURL('image/png');
  }, { d, m, logo });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

for (const p of pendientes) {
  const png = join(ROOT, 'media', p.id + '.png');
  writeFileSync(png, await dibujar(p, tamano(p)));
  if (necesitaVideo(p)) {
    const vpng = join(ROOT, 'media', p.id + '-vertical.png');
    writeFileSync(vpng, tamano(p) === 'historia' ? readFileSync(png) : await dibujar(p, 'historia'));
    // Video de 9 s con acercamiento lento (efecto Ken Burns), 1080x1920, sin audio.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', vpng,
      '-vf', "scale=1188:2112,zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=270:s=1080x1920:fps=30,format=yuv420p",
      '-t', '9', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', join(ROOT, 'media', p.id + '.mp4')]);
  }
  writeFileSync(join(ROOT, 'media', p.id + '.huella'), huella(p));
  console.log('Dibujado', p.id);
}
await browser.close();
