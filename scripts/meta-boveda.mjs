// Bóveda cifrada para los accesos de Meta (AES-256-GCM con la llave PULSO_KEY).
// El archivo config/meta.enc puede vivir en un repositorio público: sin la llave no se puede leer.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Clientes de Spot50 cuyas páginas administra BNY: config/clientes.json → { "<marca>": { "nombre", "pagina" } }
const CLIENTES_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'config/clientes.json');
export function clientes() {
  try { const c = existsSync(CLIENTES_FILE) ? JSON.parse(readFileSync(CLIENTES_FILE, 'utf8')) : {}; delete c._ayuda; return c; } catch { return {}; }
}
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const llave = (secreto) => scryptSync(String(secreto), 'pulso-meta-v1', 32);

export function cifrar(objeto, secreto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(secreto), iv);
  const datos = Buffer.concat([c.update(JSON.stringify(objeto), 'utf8'), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), datos: datos.toString('base64') });
}

export function descifrar(texto, secreto) {
  const o = JSON.parse(texto);
  const d = createDecipheriv('aes-256-gcm', llave(secreto), Buffer.from(o.iv, 'base64'));
  d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.datos, 'base64')), d.final()]).toString('utf8'));
}

// Asocia cada página de Facebook con su marca por nombre.
export function marcaDePagina(nombre) {
  const n = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Primero los clientes (coincidencia exacta del nombre de la página), después las marcas propias.
  for (const [marca, c] of Object.entries(clientes())) if (c && c.pagina && norm(c.pagina) === norm(nombre)) return marca;
  if (n.includes('invitacion')) return 'invitaciones';
  if (n.includes('kotizo')) return 'kotizo';
  if (n.includes('varelia')) return 'varelia';
  if (n.includes('bny')) return 'bny';
  return null;
}
