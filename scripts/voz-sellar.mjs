// Cifra una muestra de voz con la llave pública de Pulso (config/voz-publica.pem) para guardarla en este repositorio público.
// Uso: node scripts/voz-sellar.mjs <audio de entrada> voz/muestras/<id>.enc
// Solo el flujo de GitHub (con PULSO_KEY) puede abrirla. Nunca subas la muestra sin cifrar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicEncrypt, randomBytes, createCipheriv, constants } from 'node:crypto';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node scripts/voz-sellar.mjs <audio> voz/muestras/<id>.enc'); process.exit(1); }
const pub = readFileSync(join(ROOT, 'config/voz-publica.pem'), 'utf8');
const k = randomBytes(32), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', k, iv);
const datos = Buffer.concat([c.update(readFileSync(entrada)), c.final()]);
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify({ v: 1, alg: 'rsa-oaep-256+aes-256-gcm', ext: extname(entrada).slice(1) || 'bin',
  k: publicEncrypt({ key: pub, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, k).toString('base64'),
  iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), datos: datos.toString('base64') }));
console.log('Muestra cifrada:', salida, (datos.length / 1048576).toFixed(1) + ' MB');
