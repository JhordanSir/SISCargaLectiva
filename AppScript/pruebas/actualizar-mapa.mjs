/* Pone en el mapa de la GUI (docs/arquitectura/mapa-gui.html) la línea de código de cada
   cosa que nombra, leyéndola del código:
     acción.marcado   dónde está el botón (data-accion="x", o @click/@submit de Alpine);
     acción.enlace    la línea de enlazarAcciones que lo une con su función;
     paso.linea       dónde se define cada función del navegador;
     entrada.linea    dónde se define la entrada del servidor;
     entrada.desde    las líneas de las vistas que la llaman: llamar…("x") o pedir("x") en la
                      hoja, el nombre que una pantalla pasa a una ayuda de base/ (servidor: "x")
                      o google.script.run.x();
     entrada.espera   las líneas del marcado que muestran, con Alpine, que se espera su
                      respuesta ($store.servidor.ocupado('x'));
     servicio.linea   dónde se define cada función de servicio.
   Las líneas se escriben a mano en ningún sitio: tras cambiar el código, se vuelve a
   ejecutar esto. mapa.test.mjs falla si alguna quedó desfasada.

     node AppScript/pruebas/actualizar-mapa.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RAIZ, REPO } from "./soporte.mjs";

export const RUTA_MAPA = path.join(REPO, "docs/arquitectura/mapa-gui.html");
const BLOQUE = /(<script type="application\/json" id="datos-mapa">\n)([\s\S]*?)(<\/script>)/;

/* Cada archivo, por líneas y sin comentarios: lo comentado se vuelve espacios para que no
   cambie ningún número de línea. «//» solo cuenta como comentario tras un espacio o al
   principio, así no se confunde con «https://». */
const lineas = new Map();
const blanco = m => m.replace(/[^\n]/g, " ");
const lineasDe = f => {
  if (!lineas.has(f)) lineas.set(f, fs.readFileSync(path.join(RAIZ, f), "utf8")
    .replace(/<!--[\s\S]*?-->/g, blanco).replace(/\/\*[\s\S]*?\*\//g, blanco).replace(/(^|\s)\/\/.*$/gm, blanco)
    .split("\n"));
  return lineas.get(f);
};
/* Línea (1…n) de la primera coincidencia fuera de los comentarios. */
function buscar(archivo, regex) {
  const ls = lineasDe(archivo);
  for (let i = 0; i < ls.length; i++) if (regex.test(ls[i])) return i + 1;
  return null;
}
/* Todas las líneas de las vistas que cumplen la expresión. */
const todas = (vistas, regex) => vistas.flatMap(f => lineasDe(f).flatMap((l, i) => regex.test(l) ? [{ archivo: f, linea: i + 1 }] : []));
const esc = s => s.replace(/[$.*+?()[\]{}|\\]/g, "\\$&");
const definicion = (archivo, n) =>
  buscar(archivo, new RegExp("^\\s*\\(?\\s*(?:async\\s+)?function\\s+" + esc(n) + "\\s*\\(|^\\s*(?:const|let|var)\\s+" + esc(n) + "\\s*="));
const obligatoria = (linea, que) => { if (!linea) throw new Error("No se encontró " + que + "."); return linea; };

/** Lee los datos del mapa tal como están en el HTML. */
export function leerMapa() {
  return JSON.parse(fs.readFileSync(RUTA_MAPA, "utf8").match(BLOQUE)[2]);
}

/** Devuelve una copia de los datos con todas las líneas calculadas desde el código. */
export function conLineas(datos) {
  const D = JSON.parse(JSON.stringify(datos));
  lineas.clear();
  const vistas = fs.readdirSync(RAIZ, { recursive: true }).map(String)
    .filter(f => f.endsWith(".html") && !/^(pruebas|estilos|node_modules)\//.test(f) && !/(Alpine|Estilos|Iconos)\.html$/.test(f)).sort();
  for (const [n, e] of Object.entries(D.entradas)) {
    e.linea = obligatoria(definicion(e.archivo, n), "la entrada " + n + " en " + e.archivo);
    e.servicio.forEach(s => { s.linea = obligatoria(definicion(s.archivo, s.funcion), s.funcion + " en " + s.archivo); });
    const q = "[\"']" + esc(n) + "[\"']";
    /* llamar("x"…), (fondo ? llamarDeFondo : llamar)("x"…), pedir("x"…) en los diálogos de la
       hoja, servidor: "x" (lo que se pasa a una ayuda de base/) y google.script.run.x(…). */
    const desde = todas(vistas, new RegExp("(?:llamar(?:DeFondo|EnSilencio)?|pedir|\\))\\(\\s*" + q + "|\\b\\w+\\s*:\\s*" + q + "|\\.\\s*" + esc(n) + "\\s*\\("));
    const espera = todas(vistas, new RegExp("ocupado\\(\\s*" + q + "\\s*\\)"));
    delete e.desde; delete e.espera;
    if (desde.length) e.desde = desde;
    if (espera.length) e.espera = espera;
  }
  for (const p of D.pantallas) for (const a of p.acciones) {
    a.pasos.forEach(s => { s.linea = obligatoria(definicion(s.archivo, s.funcion), s.funcion + " en " + s.archivo); });
    delete a.marcado; delete a.enlace;
    if (p.automatica || p.sinMapa) continue;
    const boton = a.alpine
      ? new RegExp("@(click|submit)(\\.[a-z]+)*=\"" + esc(a.accion) + "\\(")
      : new RegExp("data-accion=\"" + esc(a.accion) + "\"");
    for (const v of p.vista) { const l = buscar(v, boton); if (l) { a.marcado = { archivo: v, linea: l }; break; } }
    obligatoria(a.marcado, "el botón de " + a.accion + " en " + p.vista.join(", "));
    if (a.alpine) continue;
    const ls = lineasDe(p.mapa);
    const inicio = ls.findIndex(l => l.includes('enlazarAcciones($("' + p.contenedor + '")'));
    const clave = new RegExp("^\\s*" + esc(a.accion) + "\\s*(?:[:,]|\\/\\/|$)");
    for (let i = inicio + 1; i < ls.length && !/^\}\)\);/.test(ls[i]); i++) if (clave.test(ls[i])) { a.enlace = { archivo: p.mapa, linea: i + 1 }; break; }
    obligatoria(a.enlace, "la acción " + a.accion + " en el mapa de " + p.mapa);
  }
  return D;
}

