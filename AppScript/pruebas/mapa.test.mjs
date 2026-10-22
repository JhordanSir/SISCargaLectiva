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
const GENERADOS = ["comun/Estilos.html", "comun/Iconos.html"];
const VISTAS = archivosApp(".html").filter(f => !GENERADOS.includes(f));
/* Las pantallas de la hoja del sistema (menú y diálogos de hoja/) no usan data-accion ni enlazarAcciones. */
const conBoton = DATOS.pantallas.filter(p => !p.automatica && !p.sinMapa);

test("cada función del navegador que nombra el mapa existe en su archivo", () => {
  const faltan = [];
  for (const p of DATOS.pantallas) for (const a of p.acciones) for (const paso of a.pasos)
    if (!define(leer(paso.archivo), paso.funcion)) faltan.push(p.id + "/" + a.accion + ": " + paso.funcion + " en " + paso.archivo);
  assert.deepEqual(faltan, []);
});

test("cada botón del mapa está en su vista y en el mapa de acciones de su pantalla", () => {
  const faltan = [];
  for (const p of conBoton) {
    const vista = p.vista.map(leer).join("\n");
    const texto = leer(p.mapa);
    const inicio = texto.indexOf('enlazarAcciones($("' + p.contenedor + '")');
    if (inicio < 0) { faltan.push(p.id + ": no hay enlazarAcciones para " + p.contenedor + " en " + p.mapa); continue; }
    const bloque = texto.slice(inicio, texto.indexOf("}));", inicio));
    for (const a of p.acciones) {
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
  for (const f of VISTAS) for (const m of codigo(f).matchAll(/(?<!\[)data-accion="([A-Za-z]+)"/g)) {
    const esta = conBoton.some(p => p.vista.includes(f) && p.acciones.some(a => a.accion === m[1]));
    if (!esta) faltan.push(f + ": " + m[1]);
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
