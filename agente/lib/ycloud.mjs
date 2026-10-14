// Envío de mensajes por YCloud (WhatsApp Cloud API con coexistencia: el mismo número sigue en la app).
const API = 'https://api.ycloud.com/v2';
const h = () => ({ 'Content-Type': 'application/json', 'X-API-Key': process.env.YCLOUD_API_KEY || '' });
export const NUMERO = () => process.env.WHATSAPP_NUMERO || '+527861628600';

async function post(ruta, cuerpo) {
  if (process.env.AGENTE_PRUEBA === '1') { (globalThis.__enviados ||= []).push({ ruta, cuerpo }); return { id: 'prueba-' + Date.now() }; }
  const r = await fetch(API + ruta, { method: 'POST', headers: h(), body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YCloud ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
  return d;
}

export async function enviarTexto(to, body) {
  return post('/whatsapp/messages/sendDirectly', { from: NUMERO(), to, type: 'text', text: { body, previewUrl: true } });
}

export async function enviarPlantilla(to, nombre, idioma, variables = []) {
  const template = { name: nombre, language: { code: idioma || 'es_MX' } };
  if (variables.length) template.components = [{ type: 'body', parameters: variables.map(t => ({ type: 'text', text: String(t) })) }];
  return post('/whatsapp/messages/sendDirectly', { from: NUMERO(), to, type: 'template', template });
}

export async function escribiendo(idMensaje) {
  try { await post(`/whatsapp/inboundMessages/${idMensaje}/typingIndicator`, {}); } catch { /* opcional */ }
}

export async function descargar(link) {
  if (process.env.AGENTE_PRUEBA === '1') return null;
  const r = await fetch(link, { headers: { 'X-API-Key': process.env.YCLOUD_API_KEY || '' } });
  if (!r.ok) return null;
  return { tipo: r.headers.get('content-type') || 'image/jpeg', datos: Buffer.from(await r.arrayBuffer()).toString('base64') };
}
