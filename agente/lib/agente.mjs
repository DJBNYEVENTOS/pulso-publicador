// Lógica del agente: recibe cada evento de WhatsApp, contesta, guarda la ficha y avisa a Arturo.
import { clientes, eventos, config, nuevoCliente } from './almacen.mjs';
import { pensar } from './cerebro.mjs';
import { enviarTexto, enviarPlantilla, escribiendo, descargar } from './ycloud.mjs';
import { avisar } from './avisos.mjs';

const H = 3.6e6;
const limpiar = (t) => String(t || '').replace(/\s+$/g, '');
const RESPALDO = 'Gracias por escribir a BNY Eventos ✨ En un momento te respondo con todo el detalle.';

function textoDe(m) {
  switch (m.type) {
    case 'text': return m.text?.body || '';
    case 'image': return m.image?.caption || '';
    case 'video': return '[El cliente mandó un video] ' + (m.video?.caption || '');
    case 'audio': return '[El cliente mandó un audio de voz]';
    case 'document': return '[El cliente mandó un documento] ' + (m.document?.filename || m.document?.caption || '');
    case 'sticker': return '[sticker]';
    case 'location': return `[Ubicación: ${m.location?.name || ''} ${m.location?.address || ''} (${m.location?.latitude},${m.location?.longitude})]`;
    case 'button': return m.button?.text || '';
    case 'interactive': return m.interactive?.button_reply?.title || m.interactive?.buttonReply?.title || m.interactive?.list_reply?.title || m.interactive?.listReply?.title || '[respuesta interactiva]';
    case 'reaction': return '';
    case 'contacts': return '[El cliente compartió un contacto]';
    case 'request_welcome': return '';
    default: return `[mensaje tipo ${m.type}]`;
  }
}

async function yaVisto(id) {
  if (!id) return false;
  const s = await eventos();
  if (await s.get(id)) return true;
  await s.set(id, { t: Date.now() });
  return false;
}

// Mensaje entrante del cliente.
export async function entrante(m) {
  if (m.groupId || m.group_id) return 'grupo';
  const tel = m.from;
  if (!tel || await yaVisto(m.wamid || m.id)) return 'duplicado';
  const cfg = await config();
  const s = await clientes();
  const c = (await s.get(tel)) || nuevoCliente(tel, m.customerProfile?.name || m.customer_profile?.name);
  const esNuevo = !c.historial.length;
  if (!c.nombre && m.customerProfile?.name) c.nombre = m.customerProfile.name;
  const t = textoDe(m);
  if (m.type === 'reaction' || (m.type === 'request_welcome' && !esNuevo)) return 'ignorado';
  const entrada = { r: 'cliente', t: t || (m.type === 'request_welcome' ? '(abrió el chat por primera vez)' : ''), ts: Date.now(), id: m.wamid || m.id };
  if (m.type === 'image' && m.image?.link) { const img = await descargar(m.image.link); if (img && img.datos.length < 4_500_000) entrada.imagen = img; }
  if (m.referral) entrada.t += `\n[Llegó desde un anuncio: ${m.referral.headline || m.referral.body || m.referral.sourceUrl || ''}]`;
  c.historial.push(entrada);
  c.ultimoCliente = Date.now(); c.sincronizado = false; c.seguimientos = [];
  await s.set(tel, c);

  if (esNuevo) await avisar(`Nuevo cliente: ${c.nombre || tel}`, t.slice(0, 200) || 'Abrió el chat', tel, 'default');
  if (!cfg.activo) return 'agente-apagado';
  if (c.pausadoHasta > Date.now()) return 'pausado-arturo-contestando';
  return responder(tel, entrada.id, m.id);
}

// Genera y manda la respuesta (también se usa para reintentar mensajes sin contestar).
export async function responder(tel, idEntrada, idYcloud) {
  const cfg = await config();
  const s = await clientes();
  let c = await s.get(tel);
  if (idYcloud) await escribiendo(idYcloud);
  let r;
  try { r = await pensar(cfg, c, 'respuesta'); }
  catch (e) {
    c = await s.get(tel);
    if (!c.respaldoEnviado || Date.now() - c.respaldoEnviado > 6 * H) {
      await enviarTexto(tel, RESPALDO).catch(() => {});
      c.historial.push({ r: 'agente', t: RESPALDO, ts: Date.now() }); c.respaldoEnviado = Date.now(); c.ultimoAgente = Date.now();
    }
    c.pendiente = true; await s.set(tel, c);
    await avisar('⚠️ El agente no pudo responder', `${c.nombre || tel}: ${String(e.message).slice(0, 160)}. Contesta tú o se reintenta solo.`, tel, 'urgent');
    return 'error-cerebro';
  }
  // Si mientras pensaba llegó otro mensaje del cliente, esta respuesta se descarta: la nueva contesta todo junto.
  c = await s.get(tel);
  const ultimo = [...c.historial].reverse().find(x => x.r === 'cliente');
  if (idEntrada && ultimo && ultimo.id !== idEntrada) return 'reemplazado-por-mensaje-nuevo';
  if (c.pausadoHasta > Date.now()) return 'arturo-tomo-la-conversacion';
  aplicar(c, r);
  for (const txt of (r.mensajes || []).map(limpiar).filter(Boolean)) {
    await enviarTexto(tel, txt);
    c.historial.push({ r: 'agente', t: txt, ts: Date.now() });
  }
  c.ultimoAgente = Date.now(); c.pendiente = false;
  c.historial.forEach((m, i) => { if (m.imagen && i < c.historial.length - 4) delete m.imagen; });
  if (c.historial.length > 200) c.historial = c.historial.slice(-200);
  await s.set(tel, c);
  await avisosDe(c, r);
  return 'respondido';
}

