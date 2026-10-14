// Cada hora: reintenta mensajes sin contestar y da seguimiento a clientes que dejaron de responder.
import { seguimiento } from '../../lib/agente.mjs';

export default async () => {
  const r = await seguimiento();
  console.log('seguimiento', JSON.stringify(r));
  return new Response(JSON.stringify(r), { status: 200 });
};

export const config = { schedule: '@hourly' };
