// Música para los reels, sin derechos de terceros.
// 1) Si existe musica/<marca>/ con pistas (mp3, m4a, wav) libres de derechos, usa una (elegida por publicación).
// 2) Si no, compone una pieza original con el estilo de la marca (piano, pads, campanas, plucks, ritmo).
// Todo en JavaScript puro: no necesita librerías.
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const SR = 44100;

// Generador pseudoaleatorio con semilla (cada publicación suena distinto, pero siempre igual al volver a dibujarla).
function rng(semilla) {
  let h = 2166136261;
  for (const c of String(semilla)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; };
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- Instrumentos ---------- */
function piano(L, R, t0, midi, vel, pan = 0) {
  const f = hz(midi), n0 = Math.floor(t0 * SR), len = Math.floor(SR * 3.2);
  const gl = vel * (1 - pan) * 0.5, gr = vel * (1 + pan) * 0.5;
  for (let h = 1; h <= 8; h++) {
    const fh = f * h * Math.sqrt(1 + 0.0004 * h * h), a = 1 / Math.pow(h, 1.15), dec = 1.2 + h * 0.55;
    if (fh > 16000) break;
    const w = 2 * Math.PI * fh / SR;
    for (let i = 0; i < len; i++) {
      const k = n0 + i; if (k >= L.length) break;
      const t = i / SR, env = Math.min(1, t / 0.004) * Math.exp(-dec * t);
      const v = a * env * Math.sin(w * i);
      L[k] += v * gl; R[k] += v * gr;
    }
  }
}
function campana(L, R, t0, midi, vel, pan = 0) {
  const f = hz(midi), n0 = Math.floor(t0 * SR), len = Math.floor(SR * 2.5);
  const parciales = [[1, 1, 2.2], [2.76, 0.45, 4], [5.4, 0.2, 7], [8.93, 0.08, 10]];
  for (const [r, a, d] of parciales) {
    const w = 2 * Math.PI * f * r / SR;
    for (let i = 0; i < len; i++) {
      const k = n0 + i; if (k >= L.length) break;
      const t = i / SR, v = vel * a * Math.min(1, t / 0.002) * Math.exp(-d * t) * Math.sin(w * i);
      L[k] += v * (1 - pan) * 0.5; R[k] += v * (1 + pan) * 0.5;
    }
  }
}
function pluck(L, R, t0, midi, vel, pan = 0, brillo = 0.5) {
  // Karplus-Strong: cuerda pulsada.
  const f = hz(midi), p = Math.max(2, Math.round(SR / f)), buf = new Float32Array(p);
  const r = rng(midi * 7 + t0);
  for (let i = 0; i < p; i++) buf[i] = r() * 2 - 1;
  const n0 = Math.floor(t0 * SR), len = Math.floor(SR * 2), keep = 0.994 - (1 - brillo) * 0.01;
  let idx = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const k = n0 + i; if (k >= L.length) break;
    const cur = buf[idx], nxt = buf[(idx + 1) % p];
    const v = (cur + nxt) * 0.5 * keep;
    buf[idx] = v; idx = (idx + 1) % p;
    const out = v * 0.5 + prev * 0.5; prev = v;
    L[k] += out * vel * (1 - pan) * 0.5; R[k] += out * vel * (1 + pan) * 0.5;
  }
}
function pad(L, R, t0, dur, notas, vel, brillo = 0.08) {
  const n0 = Math.floor(t0 * SR), len = Math.floor(dur * SR), att = Math.min(1.4, dur / 3), rel = Math.min(1.6, dur / 2);
  for (const m of notas) for (const det of [-0.07, 0, 0.07]) {
    const f = hz(m + det), w = 2 * Math.PI * f / SR;
    let lp = 0;
    const pan = det * 6;
    for (let i = 0; i < len + rel * SR; i++) {
      const k = n0 + i; if (k >= L.length) break;
      const t = i / SR;
      const env = t < att ? t / att : t < dur ? 1 : Math.max(0, 1 - (t - dur) / rel);
      // onda triangular suavizada con filtro pasa-bajos
      const ph = (w * i / (2 * Math.PI)) % 1, tri = 4 * Math.abs(ph - 0.5) - 1;
      lp += brillo * (tri - lp);
      const v = lp * env * vel * 0.33;
      L[k] += v * (1 - pan) * 0.5; R[k] += v * (1 + pan) * 0.5;
    }
  }
}
function bajo(L, R, t0, dur, midi, vel) {
  const f = hz(midi), w = 2 * Math.PI * f / SR, n0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
  for (let i = 0; i < len; i++) {
    const k = n0 + i; if (k >= L.length) break;
    const t = i / SR, env = Math.min(1, t / 0.01) * Math.min(1, (len - i) / (SR * 0.08)) * Math.exp(-0.6 * t);
    const v = vel * env * (Math.sin(w * i) + 0.25 * Math.sin(2 * w * i));
    L[k] += v * 0.5; R[k] += v * 0.5;
  }
}
function bombo(L, R, t0, vel) {
  const n0 = Math.floor(t0 * SR), len = Math.floor(SR * 0.35);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const k = n0 + i; if (k >= L.length) break;
    const t = i / SR, f = 45 + 75 * Math.exp(-t * 28);
    ph += 2 * Math.PI * f / SR;
    const v = vel * Math.exp(-t * 9) * Math.sin(ph);
    L[k] += v * 0.5; R[k] += v * 0.5;
  }
}
function platillo(L, R, t0, vel, semilla) {
  const r = rng(semilla), n0 = Math.floor(t0 * SR), len = Math.floor(SR * 0.08);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const k = n0 + i; if (k >= L.length) break;
    const x = r() * 2 - 1, hp = x - prev; prev = x;
    const v = vel * hp * Math.exp(-i / SR * 55);
    L[k] += v * 0.35; R[k] += v * 0.45;
  }
}

