// Captura los ejemplos reales del catálogo de Invitaciones BNY (se ven como los recibe un invitado)
// para usarlos en la publicidad dentro de un celular. Corre dentro del render de GitHub, que sí tiene
// acceso a internet. Solo captura lo que falta: lista en config/capturas.json, salida en media/capturas/<id>/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function capturar(ROOT, browser) {
  const cfgPath = join(ROOT, 'config/capturas.json');
  if (!existsSync(cfgPath)) return;
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  for (const c of cfg.capturas || []) {
    const dir = join(ROOT, 'media/capturas', c.id);
    if (existsSync(join(dir, 'listo.json'))) continue;
    mkdirSync(dir, { recursive: true });
    const info = { url: c.url, fecha: new Date().toISOString(), archivos: [] };
    try {
      if (c.tipo === 'imagen') {
        const res = await fetch(c.url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const tipo = res.headers.get('content-type') || '';
        const ext = tipo.includes('png') ? 'png' : tipo.includes('svg') ? 'svg' : tipo.includes('webp') ? 'webp' : 'jpg';
        writeFileSync(join(dir, 'imagen.' + ext), Buffer.from(await res.arrayBuffer()));
        info.archivos.push('imagen.' + ext); info.tipo = tipo;
      } else {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-MX' });
        const page = await ctx.newPage();
        await page.goto(c.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
        await espera(2500);
        await page.screenshot({ path: join(dir, '01-inicio.jpg'), type: 'jpeg', quality: 92 });
        info.archivos.push('01-inicio.jpg');
        if (c.tocar !== false) {
          // Abre el sobre (toque en el centro) y guarda la animación cuadro por cuadro.
          await page.mouse.click(195, 470).catch(() => {});
          for (let i = 0; i < 24; i++) {
            const f = `abrir-${String(i).padStart(2, '0')}.jpg`;
            await page.screenshot({ path: join(dir, f), type: 'jpeg', quality: 88 });
            info.archivos.push(f);
            await espera(120);
          }
          await espera(2500);
          await page.screenshot({ path: join(dir, '02-abierta.jpg'), type: 'jpeg', quality: 92 });
          info.archivos.push('02-abierta.jpg');
        }
        // Recorre la página para activar animaciones al bajar, luego guarda vistas y la página completa.
        const alto = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 844);
        let n = 0;
        for (let y = 0; y < Math.min(alto, 14000); y += 700) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {});
          await espera(900);
          const f = `vista-${String(n++).padStart(2, '0')}.jpg`;
          await page.screenshot({ path: join(dir, f), type: 'jpeg', quality: 90 });
          info.archivos.push(f);
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await espera(800);
        await page.screenshot({ path: join(dir, 'completa.jpg'), type: 'jpeg', quality: 88, fullPage: true }).catch(() => {});
        info.archivos.push('completa.jpg'); info.alto = alto;
        await ctx.close();
      }
      writeFileSync(join(dir, 'listo.json'), JSON.stringify(info, null, 2));
      console.log('Captura', c.id, info.archivos.length, 'archivos');
    } catch (e) {
      console.log('Captura', c.id, 'falló:', e.message);
    }
  }
}
