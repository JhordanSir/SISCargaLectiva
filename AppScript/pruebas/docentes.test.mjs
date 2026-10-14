/* CU-002 en el servidor sobre el libro (fase 2 del plan): balance del ciclo, consolidados
   por departamento y marcas de General que solo se editan desde la web (P124, P126). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar } from "./falsos.mjs";
import { XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";
const B = "fmaresg@ulasalle.edu.pe";
const CICLO = "2026-1";

function sembrado() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  [["SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", XLSX_CARRERA], ["SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", XLSX_DEPARTAMENTO],
   ["SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", XLSX_DOCENTES]]
    .forEach(([n, r]) => e.subir(e.propiedades.SIS_CARPETA_XLSX, n, fs.readFileSync(r)));
  ejecutar(e, A, "sembrarCiclo", CICLO);
  return e;
}

test("obtenerCargaDocente: balance del ciclo, grupos sin docente y consolidados por departamento", () => {
  const e = sembrado();
  const r = ejecutar(e, B, "obtenerCargaDocente", CICLO);
  assert.equal(r.docentes.length, 119, "todos los de General, también los que no tienen carga");
  assert.deepEqual(r.docentes.flatMap(d => d.advertencias.map(a => a.codigo + " " + d.nombre)), ["A09 TORRES CALCIN, HENRY LUIS"]);
  assert.deepEqual(Object.entries(r.pendientes).filter(([, p]) => p.grupos.length).map(([s, p]) => s + ":" + p.grupos.length), ["ADM:1", "IND:1"]);
  assert.deepEqual(Object.fromEntries(Object.entries(r.departamentos).map(([k, d]) => [k, d.cobertura])),
                   { DIMA: 99.5, DAHUC: 100, DACJ: 100, DACTE: 98.5 });
  assert.equal(r.reglas.A07.max, 40);
});

test("los umbrales se cambian con la propiedad SIS_REGLAS, sin tocar el código (RNF-11)", () => {
  const e = sembrado();
  e.propiedades.SIS_REGLAS = JSON.stringify({ A09: { max: 22 } });
  const r = ejecutar(e, B, "obtenerCargaDocente", CICLO);
  assert.equal(r.reglas.A09.max, 22);
  assert.ok(r.docentes.filter(d => d.advertencias.some(a => a.codigo === "A09")).length > 1);
});

test("marcarDocente: solo un Director, desde la web; la marca de tiempo completo en otra universidad activa A08 (P124)", () => {
  const e = sembrado();
  const coord = "coord@ulasalle.edu.pe";
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([[coord, "coordinador", "ING", ""]]);
  const antes = ejecutar(e, B, "obtenerCargaDocente", CICLO);
  const conDatos = antes.docentes.filter(d => d.ficha && !d.ficha.porCompletar && d.horas > 16)[0];
  assert.ok(conDatos, "hay un docente del catálogo con más de 16 h");
  assert.throws(() => ejecutar(e, coord, "marcarDocente", CICLO, conDatos.id, { tcOtraUniv: true }), /Solo un Director/);

  const m = ejecutar(e, B, "marcarDocente", CICLO, conDatos.id, { tcOtraUniv: true, cargo: "Coordinador de carrera" });
  assert.deepEqual([m.tcOtraUniv, m.cargo], [true, "Coordinador de carrera"]);
  const general = e.hoja("General 2026-I").filas();
  assert.ok(general.some(f => f[21] === conDatos.id && f[19] === "Sí" && f[20] === "Coordinador de carrera"));
  const despues = ejecutar(e, B, "obtenerCargaDocente", CICLO).docentes.find(d => d.id === conDatos.id);
  assert.ok(despues.advertencias.some(a => a.codigo === "A08" && a.bloquea));
  assert.ok(e.hoja("_SYS_BITACORA").filas().some(f => f[4] === "marca de docente"));
  assert.throws(() => ejecutar(e, B, "marcarDocente", CICLO, "N:NO EXISTE", { tcOtraUniv: true }), /No hay ningún docente/);
});
