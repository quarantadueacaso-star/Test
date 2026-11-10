// Unisce src/index.html, vendor/three.min.js e src/game.js in un solo file: index.html
// Uso: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const inline = (html, tag, code) => {
  if (!html.includes(tag)) throw new Error(`Tag non trovato in src/index.html: ${tag}`);
  if (/<\/script/i.test(code)) throw new Error(`Il codice da incorporare contiene "</script": ${tag}`);
  return html.replace(tag, () => `<script>\n${code}\n</script>`);
};

let html = read('./src/index.html');
html = inline(html, '<script src="../vendor/three.min.js"></script>', read('./vendor/three.min.js').trim());
html = inline(html, '<script src="game.js"></script>', read('./src/game.js').trim());

writeFileSync(new URL('./index.html', import.meta.url), html);
console.log(`index.html creato (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
