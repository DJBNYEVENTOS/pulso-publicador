// Memoria del agente: un documento por cliente (clave = teléfono) y una configuración general.
// En Netlify usa Netlify Blobs (gratis, incluido). En pruebas locales (AGENTE_PRUEBA=1) usa archivos JSON.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function local(nombre) {
  const dir = join(process.env.AGENTE_DATOS || '/tmp/agente-datos', nombre);
  mkdirSync(dir, { recursive: true });
  const f = (k) => join(dir, encodeURIComponent(k) + '.json');
  return {
    async get(k) { return existsSync(f(k)) ? JSON.parse(readFileSync(f(k), 'utf8')) : null; },
    async set(k, v) { writeFileSync(f(k), JSON.stringify(v, null, 2)); },
    async list() { return readdirSync(dir).filter(x => x.endsWith('.json')).map(x => decodeURIComponent(x.slice(0, -5))); },
  };
}

async function blobs(nombre) {
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name: nombre, consistency: 'strong' });
  return {
    async get(k) { return (await s.get(k, { type: 'json' })) ?? null; },
    async set(k, v) { await s.setJSON(k, v); },
    async list() { const r = await s.list(); return r.blobs.map(b => b.key); },
  };
}

const cache = {};
export async function almacen(nombre) {
  if (!cache[nombre]) cache[nombre] = process.env.AGENTE_PRUEBA === '1' ? local(nombre) : await blobs(nombre);
  return cache[nombre];
}

export const clientes = () => almacen('clientes');
export const eventos = () => almacen('eventos'); // para no procesar dos veces el mismo mensaje

export async function config() {
  const s = await almacen('config');
  return (await s.get('general')) || { fechasOcupadas: ['2026-10-24', '2026-10-31'], pausaHorasArturo: 12, activo: true };
}
export async function guardarConfig(c) { const s = await almacen('config'); await s.set('general', c); }

export function nuevoCliente(tel, nombre) {
  return {
    telefono: tel, nombre: nombre || '', marca: 'bny', datos: {}, etapa: 'nuevo', temperatura: 'tibio',
    historial: [], creado: Date.now(), ultimoCliente: 0, ultimoAgente: 0, ultimoArturo: 0,
    pausadoHasta: 0, seguimientos: [], escalado: null, resumen: '', sincronizado: false, cambios: 0,
  };
}
