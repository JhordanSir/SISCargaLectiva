/* P3.4: los íconos se escriben con icono_() en las plantillas e icono() en el navegador, y
   todo ícono que se usa está en el sprite (Iconos.html) y en la lista de estilos/iconos.mjs:
   uno que falte se dibujaría vacío. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./soporte.mjs";

const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const PANTALLAS = fs.readdirSync(RAIZ).filter(f => f.endsWith(".html") && !["Estilos.html", "Iconos.html"].includes(f));

test("las pantallas no copian el SVG del ícono: usan icono_() o icono()", () => {
  for (const f of PANTALLAS) assert.doesNotMatch(leer(f), /<svg class="ico/, f);
});

test("todo ícono usado existe en Iconos.html y en estilos/iconos.mjs", () => {
  const sprite = new Set([...leer("Iconos.html").matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1]));
  const lista = leer("estilos/iconos.mjs").match(/const ICONOS = \[([\s\S]*?)\];/)[1];
  const ICONOS = new Set([...lista.matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]));
  const usados = new Set();
  for (const f of fs.readdirSync(RAIZ).filter(f => /\.(html|js)$/.test(f) && f !== "Iconos.html" && f !== "Estilos.html")) {
    const texto = leer(f);
    for (const m of texto.matchAll(/\bicono_?\(\s*"([a-z0-9-]+)"/g)) usados.add(m[1]);
    for (const m of texto.matchAll(/#i-([a-z0-9-]+)/g)) usados.add(m[1]);
  }
  assert.ok(usados.size > 30, "se encontraron " + usados.size + " íconos");
  const faltan = [...usados].filter(n => !sprite.has(n) || !ICONOS.has(n));
  assert.deepEqual(faltan, []);
});