function aplicar(c, r) {
  const antes = { etapa: c.etapa, temperatura: c.temperatura };
  for (const [k, v] of Object.entries(r.datos || {})) if (v !== '' && v != null) c.datos[k] = v;
  if (r.datos?.nombre) c.nombre = r.datos.nombre;
  c.marca = r.marca || c.marca; c.etapa = r.etapa || c.etapa; c.temperatura = r.temperatura || c.temperatura;
  c.resumen = r.resumen || c.resumen; c.sincronizado = false; c.cambios = (c.cambios || 0) + 1;
  c._antes = antes;
}

async function avisosDe(c, r) {
  const a = c._antes || {}; delete c._antes;
  const tel = c.telefono, quien = c.nombre || tel;
  if (r.escalar && (!c.escalado || Date.now() - c.escalado.ts > 6 * H || c.escalado.motivo !== r.motivo)) {
    c.escalado = { motivo: r.motivo || '', ts: Date.now() };
    const s = await clientes(); await s.set(tel, c);
    await avisar(`🔔 Atiende a ${quien}`, `${r.motivo || 'Necesita a Arturo'}\n${c.resumen || ''}`, tel, 'urgent');
  } else if (c.temperatura === 'caliente' && a.temperatura !== 'caliente') {
    await avisar(`🔥 Cliente caliente: ${quien}`, c.resumen || '', tel, 'high');
  }
}

// Mensaje que Arturo mandó desde la app de WhatsApp Business (coexistencia): el agente se hace a un lado.
export async function deArturo(m) {
  const tel = m.to;
  if (!tel || await yaVisto(m.wamid || m.id)) return 'duplicado';
  const cfg = await config();
  const s = await clientes();
  const c = (await s.get(tel)) || nuevoCliente(tel, m.customerProfile?.name);
  const t = m.type === 'text' ? m.text?.body : `[Arturo mandó ${m.type}]`;
  c.historial.push({ r: 'arturo', t, ts: Date.now() });
  c.ultimoArturo = Date.now();
  c.pausadoHasta = Date.now() + (cfg.pausaHorasArturo || 12) * H;
  c.sincronizado = false;
  await s.set(tel, c);
  return 'pausado';
}

// Corre cada hora: reintenta lo que quedó sin contestar y da seguimiento a quien dejó de responder.
export async function seguimiento() {
  const cfg = await config();
  if (!cfg.activo) return { estado: 'agente-apagado' };
  const s = await clientes();
  const horaMX = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }).format(new Date()));
  const horario = horaMX >= 9 && horaMX < 21;
  const res = { reintentos: 0, seguimientos: 0, plantillas: 0 };
  for (const tel of await s.list()) {
    let c = await s.get(tel);
    if (!c || c.pausadoHasta > Date.now()) continue;
    const ultimo = c.historial[c.historial.length - 1];
    if (!ultimo) continue;
    // 1) Mensaje del cliente sin respuesta (error o caída): reintentar.
    if (ultimo.r === 'cliente' && Date.now() - ultimo.ts > 3 * 60e3 && Date.now() - ultimo.ts < 6 * H) {
      const r = await responder(tel, ultimo.id); if (r === 'respondido') res.reintentos++; continue;
    }
    if (ultimo.r === 'cliente' || !horario) continue;
    if (['perdido', 'cliente-actual', 'no-es-cliente', 'escalado'].includes(c.etapa)) continue;
    const desdeCliente = Date.now() - c.ultimoCliente, desdeAgente = Date.now() - c.ultimoAgente;
    const nSeg = (c.seguimientos || []).length;
    // 2) Ventana de 24 h abierta: un recordatorio amable (gratis) a las 3 h sin respuesta.
    if (desdeCliente < 22 * H && desdeAgente > 3 * H && nSeg === 0) {
      try {
        const r = await pensar(cfg, c, 'seguimiento');
        const txt = (r.mensajes || []).map(limpiar).filter(Boolean)[0];
        if (txt) { await enviarTexto(tel, txt); c.historial.push({ r: 'agente', t: txt, ts: Date.now(), seguimiento: true }); res.seguimientos++; }
        c.seguimientos = [...(c.seguimientos || []), Date.now()]; c.ultimoAgente = Date.now(); await s.set(tel, c);
      } catch { /* se intenta en la siguiente vuelta */ }
      continue;
    }
    // 3) Ventana cerrada: plantilla aprobada por Meta (día 2 y día 6), solo si ya hay plantilla configurada.
    const plantilla = process.env.PLANTILLA_SEGUIMIENTO;
    if (plantilla && desdeCliente >= 24 * H && ['calificando', 'cotizado', 'negociando', 'listo-para-cerrar'].includes(c.etapa)) {
      const toca = (nSeg <= 1 && desdeCliente >= 44 * H) || (nSeg === 2 && desdeCliente >= 6 * 24 * H);
      if (toca && nSeg < 3) {
        try {
          await enviarPlantilla(tel, plantilla, process.env.PLANTILLA_IDIOMA || 'es_MX', [c.nombre?.split(' ')[0] || 'hola']);
          c.historial.push({ r: 'agente', t: `[plantilla ${plantilla}]`, ts: Date.now(), seguimiento: true });
          c.seguimientos = [...(c.seguimientos || []), Date.now()]; c.ultimoAgente = Date.now(); await s.set(tel, c); res.plantillas++;
        } catch (e) { await avisar('Plantilla de seguimiento falló', String(e.message).slice(0, 150), tel, 'default'); }
      }
    }
  }
  return res;
}
