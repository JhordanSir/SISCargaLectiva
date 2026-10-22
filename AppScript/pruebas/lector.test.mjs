import test from "node:test";
import assert from "node:assert/strict";
import { cargar, partesXlsx, plano, ofertaPatron, XLSX_CARRERA, XLSX_DEPARTAMENTO } from "./soporte.mjs";

const ctx = cargar(["Dominio.js", "LectorXlsx.js", "OfertaXlsx.js"]);
const libroCarrera = ctx.leerLibroXlsx_(partesXlsx(XLSX_CARRERA));
const libroDepartamento = ctx.leerLibroXlsx_(partesXlsx(XLSX_DEPARTAMENTO));

test("lee las ocho hojas del libro por carrera", () => {
  assert.deepEqual(plano(libroCarrera.map(h => h.nombre)), [
    "Adm. Neg. Int.", "Derecho", "Ing. Software", "Ing. Comercial",
    "Cs. de la Comunicación", "Psicología", "Arquitectura", "Ing. Industrial"
  ]);
});

test("muestra las celdas como Excel: sin «.0» y las fechas d-m como «1-1»", () => {
  const ing = libroCarrera[2].filas;
  assert.equal(ing[0][4], "CARGA LECTIVA 2026-I");
  assert.deepEqual(plano(ing[3].slice(0, 8)),
    ["ING", "2024", "1-1", "3.1.1.24", "Introducción a la Programación", "2", "4", "6"]);
  assert.equal(libroCarrera[1].filas[3][2], "1-1");
});

test("lee igual si las partes del zip llegan sin carpetas", () => {
  const sinCarpetas = Object.fromEntries(Object.entries(partesXlsx(XLSX_CARRERA)).map(([k, v]) => [k.split("/").pop(), v]));
  assert.deepEqual(plano(ctx.leerLibroXlsx_(sinCarpetas)), plano(libroCarrera));
});

test("da formato a fechas seriales con códigos de Excel", () => {
  assert.equal(ctx.xlsxFormatearFecha_(45658, "d-m"), "1-1");
  assert.equal(ctx.xlsxFormatearFecha_(45689, "d\\-m"), "1-2");
  assert.equal(ctx.xlsxFormatearFecha_(46052, "D/M/YYYY"), "30/1/2026");
  assert.equal(ctx.xlsxFormatearFecha_(45658.5, "dd/mm/yyyy hh:mm"), "01/01/2025 12:00");
  assert.equal(ctx.xlsxEsFecha_("General"), false);
  assert.equal(ctx.xlsxEsFecha_("0.00"), false);
  assert.equal(ctx.xlsxEsFecha_('[$-409]d\\-mmm'), true);
});

/* datos/oferta-ejemplo.js se extrajo a mano de los mismos Excel. Su extracción no leyó la
   columna «OBSERVACIÓN» (en singular) de las hojas de Arquitectura e Ingeniería
   Industrial; el lector sí la lee, y estos son los valores que trae el Excel. */
const OBSERVACIONES_OMITIDAS = {
  "16.3.1.24": "FUSIÓN CON IND-3",
  "17.1.1.24": "FUSIÓN ARQ-1/IND-1",
  "17.1.2.24": "FUSIÓN ARQ-1/IND-1",
  "17.1.3.24": "FUSIÓN ARQ-1/IND-1",
  "17.3.1.24": "FUSIÓN CON ARQ-3"
};

test("los Excel reales dan la misma oferta que datos/oferta-ejemplo.js", () => {
  const { oferta } = plano(ctx.ofertaDesdeLibros_(libroCarrera, libroDepartamento));
  const patron = ofertaPatron();
  assert.deepEqual(Object.keys(oferta).sort(), Object.keys(patron).sort());

  let asignaturas = 0, grupos = 0;
  for (const sig of Object.keys(patron)) {
    const leidas = new Map(oferta[sig].map(a => [a.codigo, a]));
    assert.equal(oferta[sig].length, patron[sig].length, sig + ": número de asignaturas");
    for (const esperada of patron[sig]) {
      const a = leidas.get(esperada.codigo);
      assert.ok(a, sig + ": falta " + esperada.codigo);
      const donde = sig + " " + esperada.codigo;
      assert.equal(a.sem, esperada.sem, donde + ": semestre");
      assert.equal(a.malla, String(esperada.malla), donde + ": malla");
      assert.equal(a.nombre, esperada.nombre, donde + ": nombre");
      assert.equal(a.dpto, esperada.dpto, donde + ": dpto");
      assert.equal(a.obs, OBSERVACIONES_OMITIDAS[a.codigo] || esperada.obs, donde + ": observaciones");
      assert.deepEqual(a.grupos.map(g => [Number(g.n), Number(g.ht), Number(g.hp)]),
                       esperada.grupos.map(g => [g.n, g.ht, g.hp]), donde + ": grupos");
      asignaturas++; grupos += a.grupos.length;
    }
  }
  assert.equal(asignaturas, 345);
  assert.equal(grupos, 365);
});

test("las marcas de CONDICIÓN solo rellenan observaciones vacías", () => {
  const { oferta } = plano(ctx.ofertaDesdeLibros_(libroCarrera, libroDepartamento));
  const ing = new Map(oferta.ING.map(a => [a.codigo, a]));
  assert.equal(ing.get("3.4.1.24").obs, "INTERNACIONAL - MÉXICO");
  const com = new Map(oferta.COM.map(a => [a.codigo, a]));
  assert.equal(com.get("8.7.7.22").obs, "INTERNACIONAL MÉXICO - VIRTUAL");
  const sinDepartamento = plano(ctx.ofertaDesdeLibros_(libroCarrera, null)).oferta;
  assert.equal(new Map(sinDepartamento.ING.map(a => [a.codigo, a])).get("3.4.1.24").obs, "");
});

test("avisa de la fila que repite código y grupo", () => {
  const { avisos } = plano(ctx.ofertaDesdeLibros_(libroCarrera, libroDepartamento));
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, "FILA_REPETIDA");
  assert.match(avisos[0].texto, /Psicología.*9\.2\.5\.24.*grupo 1/);
});
