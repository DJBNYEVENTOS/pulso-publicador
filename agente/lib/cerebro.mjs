// El cerebro del agente: Claude decide la respuesta y, al mismo tiempo, actualiza la ficha del cliente.
import { CONOCIMIENTO } from './conocimiento.mjs';

const MODELO = () => process.env.MODELO || 'claude-haiku-4-5-20251001';

const HERRAMIENTA = {
  name: 'responder',
  description: 'Envía la respuesta al cliente por WhatsApp y actualiza su ficha.',
  input_schema: {
    type: 'object',
    properties: {
      mensajes: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 2, description: 'Uno o dos mensajes de WhatsApp (máx. 4 renglones cada uno). Vacío solo si no hay que contestar (p. ej. el cliente solo dijo "gracias" a una despedida).' },
      marca: { type: 'string', enum: ['bny', 'invitaciones', 'kotizo', 'varelia', 'otro'] },
      datos: {
        type: 'object', description: 'Lo que ya sabes del cliente (deja vacío lo que no sepas; no inventes).',
        properties: {
          nombre: { type: 'string' }, tipoEvento: { type: 'string' }, fecha: { type: 'string', description: 'AAAA-MM-DD si se sabe' },
          ciudad: { type: 'string' }, lugar: { type: 'string' }, tipoSede: { type: 'string' }, invitados: { type: 'string' }, horario: { type: 'string' },
          paquete: { type: 'string' }, extras: { type: 'string' }, total: { type: 'number', description: 'Total cotizado sin IVA, si ya lo diste' },
          presupuesto: { type: 'string' }, notas: { type: 'string' },
        },
      },
      etapa: { type: 'string', enum: ['nuevo', 'calificando', 'cotizado', 'negociando', 'listo-para-cerrar', 'escalado', 'perdido', 'cliente-actual', 'no-es-cliente'] },
      temperatura: { type: 'string', enum: ['frio', 'tibio', 'caliente'], description: 'caliente = tiene fecha e invitados y muestra intención de contratar pronto' },
      escalar: { type: 'boolean', description: 'true si Arturo debe intervenir (ver sección 9).' },
      motivo: { type: 'string', description: 'Por qué escalas (una frase).' },
      resumen: { type: 'string', description: 'Una línea para Arturo: tipo de evento, fecha, lugar, invitados, paquete de interés y total estimado.' },
    },
    required: ['mensajes', 'marca', 'datos', 'etapa', 'temperatura', 'escalar', 'resumen'],
  },
};

function ahoraMX() {
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'full', timeStyle: 'short' }).format(new Date());
}

export function sistema(cfg, cliente, modo) {
  const fichas = JSON.stringify({ nombre: cliente.nombre, marca: cliente.marca, etapa: cliente.etapa, datos: cliente.datos }, null, 0);
  const extra = modo === 'seguimiento'
    ? `\n\nTAREA ESPECIAL: el cliente dejó de responder. Escribe UN mensaje breve de seguimiento, cálido y sin presión, que retome justo donde se quedó la plática y termine con una pregunta fácil de contestar. No repitas el último mensaje. Si la conversación ya estaba cerrada (despedida, no le interesa, ya contrató), deja "mensajes" vacío.`
    : '';
  return [
    { type: 'text', text: `Eres el agente de ventas por WhatsApp de BNY Eventos (y sus marcas). Tu trabajo es que NINGÚN cliente se pierda: contesta siempre, con calidez, datos reales y una sola pregunta que avance la venta. Responde en español de México.\n\n${CONOCIMIENTO}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `CONTEXTO DE HOY\n- Fecha y hora en México: ${ahoraMX()}\n- FECHAS COMPROMETIDAS (no disponibles; escala si las piden): ${(cfg.fechasOcupadas || []).join(', ') || 'ninguna registrada'}\n- Ficha actual del cliente: ${fichas}\n- Siempre usa la herramienta "responder". Los mensajes del historial que empiezan con [Arturo] los escribió Arturo personalmente desde su celular: respeta lo que él dijo y no lo contradigas.\n- Si el cliente manda audio, explica con amabilidad que por ahora solo puedes leer texto y pídele que lo escriba (Arturo también lo escuchará).${extra}` },
  ];
}

export function historialParaClaude(historial) {
  const msgs = [];
  for (const m of historial.slice(-40)) {
    const role = m.r === 'cliente' ? 'user' : 'assistant';
    let content = m.r === 'arturo' ? `[Arturo] ${m.t}` : m.t;
    if (m.imagen && m.r === 'cliente') content = [{ type: 'image', source: { type: 'base64', media_type: m.imagen.tipo, data: m.imagen.datos } }, { type: 'text', text: m.t || '(foto sin texto)' }];
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === role) {
      const a = Array.isArray(prev.content) ? prev.content : [{ type: 'text', text: prev.content }];
      const b = Array.isArray(content) ? content : [{ type: 'text', text: content }];
      prev.content = [...a, ...b];
    } else msgs.push({ role, content });
  }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(inicio de conversación)' });
  if (msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: '(el cliente no ha respondido; sigue la TAREA ESPECIAL)' });
  return msgs;
}

export async function pensar(cfg, cliente, modo = 'respuesta') {
  if (process.env.AGENTE_PRUEBA === '1' && globalThis.__cerebroFalso) return globalThis.__cerebroFalso(cfg, cliente, modo);
  const cuerpo = {
    model: MODELO(), max_tokens: 900, temperature: 0.4,
    system: sistema(cfg, cliente, modo),
    tools: [HERRAMIENTA], tool_choice: { type: 'tool', name: 'responder' },
    messages: historialParaClaude(cliente.historial),
  };
  let ultimoError;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(cuerpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`Claude ${r.status}: ${JSON.stringify(d.error || d).slice(0, 300)}`);
      const uso = d.content.find(c => c.type === 'tool_use');
      if (!uso) throw new Error('Claude no usó la herramienta');
      return uso.input;
    } catch (e) { ultimoError = e; }
  }
  throw ultimoError;
}
