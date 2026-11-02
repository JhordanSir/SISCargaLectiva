/* P3.4: los íconos se escriben con icono_() en las plantillas e icono() en el navegador, y
   todo ícono que se usa está en el sprite (base/Iconos.html) y en la lista de
   estilos/iconos.mjs: uno que falte se dibujaría vacío. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, archivosApp } from "./soporte.mjs";

const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const GENERADOS = ["base/Estilos.html", "base/Iconos.html", "base/Alpine.html"];
const PANTALLAS = archivosApp(".html").filter(f => !GENERADOS.includes(f));

test("las pantallas no copian el SVG del ícono: usan icono_() o icono()", () => {
  for (const f of PANTALLAS) assert.doesNotMatch(leer(f), /<svg class="ico/, f);
});

test("todo ícono usado existe en base/Iconos.html y en estilos/iconos.mjs", () => {
  const sprite = new Set([...leer("base/Iconos.html").matchAll(/<symbol id="i-([a-z0-9-]+)"/g)].map(m => m[1]));
  const lista = leer("estilos/iconos.mjs").match(/const ICONOS = \[([\s\S]*?)\];/)[1];
  const ICONOS = new Set([...lista.matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]));
  const usados = new Set();
  for (const f of PANTALLAS.concat(archivosApp(".js"))) {
    const texto = leer(f);
    for (const m of texto.matchAll(/\bicono_?\(\s*"([a-z0-9-]+)"/g)) usados.add(m[1]);
    for (const m of texto.matchAll(/#i-([a-z0-9-]+)/g)) usados.add(m[1]);
  }
  assert.ok(usados.size > 30, "se encontraron " + usados.size + " íconos");
  const faltan = [...usados].filter(n => !sprite.has(n) || !ICONOS.has(n));
  assert.deepEqual(faltan, []);
});
