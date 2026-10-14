// Pruebas locales del agente con WhatsApp y Claude simulados: node prueba.mjs
process.env.AGENTE_PRUEBA = '1';
process.env.AGENTE_DATOS = '/tmp/agente-prueba-' + Date.now();
const { entrante, deArturo, seguimiento, responder } = await import('./lib/agente.mjs');
const { historialParaClaude, sistema } = await import('./lib/cerebro.mjs');
const { clientes } = await import('./lib/almacen.mjs');
let fallar = false, lento = 0, llamadas = 0;
globalThis.__cerebroFalso = async (cfg, c, modo) => {
  llamadas++;
  if (fallar) throw new Error('Claude caído');
  if (lento) await new Promise(r => setTimeout(r, lento));
  const ult = [...c.historial].reverse().find(m => m.r === 'cliente')?.t || '';
  if (modo === 'seguimiento') return { mensajes: ['¿Pudiste ver la propuesta? ¿Te la dejo lista para la fecha?'], marca: 'bny', datos: {}, etapa: c.etapa, temperatura: 'tibio', escalar: false, resumen: c.resumen };
  if (/apartar|contrato/i.test(ult)) return { mensajes: ['Perfecto, le pido a Arturo que te escriba hoy con el contrato ✨'], marca: 'bny', datos: {}, etapa: 'listo-para-cerrar', temperatura: 'caliente', escalar: true, motivo: 'Quiere apartar', resumen: 'Boda 120 inv. 14 nov Morelia, Elegance $22,000 + $3,500' };
  return { mensajes: ['¡Felicidades! ¿Para qué fecha lo planean?'], marca: 'bny', datos: { tipoEvento: 'Boda', nombre: 'Ana' }, etapa: 'calificando', temperatura: 'tibio', escalar: false, resumen: 'Boda' };
};
const ok = (c, msg) => { console.log((c ? '✔' : '✖') + ' ' + msg); if (!c) process.exitCode = 1; };
const msg = (id, from, body, extra = {}) => ({ id: 'y' + id, wamid: 'w' + id, from, to: '+527861628600', type: 'text', text: { body }, customerProfile: { name: 'Ana López' }, ...extra });
const T = '+5214431112222';

ok(await entrante(msg(1, T, 'Hola, me caso el próximo año')) === 'respondido', 'responde un mensaje nuevo');
ok(globalThis.__enviados.filter(e => e.cuerpo.type).at(-1).cuerpo.text.body.includes('fecha'), 'manda el texto por YCloud');
ok(globalThis.__avisos.some(a => a.titulo.startsWith('Nuevo cliente')), 'avisa a Arturo de un cliente nuevo');
ok(await entrante(msg(1, T, 'Hola, me caso el próximo año')) === 'duplicado', 'ignora el mismo mensaje repetido');
let c = await (await clientes()).get(T);
ok(c.datos.tipoEvento === 'Boda' && c.etapa === 'calificando', 'guarda la ficha (tipo de evento y etapa)');

// Dos mensajes seguidos: solo se contesta una vez, con los dos juntos.
lento = 300; const textos = () => globalThis.__enviados.filter(e => e.cuerpo && e.cuerpo.type).length; const n0 = textos();
const [a, b] = await Promise.all([entrante(msg(2, T, 'El 14 de noviembre')), new Promise(r => setTimeout(r, 50)).then(() => entrante(msg(3, T, 'En Morelia, 120 invitados')))]);
lento = 0;
ok(a === 'reemplazado-por-mensaje-nuevo' && b === 'respondido' && textos() === n0 + 1, 'ráfaga de mensajes: una sola respuesta');

// Cliente listo para cerrar: escala y avisa urgente.
await entrante(msg(4, T, 'Quiero apartar, mándame el contrato'));
ok(globalThis.__avisos.some(a => a.titulo.startsWith('🔔')), 'escala a Arturo cuando quiere apartar');

// Arturo contesta desde su celular: el agente se pausa.
ok(await deArturo({ id: 'e1', wamid: 'we1', from: '+527861628600', to: T, type: 'text', text: { body: 'Hola Ana, soy Arturo' } }) === 'pausado', 'detecta cuando Arturo contesta');
ok(await entrante(msg(5, T, 'Gracias Arturo')) === 'pausado-arturo-contestando', 'no se mete mientras Arturo atiende');

// Falla de Claude: manda respuesta de respaldo, avisa y luego reintenta.
const T2 = '+5214432223333'; fallar = true;
ok(await entrante(msg(6, T2, 'Precio de XV para 80')) === 'error-cerebro', 'si Claude falla, no se queda callado');
ok(globalThis.__enviados.filter(e => e.cuerpo.type).at(-1).cuerpo.text.body.startsWith('Gracias por escribir'), 'manda mensaje de respaldo');
fallar = false;
c = await (await clientes()).get(T2); c.historial.push({ r: 'cliente', t: 'Hola?', ts: Date.now() - 10 * 60e3, id: 'w7' }); await (await clientes()).set(T2, c);
const s1 = await seguimiento();
ok(s1.reintentos >= 1, 'el reintento automático contesta lo pendiente');

// Seguimiento: cliente que dejó de responder 3 h.
const T3 = '+5214433334444';
await entrante(msg(8, T3, 'Info de bautizo'));
c = await (await clientes()).get(T3); c.ultimoAgente -= 4 * 3.6e6; c.ultimoCliente -= 4 * 3.6e6; c.historial.forEach(m => m.ts -= 4 * 3.6e6); await (await clientes()).set(T3, c);
const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(new Date()));
const s2 = await seguimiento();
ok(hora < 9 || hora >= 21 ? s2.seguimientos === 0 : s2.seguimientos === 1, `seguimiento amable a las 3 h (solo de 9 a 21 h; ahora son las ${hora})`);

// Formato para Claude: roles alternados y mensajes de Arturo marcados.
const h = historialParaClaude((await (await clientes()).get(T)).historial);
ok(h[0].role === 'user' && h.every((m, i) => i === 0 || m.role !== h[i - 1].role), 'historial con roles alternados');
ok(JSON.stringify(h).includes('[Arturo]'), 'marca lo que escribió Arturo');
ok(sistema({ fechasOcupadas: ['2026-10-24'] }, c, 'respuesta')[1].text.includes('2026-10-24'), 'incluye las fechas comprometidas');
console.log('llamadas al cerebro:', llamadas);
