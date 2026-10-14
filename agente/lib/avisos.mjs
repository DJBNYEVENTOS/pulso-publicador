// Avisos instantáneos al celular de Arturo con ntfy (app gratuita): cliente caliente, escalamiento o error.
export async function avisar(titulo, mensaje, telefono, prioridad = 'high') {
  const tema = process.env.NTFY_TEMA;
  if (process.env.AGENTE_PRUEBA === '1') { (globalThis.__avisos ||= []).push({ titulo, mensaje, telefono }); return; }
  if (!tema) return;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(tema)}`, {
      method: 'POST',
      headers: {
        Title: encodeURIComponent(titulo).length > titulo.length ? `=?UTF-8?B?${Buffer.from(titulo).toString('base64')}?=` : titulo,
        Priority: prioridad, Tags: 'iphone',
        ...(telefono ? { Click: `https://wa.me/${String(telefono).replace(/\D/g, '')}` } : {}),
      },
      body: mensaje,
    });
  } catch { /* un aviso fallido no debe detener al agente */ }
}
