// Voz en off con IA para Spot50. Lee voz/pedidos/<id>.json y deja voz/listas/<id>.mp3 (+ .json).
// Pedido: { id, lineas: ["línea 1", "línea 2", ...], voz: "hombre" | "mujer", motor: "auto" | "elevenlabs" | "kokoro", velocidad: 1.05 }
// Motor: ElevenLabs si existe el secreto ELEVENLABS_API_KEY (mejor calidad); si no, Kokoro (gratis, corre aquí mismo).
// Cada línea se genera por separado y se une con medio segundo de silencio: así Spot50 sincroniza escenas y subtítulos.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.assign({}, process.env, process.env.SECRETS_JSON ? JSON.parse(process.env.SECRETS_JSON) : {});
const PED = join(ROOT, 'voz/pedidos'), LISTAS = join(ROOT, 'voz/listas'), TMP = join(ROOT, 'voz/_tmp');
mkdirSync(LISTAS, { recursive: true });
// Voces de ElevenLabs: pon tus favoritas (de la Voice Library, acento mexicano) en los secretos
// ELEVENLABS_VOZ_HOMBRE y ELEVENLABS_VOZ_MUJER. Si no, usa voces multilingües de la biblioteca base.
const EL_VOZ = { hombre: env.ELEVENLABS_VOZ_HOMBRE || 'ErXwobaYiN019PkySvjV', mujer: env.ELEVENLABS_VOZ_MUJER || '21m00Tcm4TlvDq8ikWAM' };
// Ecualización y compresión de locutor de radio, igual para los dos motores.
const CADENA = 'highpass=f=85,equalizer=f=180:t=q:w=1:g=2,equalizer=f=3200:t=q:w=1.2:g=3.5,equalizer=f=7500:t=q:w=1.5:g=-2,acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=3,loudnorm=I=-16:TP=-1.5:LRA=9';
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

async function eleven(lineas, voz, vel, dir) {
  const archivos = [];
  for (let i = 0; i < lineas.length; i++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOZ[voz] || EL_VOZ.hombre}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: lineas[i], model_id: env.ELEVENLABS_MODELO || 'eleven_multilingual_v2',
        previous_text: lineas[i - 1] || undefined, next_text: lineas[i + 1] || undefined,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, vel)) } }) });
    if (!res.ok) throw new Error('ElevenLabs ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const f = join(dir, `l${i}.mp3`); writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    const w = join(dir, `l${i}.wav`);
    // Recorta silencios de los extremos de cada línea.
    ff(['-i', f, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', '-ar', '48000', '-ac', '1', w]);
    archivos.push(w);
  }
  return archivos;
}
// Instala Kokoro y baja el modelo solo cuando hay voces por hacer (no corre en cada publicación).
let kokoroListo = false;
async function prepararKokoro() {
  if (kokoroListo) return;
  const dir = env.KOKORO_DIR || join(process.env.HOME || '/tmp', '.cache/kokoro');
  mkdirSync(dir, { recursive: true });
  try { execFileSync('python3', ['-c', 'import kokoro_onnx, soundfile']); }
  catch { execFileSync('python3', ['-m', 'pip', 'install', '--quiet', '--user', '--break-system-packages', 'kokoro-onnx==0.6.1', 'soundfile'], { stdio: 'inherit' }); }
  for (const f of ['kokoro-v1.0.onnx', 'voices-v1.0.bin']) {
    if (existsSync(join(dir, f))) continue;
    const res = await fetch(`https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/${f}`);
    if (!res.ok) throw new Error('No se pudo bajar el modelo de voz: ' + res.status);
    writeFileSync(join(dir, f), Buffer.from(await res.arrayBuffer()));
  }
  env.KOKORO_DIR = dir; kokoroListo = true;
}
function kokoro(lineas, voz, vel, dir) {
  const cfg = join(dir, 'pedido.json');
  writeFileSync(cfg, JSON.stringify({ lineas, voz: voz === 'mujer' ? 'ef_dora' : 'em_alex', vel, dir }));
  execFileSync('python3', [join(ROOT, 'scripts/voz_kokoro.py'), cfg], { stdio: 'inherit', env: Object.assign({}, process.env, { KOKORO_DIR: env.KOKORO_DIR }) });
  return lineas.map((_, i) => join(dir, `l${i}.wav`));
}

let hechos = 0;
for (const f of existsSync(PED) ? readdirSync(PED).filter(f => f.endsWith('.json')) : []) {
  const p = JSON.parse(readFileSync(join(PED, f), 'utf8'));
  const id = String(p.id || f.replace(/\.json$/, '')).replace(/[^a-zA-Z0-9_-]/g, '');
  if (existsSync(join(LISTAS, id + '.mp3')) || existsSync(join(LISTAS, id + '.json'))) continue; // ya hecha o con error (para reintentar, borra el .json)
  const lineas = (Array.isArray(p.lineas) ? p.lineas : String(p.texto || '').split(/\n\s*\n/)).map(x => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
  if (!lineas.length) continue;
  const vel = +p.velocidad || 1.05, voz = p.voz === 'mujer' ? 'mujer' : 'hombre';
  const usarEL = env.ELEVENLABS_API_KEY && p.motor !== 'kokoro';
  const dir = join(TMP, id); mkdirSync(dir, { recursive: true });
  try {
    let archivos, motor;
    try { if (!usarEL) await prepararKokoro(); archivos = usarEL ? await eleven(lineas, voz, vel, dir) : kokoro(lineas, voz, vel, dir); motor = usarEL ? 'elevenlabs' : 'kokoro'; }
    catch (e) { if (!usarEL) throw e; console.log('· ElevenLabs falló, se usa Kokoro:', e.message); await prepararKokoro(); archivos = kokoro(lineas, voz, vel, dir); motor = 'kokoro'; }
    // Une las líneas con 0.55 s de silencio y aplica la cadena de locutor.
    const sil = join(dir, 'sil.wav'); ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.55', sil]);
    const lista = join(dir, 'lista.txt');
    writeFileSync(lista, archivos.flatMap((a, i) => i ? [`file '${sil}'`, `file '${a}'`] : [`file '${a}'`]).join('\n'));
    const crudo = join(dir, 'crudo.wav'); ff(['-f', 'concat', '-safe', '0', '-i', lista, '-ar', '48000', '-ac', '1', crudo]);
    ff(['-i', crudo, '-af', CADENA, '-ar', '44100', '-ac', '1', '-b:a', '160k', join(LISTAS, id + '.mp3')]);
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(LISTAS, id + '.mp3')]).toString());
    writeFileSync(join(LISTAS, id + '.json'), JSON.stringify({ id, motor, voz, lineas: lineas.length, duracion: +dur.toFixed(2), creado: new Date().toISOString() }, null, 2));
    hechos++; console.log(`✔ Voz ${id}: ${motor}, ${lineas.length} líneas, ${dur.toFixed(1)} s`);
  } catch (e) {
    writeFileSync(join(LISTAS, id + '.json'), JSON.stringify({ id, error: String(e.message || e).slice(0, 300), creado: new Date().toISOString() }, null, 2));
    console.log(`✖ Voz ${id}: ${e.message}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
rmSync(TMP, { recursive: true, force: true });
console.log(`Voces listas: ${hechos}.`);