/* ---------- Reverberación (Freeverb) ---------- */
function reverb(L, R, cuarto = 0.86, amortiguar = 0.3, mezcla = 0.3) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], alls = [556, 441, 341, 225];
  const proc = (x, spread) => {
    const out = new Float32Array(x.length);
    for (const c of combs) {
      const n = c + spread, buf = new Float32Array(n); let idx = 0, store = 0;
      for (let i = 0; i < x.length; i++) {
        const y = buf[idx]; store = y * (1 - amortiguar) + store * amortiguar;
        buf[idx] = x[i] * 0.015 + store * cuarto; idx = (idx + 1) % n; out[i] += y;
      }
    }
    for (const a of alls) {
      const n = a + spread, buf = new Float32Array(n); let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[idx], y = -out[i] + b; buf[idx] = out[i] + b * 0.5; idx = (idx + 1) % n; out[i] = y;
      }
    }
    return out;
  };
  const wl = proc(L, 0), wr = proc(R, 23);
  for (let i = 0; i < L.length; i++) { L[i] = L[i] * (1 - mezcla) + wl[i] * mezcla * 3; R[i] = R[i] * (1 - mezcla) + wr[i] * mezcla * 3; }
}

/* ---------- Estilos por marca ---------- */
const ESTILOS = {
  // Lujo discreto: piano lento con ambiente amplio, pad suave, bajo profundo.
  bny: { bpm: 68, tono: 50, acordes: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 6]], piano: true, pad: 0.1, bajo: 0.1, sala: [0.9, 0.35, 0.38] },
  // Editorial: plucks cálidos y pad, ritmo tranquilo.
  varelia: { bpm: 84, tono: 48, acordes: [[0, 4, 7, 11], [4, 7, 11, 14], [5, 9, 12, 16], [7, 11, 14, 17]], pluck: true, piano: true, pad: 0.08, bajo: 0.08, sala: [0.84, 0.3, 0.3] },
  // Negocio ágil: plucks en corcheas, bombo y platillo, bajo marcado.
  kotizo: { bpm: 104, tono: 45, acordes: [[0, 3, 7, 12], [-4, 0, 3, 8], [3, 7, 10, 15], [-2, 2, 5, 10]], pluck: true, ritmo: true, pad: 0.06, bajo: 0.12, sala: [0.78, 0.35, 0.18] },
  // Emoción cálida: piano y campanas suaves.
  invitaciones: { bpm: 76, tono: 53, acordes: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 7]], piano: true, campana: true, pad: 0.08, bajo: 0.09, sala: [0.88, 0.3, 0.34] },
};

