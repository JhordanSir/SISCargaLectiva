/* Contrato de respuestas (P3.1): todo endpoint responde {ok: true, datos} o
   {ok: false, codigo, mensaje, detalle}, con un código del catálogo de Respuesta.js. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar, ejecutarCrudo, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";
import { XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";      // coordinador de todas las carreras
const DIMA = DIRECTORES.DIMA;
const CICLO = "2026-1";

function sistema() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA));
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO));
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", fs.readFileSync(XLSX_DOCENTES));
  ejecutar(e, A, "obtenerTablero", CICLO);
  return e;
}

/* Cada endpoint con una cuenta y unos argumentos válidos, en un orden que tiene sentido. */
function llamadasValidas(e) {
  const ing = ejecutar(e, A, "obtenerPlan", CICLO, "ING");
  const grupoAdm = ejecutar(e, A, "obtenerPlan", CICLO, "ADM").asignaturas[0].grupos[0].id;
  return [
    [A, "obtenerTablero", CICLO],
    [A, "obtenerPlan", CICLO, "ING"],
    [A, "abrirEdicion", CICLO, "ING"],
    [A, "renovarBloqueo", CICLO, "ING"],
    [A, "guardarRecuperacion", CICLO, "plan:ING", { contenido: ing.asignaturas, versionBase: 1 }],
    [A, "descartarRecuperacion", CICLO, "plan:ING"],
    [A, "guardarPlan", CICLO, "ING", { asignaturas: ing.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 }],
    [A, "obtenerHistorial", CICLO, "ING"],
    [A, "restaurarVersion", CICLO, "ING", 1],
    [A, "liberarBloqueo", CICLO, "ING"],
    [A, "cambiarDepartamento", CICLO, "ADM", grupoAdm, "DACTE", "prueba"],
    [DIMA, "obtenerCargaDocente", CICLO, "ING"],
    [A, "obtenerDocentesPorGrupo", CICLO],
    [DIMA, "abrirEdicionCarga", CICLO, "ING"],
    [DIMA, "renovarBloqueoCarga", CICLO, "ING"],
    [DIMA, "guardarCarga", CICLO, "ING", { asignaciones: [], versionBase: 0 }],
    [DIMA, "obtenerHistorialCarga", CICLO, "ING"],
    [DIMA, "obtenerVersionCarga", CICLO, "ING", 1],
    [DIMA, "restaurarCarga", CICLO, "ING", 1],
    [DIMA, "liberarBloqueoCarga", CICLO, "ING"]
  ];
}

test("todos los endpoints responden {ok: true, datos} cuando salen bien", () => {
  const e = sistema();
  const llamadas = llamadasValidas(e);
  assert.equal(new Set(llamadas.map(l => l[1])).size, 20, "están los 20 endpoints");
  for (const [correo, funcion, ...args] of llamadas) {
    const r = ejecutarCrudo(e, correo, funcion, ...args);
    assert.equal(r.ok, true, funcion + ": " + JSON.stringify(r).slice(0, 200));
    assert.ok("datos" in r || r.datos === undefined, funcion);
  }
});

test("con un dato inválido, o desde fuera del dominio, responden {ok: false} con un código del catálogo", () => {
  const e = sistema();
  const codigos = e.ctx.CODIGOS_;
  for (const [correo, funcion, , ...resto] of llamadasValidas(e)) {
    const invalido = ejecutarCrudo(e, correo, funcion, "1900-1", ...resto);
    assert.deepEqual([invalido.ok, invalido.codigo], [false, "DATO_INVALIDO"], funcion);
    assert.ok(invalido.mensaje && codigos.includes(invalido.codigo));
    const ajeno = ejecutarCrudo(e, "alguien@gmail.com", funcion, CICLO, ...resto);
    assert.equal(ajeno.codigo, "FUERA_DEL_DOMINIO", funcion);
  }
});

test("una excepción no prevista llega como INTERNO, sin detalles técnicos", () => {
  const e = sistema();
  const original = e.ctx.leerTablero_, errorConsola = console.error;
  const registrados = [];
  e.ctx.leerTablero_ = () => { throw new TypeError("Cannot read properties of undefined (reading 'filas')"); };
  console.error = m => registrados.push(String(m));
  try {
    const r = ejecutarCrudo(e, A, "obtenerTablero", CICLO);
    assert.deepEqual([r.ok, r.codigo, r.detalle], [false, "INTERNO", null]);
    assert.doesNotMatch(r.mensaje, /TypeError|undefined/);
    assert.ok(registrados.some(m => /TypeError/.test(m)), "el detalle queda en el registro del servidor");
  } finally {
    e.ctx.leerTablero_ = original;
    console.error = errorConsola;
  }
});

test("cambiarDepartamento sin cambios devuelve también el contenido del plan", () => {
  const e = sistema();
  const a = ejecutar(e, A, "obtenerPlan", CICLO, "ADM").asignaturas[0];
  const r = ejecutar(e, A, "cambiarDepartamento", CICLO, "ADM", a.grupos[0].id, e.ctx.Dominio.dptoDeCarrera("ADM"), "");
  assert.equal(r.sinCambios, true);
  assert.ok(Array.isArray(r.contenido) && r.contenido.length > 0 && r.totales);
});
