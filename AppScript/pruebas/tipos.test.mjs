/* P3.3: cada archivo del servidor se comprueba con tsc (// @ts-check; npm run tipos en
   AppScript/) y cada función del servidor documenta sus parámetros y lo que devuelve. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, archivosApp } from "./soporte.mjs";

const ARCHIVOS = archivosApp(".js");

test("todos los .js empiezan con // @ts-check", () => {
  for (const f of ARCHIVOS)
    assert.match(fs.readFileSync(path.join(RAIZ, f), "utf8"), /^\/\/ @ts-check\r?\n/, f);
});

test("cada función del servidor tiene JSDoc con @param de cada parámetro y @returns", () => {
  const faltan = [];
  for (const f of ARCHIVOS) {
    const lineas = fs.readFileSync(path.join(RAIZ, f), "utf8").split(/\r?\n/);
    lineas.forEach((l, i) => {
      /* Funciones de primer nivel y, en los archivos de Dominio, las de cada fábrica. */
      const m = l.match(/^( {0,2})(?:async )?function ([A-Za-z_$][\w$]*)\(([^)]*)\)/);
      if (!m) return;
      const [, , nombre, params] = m;
      let j = i - 1;
      if (!/\*\/\s*$/.test(lineas[j] || "")) return faltan.push(f + ": " + nombre + " (sin JSDoc)");
      while (j > 0 && !/^\s*\/\*/.test(lineas[j])) j--;
      if (!/^\s*\/\*\*/.test(lineas[j])) return faltan.push(f + ": " + nombre + " (comentario sin /**)");
      const doc = lineas.slice(j, i).join("\n");
      if (!/@returns?\b/.test(doc)) faltan.push(f + ": " + nombre + " (sin @returns)");
      const documentados = parametrosDocumentados(doc);
      params.split(",").map(p => p.trim().replace(/=.*$/, "").trim()).filter(p => /^[A-Za-z_$][\w$]*$/.test(p)).forEach(p => {
        if (!documentados.includes(p)) faltan.push(f + ": " + nombre + " (sin @param " + p + ")");
      });
    });
  }
  assert.deepEqual(faltan, []);
});

/* Nombres de los @param de un bloque JSDoc; el tipo puede llevar llaves anidadas. */
function parametrosDocumentados(doc) {
  const nombres = [];
  for (const m of doc.matchAll(/@param\s+\{/g)) {
    let i = m.index + m[0].length, nivel = 1;
    while (i < doc.length && nivel) { if (doc[i] === "{") nivel++; else if (doc[i] === "}") nivel--; i++; }
    const n = doc.slice(i).match(/^\s+\[?([A-Za-z_$][\w$]*)/);
    if (n) nombres.push(n[1]);
  }
  return nombres;
}

test("base/Tipos.js solo tiene comentarios: en Apps Script no ejecuta nada", () => {
  const sinComentarios = fs.readFileSync(path.join(RAIZ, "base/Tipos.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim();
  assert.equal(sinComentarios, "");
});

test("clasp no sube las herramientas de tipos", () => {
  const ignorados = fs.readFileSync(path.join(RAIZ, ".claspignore"), "utf8").split(/\r?\n/);
  for (const f of ["package.json", "package-lock.json", "jsconfig.json", "**/*.d.ts"]) assert.ok(ignorados.includes(f), f);
});
