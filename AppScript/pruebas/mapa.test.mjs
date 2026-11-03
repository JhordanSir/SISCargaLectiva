/* El mapa interactivo de la GUI (docs/arquitectura/mapa-gui.html) dice qué función del
   navegador y qué entrada del servidor actúan con cada botón. Estas pruebas comprueban que
   todo lo que nombra existe en el código y que ningún botón de la aplicación falta en él. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, REPO, archivosApp } from "./soporte.mjs";

const html = fs.readFileSync(path.join(REPO, "docs/arquitectura/mapa-gui.html"), "utf8");
const DATOS = JSON.parse(html.match(/<script type="application\/json" id="datos-mapa">([\s\S]*?)<\/script>/)[1]);
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const define = (texto, nombre) => new RegExp("function\\s+" + nombre.replace(/\$/g, "\\$") + "\\s*\\(").test(texto);
const GENERADOS = ["base/Estilos.html", "base/Iconos.html", "base/Alpine.html"];
const VISTAS = archivosApp(".html").filter(f => !GENERADOS.includes(f));
/* Las pantallas de la hoja del sistema (menú y diálogos de hoja/) no usan data-accion ni enlazarAcciones. */
const conBoton = DATOS.pantallas.filter(p => !p.automatica && !p.sinMapa);

test("cada función del navegador que nombra el mapa existe en su archivo", () => {
  const faltan = [];
  for (const p of DATOS.pantallas) for (const a of p.acciones) for (const paso of a.pasos)
    if (!define(leer(paso.archivo), paso.funcion)) faltan.push(p.id + "/" + a.accion + ": " + paso.funcion + " en " + paso.archivo);
  assert.deepEqual(faltan, []);
});

/* Un botón se enlaza de dos maneras: data-accion="x" y el mapa de enlazarAcciones de su
   pantalla, o un evento de Alpine (@click="x(…)", @submit.prevent="x(…)") que llama a la
   función x. Las acciones de Alpine llevan "alpine": true en el mapa. */
const eventoAlpine = accion => new RegExp('@(click|submit)(\\.[a-z]+)*="' + accion + "\\(");

test("cada botón del mapa está en su vista y en el mapa de acciones de su pantalla", () => {
  const faltan = [];
  for (const p of conBoton) {
    const vista = p.vista.map(leer).join("\n");
    const texto = leer(p.mapa);
    const conMapa = p.acciones.filter(a => !a.alpine);
    for (const a of p.acciones.filter(a => a.alpine)) {
      if (!eventoAlpine(a.accion).test(vista)) faltan.push(p.id + ": ningún @click/@submit llama a " + a.accion + " en " + p.vista.join(", "));
      if (!define(texto, a.accion)) faltan.push(p.id + ": " + a.accion + " no está en " + p.mapa);
    }
    if (!conMapa.length) continue;
    const inicio = texto.indexOf('enlazarAcciones($("' + p.contenedor + '")');
    if (inicio < 0) { faltan.push(p.id + ": no hay enlazarAcciones para " + p.contenedor + " en " + p.mapa); continue; }
    const bloque = texto.slice(inicio, texto.indexOf("}));", inicio));
    for (const a of conMapa) {
      if (!vista.includes('data-accion="' + a.accion + '"')) faltan.push(p.id + ": " + a.accion + " no está en " + p.vista.join(", "));
      if (!new RegExp("\\b" + a.accion + "\\b").test(bloque)) faltan.push(p.id + ": " + a.accion + " no está en el mapa de " + p.mapa);
    }
  }
  assert.deepEqual(faltan, []);
});

