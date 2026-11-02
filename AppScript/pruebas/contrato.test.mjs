/* Contrato de respuestas (P3.1): todo endpoint responde {ok: true, datos} o
   {ok: false, codigo, mensaje, detalle}, con un código del catálogo de Respuesta.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { crearEntorno, cargarServidor, cargarPestanasEjemplo, ejecutar, ejecutarCrudo, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";

const A = "mfloresl@ulasalle.edu.pe";      // coordinador de todas las carreras
const DIMA = DIRECTORES.DIMA;
const CICLO = "2026-1";

function sistema() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  cargarPestanasEjemplo(e);
  ejecutar(e, A, "tableroObtener", CICLO);
  return e;
}

/* Cada endpoint con una cuenta y unos argumentos válidos, en un orden que tiene sentido. */
function llamadasValidas(e) {
  const ing = ejecutar(e, A, "consultaObtener", CICLO, "ING");
  const grupoAdm = ejecutar(e, A, "consultaObtener", CICLO, "ADM").asignaturas[0].grupos[0].id;
  return [
    [A, "tableroObtener", CICLO],
    [A, "consultaObtener", CICLO, "ING"],
    [A, "edicionPlanAbrir", CICLO, "ING"],
    [A, "edicionPlanRenovar", CICLO, "plan:ING"],
    [A, "edicionPlanGuardarCopia", CICLO, "plan:ING", { contenido: ing.asignaturas, versionBase: 1 }],
    [A, "edicionPlanDescartarCopia", CICLO, "plan:ING"],
    [A, "edicionPlanGuardar", CICLO, "ING", { asignaturas: ing.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 }],
    [A, "edicionPlanHistorial", CICLO, "ING"],
    [A, "edicionPlanRestaurar", CICLO, "ING", 1],
    [A, "edicionPlanLiberar", CICLO, "plan:ING"],
    [DIRECTORES.DACTE, "consultaDerivar", CICLO, "ADM", grupoAdm, "DACTE", "prueba"],
    [DIRECTORES.DACTE, "asignacionEdicionDerivar", CICLO, "ADM", grupoAdm, "DACTE", "prueba"],
    [DIMA, "asignacionObtener", CICLO, "ING"],
    [A, "asignacionBuscarDocentes", CICLO, "velasquez"],
    [A, "docentesAsignadosObtener", CICLO],
    [DIMA, "asignacionEdicionAbrir", CICLO, "ING"],
    [DIMA, "asignacionEdicionRenovar", CICLO, "carga:ING"],
    [DIMA, "asignacionEdicionGuardarCopia", CICLO, "carga:ING", { contenido: [], versionBase: 0 }],
    [DIMA, "asignacionEdicionDescartarCopia", CICLO, "carga:ING"],
    [DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [], versionBase: 0 }],
    [DIMA, "asignacionHistorial", CICLO, "ING"],
    [DIMA, "asignacionVerVersion", CICLO, "ING", 1],
    [DIMA, "asignacionEdicionRestaurar", CICLO, "ING", 1],
    [DIMA, "asignacionEdicionLiberar", CICLO, "carga:ING"]
  ];
}

test("todos los endpoints responden {ok: true, datos} cuando salen bien", () => {
  const e = sistema();
  const llamadas = llamadasValidas(e);
  assert.equal(new Set(llamadas.map(l => l[1])).size, 24, "están los 24 endpoints");
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
    const r = ejecutarCrudo(e, A, "tableroObtener", CICLO);
    assert.deepEqual([r.ok, r.codigo, r.detalle], [false, "INTERNO", null]);
    assert.doesNotMatch(r.mensaje, /TypeError|undefined/);
    assert.ok(registrados.some(m => /TypeError/.test(m)), "el detalle queda en el registro del servidor");
  } finally {
    e.ctx.leerTablero_ = original;
    console.error = errorConsola;
  }
});

test("consultaDerivar sin cambios devuelve también el contenido del plan", () => {
  const e = sistema();
  const a = ejecutar(e, A, "consultaObtener", CICLO, "ADM").asignaturas[0];
  const r = ejecutar(e, DIRECTORES.DACTE, "consultaDerivar", CICLO, "ADM", a.grupos[0].id, e.ctx.Dominio.dptoDeCarrera("ADM"), "");
  assert.equal(r.sinCambios, true);
  assert.ok(Array.isArray(r.contenido) && r.contenido.length > 0 && r.totales);
});
