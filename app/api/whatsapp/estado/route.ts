import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { diagnostico } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

// Diagnóstico del WhatsApp automático. Se abre en el navegador con la clave CRON_SECRET:
// /api/whatsapp/estado?clave=…&waba=<identificador de la cuenta de WhatsApp>[&suscribir=1]
export async function GET(req: Request) {
  const u = new URL(req.url), sec = process.env.CRON_SECRET || '', dada = u.searchParams.get('clave') || '';
  if (!sec || dada.length !== sec.length || !crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(sec))) return NextResponse.json({ error: 'No autorizado. Revisa la clave (CRON_SECRET).' }, { status: 401 });
  const r = await diagnostico(u.searchParams.get('waba') || '', u.searchParams.get('suscribir') === '1');
  return new NextResponse(JSON.stringify(r, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
