// Conecta de una vez todas tus páginas de Facebook y sus cuentas de Instagram.
// Usa META_APP_ID, META_APP_SECRET y META_USER_TOKEN (token del Explorador de la API Graph).
// Cambia el token por uno de larga duración, obtiene el token permanente de cada página,
// lo guarda cifrado en config/meta.enc y activa Facebook e Instagram en config/redes.json.
// Nunca imprime tokens: el registro de un repositorio público lo puede ver cualquiera.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cifrar, marcaDePagina } from './meta-boveda.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.assign({}, process.env, process.env.SECRETS_JSON ? JSON.parse(process.env.SECRETS_JSON) : {});
const GV = env.META_GRAPH_VERSION || 'v25.0';
for (const k of ['META_APP_ID', 'META_APP_SECRET', 'META_USER_TOKEN', 'PULSO_KEY']) {
  if (!env[k]) { console.error(`Falta el secreto ${k}. Agrégalo en Settings → Secrets and variables → Actions.`); process.exit(1); }
}

async function get(url) {
  const res = await fetch(url); const data = await res.json();
  if (!res.ok || data.error) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
  return data;
}

// 1. Token de usuario de larga duración (60 días). Los tokens de página que salen de él no caducan.
const largo = await get(`https://graph.facebook.com/${GV}/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.META_APP_ID}&client_secret=${env.META_APP_SECRET}&fb_exchange_token=${encodeURIComponent(env.META_USER_TOKEN)}`);

// 2. Páginas que administras, con su token y su Instagram profesional.
let url = `https://graph.facebook.com/${GV}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100&access_token=${largo.access_token}`;
const paginas = [];
while (url) { const d = await get(url); paginas.push(...(d.data || [])); url = d.paging && d.paging.next; }
if (!paginas.length) { console.error('No se encontró ninguna página. Al generar el token, selecciona tus páginas en la ventana de Facebook.'); process.exit(1); }

const boveda = { creado: new Date().toISOString(), marcas: {} };
const redes = JSON.parse(readFileSync(join(ROOT, 'config/redes.json'), 'utf8'));
for (const p of paginas) {
  const marca = marcaDePagina(p.name);
  const ig = p.instagram_business_account;
  console.log(`· Página "${p.name}" → ${marca || 'sin marca asignada'}${ig ? ` · Instagram @${ig.username}` : ' · sin Instagram profesional ligado'}`);
  if (!marca || boveda.marcas[marca]) continue;
  boveda.marcas[marca] = { pageId: p.id, pageName: p.name, token: p.access_token, igId: ig ? ig.id : null, igUser: ig ? ig.username : null };
  redes[marca] = Object.assign({}, redes[marca], { facebook: true, instagram: !!ig });
}
writeFileSync(join(ROOT, 'config/meta.enc'), cifrar(boveda, env.PULSO_KEY));
writeFileSync(join(ROOT, 'config/redes.json'), JSON.stringify(redes, null, 2));
const n = Object.keys(boveda.marcas).length;
console.log(`Listo: ${n} marca(s) conectada(s) a Facebook${Object.values(boveda.marcas).some(m => m.igId) ? ' e Instagram' : ''}.`);