/* Mismo formato que el bloque escrito a mano: un objeto por línea. */
const compacto = v => Array.isArray(v) ? "[" + v.map(compacto).join(", ") + "]"
  : v && typeof v === "object" ? "{ " + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + compacto(x)).join(", ") + " }"
  : JSON.stringify(v);
const conHijos = (o, hijo) => {
  const { [hijo]: hijos, ...resto } = o;
  return "    " + compacto(resto).slice(0, -2) + ", " + JSON.stringify(hijo) + ": [\n" + hijos.map(x => "      " + compacto(x)).join(",\n") + "\n    ] }";
};
export function serializar(D) {
  return "{\n" +
    '  "capas": [\n' + D.capas.map(x => "    " + compacto(x)).join(",\n") + "\n  ],\n" +
    '  "carpetas": [\n' + D.carpetas.map(x => conHijos(x, "pares")).join(",\n") + "\n  ],\n" +
    '  "entradas": {\n' + Object.entries(D.entradas).map(([k, v]) => "    " + JSON.stringify(k) + ": " + compacto(v)).join(",\n") + "\n  },\n" +
    '  "pantallas": [\n' + D.pantallas.map(x => conHijos(x, "acciones")).join(",\n") + "\n  ]\n}\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = fs.readFileSync(RUTA_MAPA, "utf8");
  const nuevo = html.replace(BLOQUE, (m, a, b, c) => a + serializar(conLineas(leerMapa())) + c);
  fs.writeFileSync(RUTA_MAPA, nuevo);
  console.log(nuevo === html ? "El mapa ya tenía las líneas al día." : "Líneas del mapa actualizadas en " + path.relative(REPO, RUTA_MAPA) + ".");
}
