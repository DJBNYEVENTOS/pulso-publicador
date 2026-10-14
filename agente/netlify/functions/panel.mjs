// Puente privado con el Centro BNY (protegido con CLAVE_PUENTE). Todo por GET para que lo pueda usar
// una tarea programada que solo lee páginas:
//   /api/clientes?k=...                       → fichas nuevas o con cambios, en texto (una por línea)
//   /api/clientes?k=...&todos=1               → todas las fichas
//   /api/clientes?k=...&marcar=tel1,tel2      → marca fichas como ya copiadas al Centro BNY
//   /api/clientes?k=...&fechas=2026-10-24,... → actualiza las fechas comprometidas
//   /api/clientes?k=...&activo=0|1            → apaga o enciende al agente
//   /api/clientes?k=...&pausar=tel&horas=24   → el agente no contesta a ese cliente por N horas
//   &formato=json                             → respuesta en JSON en vez de texto
import { clientes, config as leerConfig, guardarConfig } from '../../lib/almacen.mjs';

const limpio = (t) => String(t ?? '').replace(/[|\n\r]+/g, ' ').trim();

export default async (req) => {
  const url = new URL(req.url), q = url.searchParams;
  if (!process.env.CLAVE_PUENTE || q.get('k') !== process.env.CLAVE_PUENTE) return new Response('no autorizado', { status: 401 });
  const s = await clientes();
  const cfg = await leerConfig();
  let cambioCfg = false;
  for (const tel of (q.get('marcar') || '').split(',').filter(Boolean)) { const c = await s.get(tel); if (c) { c.sincronizado = true; await s.set(tel, c); } }
  if (q.get('pausar')) { const c = await s.get(q.get('pausar')); if (c) { c.pausadoHasta = Date.now() + Number(q.get('horas') || 24) * 3.6e6; await s.set(c.telefono, c); } }
  if (q.get('fechas') != null) { cfg.fechasOcupadas = q.get('fechas').split(',').filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)); cambioCfg = true; }
  if (q.get('activo') != null) { cfg.activo = q.get('activo') === '1'; cambioCfg = true; }
  if (cambioCfg) await guardarConfig(cfg);

  const todos = q.get('todos') === '1';
  const lista = [];
  for (const tel of await s.list()) { const c = await s.get(tel); if (c && (todos || !c.sincronizado)) lista.push(c); }
  lista.sort((a, b) => (b.ultimoCliente || 0) - (a.ultimoCliente || 0));
  if (q.get('formato') === 'json') {
    return new Response(JSON.stringify({ config: cfg, clientes: lista.map(c => ({ ...c, historial: c.historial.slice(-20).map(({ imagen, ...m }) => m) })) }), { headers: { 'content-type': 'application/json' } });
  }
  const cab = 'telefono|nombre|marca|etapa|temperatura|tipoEvento|fecha|ciudad|lugar|invitados|horario|paquete|total|escalado|ultimoMensajeCliente|resumen|ultimosMensajes';
  const filas = lista.map(c => {
    const d = c.datos || {};
    const ult = c.historial.slice(-6).map(m => `${m.r}: ${m.t}`).join(' / ');
    return [c.telefono, c.nombre, c.marca, c.etapa, c.temperatura, d.tipoEvento, d.fecha, d.ciudad, d.lugar, d.invitados, d.horario, d.paquete, d.total,
      c.escalado ? c.escalado.motivo : '', c.ultimoCliente ? new Date(c.ultimoCliente).toISOString() : '', c.resumen, ult.slice(0, 600)].map(limpio).join('|');
  });
  const txt = `AGENTE BNY · activo=${cfg.activo} · fechasOcupadas=${(cfg.fechasOcupadas || []).join(',')} · fichas=${lista.length}\n${cab}\n${filas.join('\n')}\nFIN`;
  return new Response(txt, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

export const config = { path: '/api/clientes' };