test("ningún botón de la aplicación falta en el mapa", () => {
  const faltan = [];
  /* Solo los atributos de los botones: ni los comentarios ni los selectores «[data-accion=…]». */
  const codigo = f => leer(f).split(/\r?\n/).filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  const enMapa = (f, accion, alpine) => conBoton.some(p => p.vista.includes(f) && p.acciones.some(a => a.accion === accion && !!a.alpine === alpine));
  for (const f of VISTAS) {
    for (const m of codigo(f).matchAll(/(?<!\[)data-accion="([A-Za-z]+)"/g)) if (!enMapa(f, m[1], false)) faltan.push(f + ": " + m[1]);
    for (const m of codigo(f).matchAll(/@(?:click|submit)(?:\.[a-z]+)*="([A-Za-z]+)\(/g)) if (!enMapa(f, m[1], true)) faltan.push(f + ": @" + m[1]);
  }
  assert.deepEqual([...new Set(faltan)], []);
});

test("las entradas del mapa son las funciones públicas del servidor, cada una en su archivo", () => {
  const publicas = archivosApp(".js")
    .flatMap(f => [...leer(f).matchAll(/^function\s+([A-Za-z]\w*)\s*\(/gm)].map(m => m[1]))
    .filter(n => !n.endsWith("_") && n !== "instalar").sort();
  assert.deepEqual(Object.keys(DATOS.entradas).sort(), publicas);
  const faltan = [];
  for (const [n, e] of Object.entries(DATOS.entradas)) {
    if (!define(leer(e.archivo), n)) faltan.push(n + " no está en " + e.archivo);
    for (const s of e.servicio) if (!define(leer(s.archivo), s.funcion)) faltan.push(n + ": " + s.funcion + " no está en " + s.archivo);
  }
  assert.deepEqual(faltan, []);
});

test("cada llamada del mapa es una entrada y el navegador la usa de verdad", () => {
  const navegador = VISTAS.map(leer).join("\n");
  const faltan = [];
  for (const p of DATOS.pantallas) for (const a of p.acciones) for (const n of a.llamadas) {
    /* Los disparadores y el menú de la hoja los llama Google Sheets, no una vista. */
    if (p.sinMapa && /^(on|menu)[A-Z]/.test(n)) { if (!DATOS.entradas[n]) faltan.push(p.id + "/" + a.accion + ": " + n + " no es una entrada del mapa"); continue; }
    if (!DATOS.entradas[n]) faltan.push(p.id + "/" + a.accion + ": " + n + " no es una entrada del mapa");
    else if (n !== "doGet" && !navegador.includes('"' + n + '"') && !navegador.includes("run." + n + "(")) faltan.push(n + " no se llama desde ninguna vista");
  }
  assert.deepEqual(faltan, []);
});

test("los pares vista ↔ servidor del mapa existen", () => {
  const faltan = [];
  for (const c of DATOS.carpetas) for (const par of c.pares)
    for (const f of par.vista.concat(par.servidor)) if (!fs.existsSync(path.join(RAIZ, f))) faltan.push(f);
  assert.deepEqual(faltan, []);
});

test("las líneas del mapa coinciden con el código (node AppScript/pruebas/actualizar-mapa.mjs las recalcula)", async () => {
  /* Cada botón, función, entrada y servicio del mapa lleva su archivo y su línea. Si el
     código cambió y el mapa no, esta prueba dice cuál quedó desfasado. */
  const { leerMapa, conLineas } = await import("./actualizar-mapa.mjs");
  const actual = leerMapa(), esperado = conLineas(actual);
  const plano = (D, ruta = "") => typeof D !== "object" || D === null ? [[ruta, D]]
    : Object.entries(D).flatMap(([k, v]) => plano(v, ruta ? ruta + "." + k : k));
  const a = new Map(plano(actual)), e = new Map(plano(esperado));
  const distintos = [...new Set([...a.keys(), ...e.keys()])].filter(k => /linea|marcado|enlace|desde|espera/.test(k) && a.get(k) !== e.get(k))
    .map(k => k + ": el mapa dice " + JSON.stringify(a.get(k)) + ", el código " + JSON.stringify(e.get(k)));
  assert.deepEqual(distintos.slice(0, 10), [], "Ejecuta: node AppScript/pruebas/actualizar-mapa.mjs");
});