function componer(marca, semilla, dur) {
  const e = ESTILOS[marca] || ESTILOS.bny, r = rng(semilla + marca);
  const n = Math.ceil((dur + 3) * SR), L = new Float32Array(n), R = new Float32Array(n);
  const beat = 60 / e.bpm, compas = beat * 4, tr = Math.floor(r() * 5) - 2, base = e.tono + tr;
  const rot = Math.floor(r() * e.acordes.length), patron = Math.floor(r() * 3);
  const nComp = Math.ceil(dur / compas) + 1;
  for (let c = 0; c < nComp; c++) {
    const t = c * compas, ac = e.acordes[(c + rot) % e.acordes.length].map(x => base + x);
    if (e.pad) pad(L, R, t, compas, ac.map(x => x + 12), e.pad);
    if (e.bajo) bajo(L, R, t, compas * 0.95, ac[0] - 12, e.bajo);
    if (e.piano) {
      // Arpegio de piano: ascendente, en ola o con notas largas, según la semilla.
      const notas = [...ac, ac[1] + 12, ac[2] + 12];
      const pasos = e.bpm < 80 ? 4 : 8, dt = compas / pasos;
      for (let s = 0; s < pasos; s++) {
        let idx = patron === 0 ? s : patron === 1 ? [0, 2, 1, 3, 4, 3, 2, 1][s % 8] : [0, 4, 2, 5][s % 4];
        idx = idx % notas.length;
        const v = (s === 0 ? 0.55 : 0.38) * (0.85 + r() * 0.3);
        piano(L, R, t + s * dt + r() * 0.012, notas[idx] + 12, v * (e.pluck ? 0.6 : 1), (r() - 0.5) * 0.6);
      }
    }
    // Nota de melodía arriba, al inicio de cada compás (da brillo y una línea que se recuerda).
    if (e.piano && !e.ritmo) piano(L, R, t + beat * (c % 2 ? 2 : 0), ac[(c * 3) % ac.length] + 24, 0.28, 0.2);
    if (e.campana && c % 2 === 1) campana(L, R, t + beat * 2, ac[2] + 24, 0.22, 0.3);
    if (e.pluck) {
      const pasos = e.ritmo ? 8 : 4, dt = compas / pasos;
      for (let s = 0; s < pasos; s++) if (!e.ritmo || r() > 0.15) pluck(L, R, t + s * dt, ac[(s + c) % ac.length] + 24, e.ritmo ? 1.1 : 0.7, s % 2 ? 0.35 : -0.35, e.ritmo ? 0.7 : 0.4);
    }
    if (e.ritmo) for (let b = 0; b < 4; b++) {
      bombo(L, R, t + b * beat, 0.32);
      platillo(L, R, t + b * beat + beat / 2, 0.3, c * 10 + b);
    }
  }
  reverb(L, R, ...e.sala);
  // Mezcla final: entrada y salida suaves, limitador suave y normalización.
  const total = Math.floor(dur * SR), fi = SR * 0.6, fo = SR * 1.6;
  let pico = 0;
  for (let i = 0; i < total; i++) {
    const g = Math.min(1, i / fi) * Math.min(1, (total - i) / fo);
    L[i] = Math.tanh(L[i] * 1.2) * g; R[i] = Math.tanh(R[i] * 1.2) * g;
    pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
  }
  const k = pico > 0 ? 0.7 / pico : 1;
  const wav = Buffer.alloc(44 + total * 4);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + total * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24);
  wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(total * 4, 40);
  for (let i = 0; i < total; i++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * k)) * 32767), 44 + i * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * k)) * 32767), 46 + i * 4);
  }
  return wav;
}

