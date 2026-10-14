// Webhook de YCloud: https://<sitio>.netlify.app/webhook/whatsapp?k=<CLAVE_WEBHOOK>
import { entrante, deArturo } from '../../lib/agente.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  if (req.method === 'GET') return new Response('Agente BNY activo', { status: 200 });
  if (!process.env.CLAVE_WEBHOOK || url.searchParams.get('k') !== process.env.CLAVE_WEBHOOK) return new Response('no autorizado', { status: 401 });
  let ev; try { ev = await req.json(); } catch { return new Response('json inválido', { status: 400 }); }
  const trabajo = (async () => {
    try {
      if (ev.type === 'whatsapp.inbound_message.received' && ev.whatsappInboundMessage) return await entrante(ev.whatsappInboundMessage);
      if (ev.type === 'whatsapp.smb.message.created' && ev.whatsappMessage) return await deArturo(ev.whatsappMessage);
      return 'ignorado';
    } catch (e) { console.error('agente:', e); return 'error'; }
  })();
  // Contesta a YCloud de inmediato y termina el trabajo en segundo plano.
  if (context && typeof context.waitUntil === 'function') { context.waitUntil(trabajo); return new Response('ok', { status: 200 }); }
  const r = await trabajo; return new Response(String(r), { status: 200 });
};

export const config = { path: '/webhook/whatsapp' };
