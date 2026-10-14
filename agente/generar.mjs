// Convierte conocimiento.md en un módulo para las funciones (se corre en cada despliegue de Netlify).
import { readFileSync, writeFileSync } from 'node:fs';
const md = readFileSync(new URL('./conocimiento.md', import.meta.url), 'utf8');
writeFileSync(new URL('./lib/conocimiento.mjs', import.meta.url), `// Generado desde conocimiento.md: no editar a mano.\nexport const CONOCIMIENTO = ${JSON.stringify(md)};\n`);
console.log('conocimiento.mjs listo:', md.length, 'caracteres');
