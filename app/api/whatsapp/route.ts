import { NextResponse } from 'next/server';
import { firmaWaValida, procesarAviso } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Meta revisa esta dirección una sola vez al conectar el aviso (webhook): responde el "challenge" si la palabra secreta coincide.
export function GET(req: Request) {
  const u = new URL(req.url), modo = u.searchParams.get('hub.mode'), clave = u.searchParams.get('hub.verify_token') || '', reto = u.searchParams.get('hub.challenge') || '';
  const esperada = process.env.WA_VERIFY_TOKEN || '';
  if (modo === 'subscribe' && esperada && clave === esperada) return new NextResponse(reto, { status: 200, headers: { 'content-type': 'text/plain' } });
  return new NextResponse('No autorizado', { status: 403 });
}

// Aviso de Meta: estados de entrega (enviado, entregado, leído, falló) y mensajes que mandan los invitados.
export async function POST(req: Request) {
  const cuerpo = await req.text();
  if (!firmaWaValida(cuerpo, req.headers.get('x-hub-signature-256') || '')) { console.warn('[whatsapp] firma no válida: revisa WA_APP_SECRET'); return NextResponse.json({ error: 'Firma no válida.' }, { status: 401 }); }
  let j: any = null; try { j = JSON.parse(cuerpo); } catch { return NextResponse.json({ error: 'Aviso no válido.' }, { status: 400 }); }
  await procesarAviso(j).catch(() => null);
  return NextResponse.json({ ok: true });
}