// Pistas por marca: archivos en musica/<marca>/ y, además, las de config/musica.json
// (enlaces a música de estudio libre de derechos), que se descargan una vez y se guardan en media/_musica/<marca>/.
async function pistasDe(ROOT, marca) {
  const out = [];
  const dir = join(ROOT, 'musica', marca);
  if (existsSync(dir)) for (const f of readdirSync(dir).sort()) if (/\.(mp3|m4a|wav|ogg)$/i.test(f)) out.push(join(dir, f));
  const cfg = join(ROOT, 'config', 'musica.json');
  if (existsSync(cfg)) {
    const lista = (JSON.parse(readFileSync(cfg, 'utf8'))[marca] || []);
    const cache = join(ROOT, 'media', '_musica', marca);
    mkdirSync(cache, { recursive: true });
    // Entradas tipo {pagina, incluir, max}: se leen los mp3 de una página del catálogo (p. ej. Mixkit) una sola vez.
    const urls = [];
    const yaHay = readdirSync(cache).some(f => /\.mp3$/i.test(f));
    for (const item of lista) {
      if (item && item.pagina) {
        if (yaHay) continue;
        try {
          const html = await (await fetch(item.pagina, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
          let encontrados = [...new Set(html.match(/https:\/\/assets\.mixkit\.co\/music\/[^"'\s<>]+?\.mp3/g) || [])];
          // Prefiere el archivo de descarga sobre la vista previa del mismo tema.
          const porTema = new Map();
          for (const u of encontrados) { const k = u.split('/').pop(); if (!porTema.has(k) || u.includes('/download/')) porTema.set(k, u); }
          encontrados = [...porTema.values()];
          if (item.posiciones) encontrados = item.posiciones.map(n => encontrados[n - 1]).filter(Boolean);
          else if (item.incluir) encontrados = encontrados.filter(u => item.incluir.some(t => u.toLowerCase().includes('mixkit-' + t + '-')));
          urls.push(...encontrados.slice(0, item.max || 6));
          writeFileSync(join(cache, 'origen.json'), JSON.stringify({ pagina: item.pagina, encontrados: encontrados.length, usados: urls }, null, 2));
        } catch (e) { console.log('  no se pudo leer', item.pagina, e.message); }
      } else urls.push(typeof item === 'string' ? item : item.url);
    }
    for (const url of urls) {
      const nombre = url.split('/').pop().split('?')[0];
      const f = join(cache, nombre);
      if (!existsSync(f)) {
        try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
        catch (e) { console.log('  no se pudo descargar', nombre, e.message); continue; }
      }
      out.push(f);
    }
  }
  return out;
}

// Deja en `salida` (wav) la música del reel y devuelve su origen, o null si la marca no tiene pistas.
// La composición original solo se usa si PULSO_MUSICA_ORIGINAL=1.
export async function musicaPara(ROOT, marca, semilla, dur, salida) {
  const pistas = await pistasDe(ROOT, marca);
  if (pistas.length) {
    const r = rng(semilla), pista = pistas[Math.floor(r() * pistas.length)];
    // Empieza en un punto con energía (salta la intro si la pista es larga).
    let inicio = 0;
    try { const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', pista]).toString()); if (d > dur + 20) inicio = Math.min(12, d - dur - 2); } catch {}
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(inicio), '-i', pista, '-t', String(dur), '-af',
      `afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, dur - 1.8)}:d=1.8,loudnorm=I=-14:TP=-1.5`, '-ar', String(SR), '-ac', '2', salida]);
    return 'pista: ' + pista.split('/').pop();
  }
  if (process.env.PULSO_MUSICA_ORIGINAL === '1') { writeFileSync(salida, componer(marca, semilla, dur)); return 'música original de Pulso'; }
  return null;
}
