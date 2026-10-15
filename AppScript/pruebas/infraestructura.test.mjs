/* Pruebas de la auditoría P1: versionado común, bloqueos con referencia, escrituras y
   borrados en lote, y reconciliación de fusiones sin acceso a la hoja. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearEntorno, cargarServidor, ejecutar, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";
import { cargar, plano, RAIZ, XLSX_CARRERA, XLSX_DEPARTAMENTO } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe", B = "fmaresg@ulasalle.edu.pe";
const DIMA = DIRECTORES.DIMA;
const CICLO = "2026-1";

function sistema() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA));
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO));
  ejecutar(e, A, "obtenerTablero", CICLO);
  return e;
}

test("los bloqueos de planes y de cargas se guardan con su referencia", () => {
  const e = sistema();
  ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  assert.deepEqual(e.hoja("Bloqueos").filas().map(f => f[1]).sort(), ["carga:DIMA", "plan:ING"]);
  ejecutar(e, A, "liberarBloqueo", CICLO, "ING");
  ejecutar(e, DIMA, "liberarBloqueoCarga", CICLO, "DIMA");
  assert.equal(e.hoja("Bloqueos").filas().length, 0);
});

test("borrarFilasDonde_ borra en tramos y reemplazarFilas_ escribe en una sola llamada", () => {
  const e = sistema();
  const ctx = e.ctx;
  ejecutar(e, A, "obtenerTablero", CICLO);
  const h = e.hoja("Bloqueos");
  const filas = ["a", "b", "c", "d", "e"].map((x, i) => [CICLO, "plan:" + x, i % 2 ? "x@ulasalle.edu.pe" : "y@ulasalle.edu.pe", "2026-01-01", "2099-01-01"]);
  ctx.reemplazarFilas_("Bloqueos", filas.map(f => f.slice()));
  let llamadas = 0;
  const original = h.deleteRows.bind(h);
  h.deleteRows = (f, n) => { llamadas++; return original(f, n); };
  e.reiniciarCuentas();
  ctx.reemplazarFilas_("Bloqueos", filas.map(f => f.slice()));
  assert.equal(e.cuentas.sheets, 1, "una sola escritura para todas las filas");
  assert.equal(ctx.borrarFilasDonde_("Bloqueos", f => ["plan:b", "plan:c", "plan:e"].includes(f.ref)), 3);
  assert.equal(llamadas, 2, "b y c son seguidas: un tramo; e, otro");
  assert.deepEqual(h.filas().map(f => f[1]), ["plan:a", "plan:d"]);
});

test("la lista de versiones se toma de la caché y se completa al guardar", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ");
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ").length, 1);
  e.reiniciarCuentas();
  ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  const h = ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ");
  assert.deepEqual(h.map(v => [v.n, v.tipo]), [[1, "importación desde xlsx"], [2, "guardar cambios"]]);
  assert.equal(e.cuentas.lecturas.Versiones || 0, 0, "ni guardar ni el historial leen la tabla de versiones");
});

test("si la caché de versiones queda vieja, el historial y el contenido se releen bien", () => {
  const e = sistema();
  const ctx = e.ctx;
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ");
  ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ");
  /* Otro proceso guarda sin pasar por la caché de la lista. */
  const clave = ctx.claveMetas_(ctx.REPO_PLAN_, CICLO, "ARQ");
  ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  e.cache.set(clave, { valor: JSON.stringify([{ n: 1, _fila: 999 }]), vence: Date.now() + 1e9 });
  assert.deepEqual(ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ").map(v => v.n), [1, 2], "la lista no llega a la vigente: se relee");
  e.cache.set(clave, { valor: JSON.stringify([{ n: 1, _fila: 3 }, { n: 2, _fila: 2 }]), vence: Date.now() + 1e9 });
  for (const k of [...e.cache.keys()]) if (k.includes(":v:")) e.cache.delete(k);
  assert.equal(ejecutar(e, A, "obtenerPlan", CICLO, "ARQ").version, 2);
  assert.ok(plano(ctx.contenidoPlan_(CICLO, "ARQ", 1, 0)).length > 0, "una fila equivocada en la caché no devuelve otra versión");
});

test("reconciliarFusiones funciona sin la hoja: incorpora, elige principal y disuelve", () => {
  const { Dominio } = cargar(["Dominio.js"]);
  const grupo = (id, ht, hp, extra) => Object.assign({ id: id, n: 1, ht: ht, hp: hp, desdoble: null, fusion: null }, extra || {});
  const ing = [{ sem: 4, codigo: "3.4.6.24", nombre: "Liderazgo", dpto: "DAHUC", obs: "", grupos: [grupo("i1", "2", "2")] }];
  const psi = [{ sem: 4, codigo: "9.4.2.24", nombre: "Liderazgo", dpto: "DAHUC", obs: "", grupos: [grupo("p1", "3", "1")] }];
  const otros = { PSI: psi };
  Dominio.fusionar(ing, ["0:0"], "0:0", [{ carrera: "PSI", grupoId: "p1", codigo: "9.4.2.24", nombre: "Liderazgo", n: 1, ht: "3", hp: "1" }]);
  const r = plano(Dominio.reconciliarFusiones("ING", [], ing, [], otros));
  assert.deepEqual(Object.keys(r.cambios), ["PSI"]);
  const p1 = r.cambios.PSI.asignaturas[0].grupos[0];
  assert.equal(p1.fusion, ing[0].grupos[0].fusion);
  assert.deepEqual([p1.ht, p1.hp, p1.previas], ["2", "2", { ht: "3", hp: "1" }], "toma las horas del principal y guarda las suyas");
  assert.equal(p1.fusionCon[0].principal, true);
  assert.equal(psi[0].grupos[0].fusion, null, "los planes recibidos no se modifican");

  /* Deshacer desde ING la deshace en PSI. */
  const marca = ing[0].grupos[0].fusion;
  Dominio.deshacerFusion(ing, marca);
  const r2 = plano(Dominio.reconciliarFusiones("ING", ing, ing, [marca], { PSI: r.cambios.PSI.asignaturas }));
  assert.deepEqual([r2.cambios.PSI.asignaturas[0].grupos[0].fusion, r2.cambios.PSI.asignaturas[0].grupos[0].hp], [null, "1"]);
  assert.deepEqual(plano(Dominio.reconciliarFusiones("ING", ing, ing, [], {})).cambios, {}, "sin fusiones no hay cambios");
});

test("cada Dominio.aviso usa un tipo del catálogo TIPOS_AVISO", () => {
  const ctx = sistema().ctx;
  const usados = new Set();
  for (const f of fs.readdirSync(RAIZ).filter(f => f.endsWith(".js") || f.endsWith(".html"))) {
    for (const m of fs.readFileSync(path.join(RAIZ, f), "utf8").matchAll(/Dominio\.aviso\("([A-Z_]+)"/g)) usados.add(m[1]);
  }
  assert.ok(usados.size >= 14, [...usados].join(" "));
  for (const t of usados) assert.ok(t in ctx.Dominio.TIPOS_AVISO, t);
  for (const f of fs.readdirSync(RAIZ).filter(f => f.endsWith(".js")))
    assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, f), "utf8"), /avisos\.push\("/, f + " empuja un aviso sin tipo");
});

test("la copia de recuperación se salta sin error si el candado está ocupado", () => {
  const e = sistema();
  const ing = ejecutar(e, A, "obtenerPlan", CICLO, "ING");
  ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  const copia = { contenido: ing.asignaturas, versionBase: ing.version };
  e.candadoOcupado = true;
  try {
    assert.deepEqual(ejecutar(e, A, "guardarRecuperacion", CICLO, "plan:ING", copia), { fecha: null, omitida: true });
    assert.equal(e.hoja("Recuperacion").filas().length, 0);
    assert.throws(() => ejecutar(e, A, "liberarBloqueo", CICLO, "ING"), { codigo: "OCUPADO" }, "lo demás sigue esperando su turno");
  } finally {
    e.candadoOcupado = false;
  }
  assert.ok(ejecutar(e, A, "guardarRecuperacion", CICLO, "plan:ING", copia).fecha, "al minuto siguiente se guarda");
  assert.equal(e.hoja("Recuperacion").filas().length, 1);
});

test("instalar() retira las pestañas obsoletas aunque tengan datos", () => {
  const e = sistema();
  const libro = e.libros.get(e.propiedades.SIS_BD_ID);
  const vieja = libro.insertSheet("Asignaciones");
  vieja.getRange(1, 1, 2, 2).setNumberFormat("@").setValues([["ciclo", "docente"], ["2026-1", "X"]]);
  const ajena = libro.insertSheet("Notas del equipo");
  ajena.getRange(1, 1).setNumberFormat("@").setValues([["no tocar"]]);
  ejecutar(e, A, "instalar");
  assert.equal(libro.getSheetByName("Asignaciones"), null);
  assert.ok(libro.getSheetByName("Notas del equipo"), "una pestaña desconocida con datos se conserva");
});

test("los repositorios con versiones usan los nombres de pestaña de TABLA_", () => {
  const e = crearEntorno();
  const ctx = cargarServidor(e);
  assert.deepEqual([ctx.REPO_PLAN_.indice, ctx.REPO_PLAN_.versiones], [ctx.TABLA_.PLANES, ctx.TABLA_.VERSIONES]);
  assert.deepEqual([ctx.REPO_CARGA_.indice, ctx.REPO_CARGA_.versiones], [ctx.TABLA_.CARGAS, ctx.TABLA_.VERSIONES_CARGA]);
  assert.deepEqual(Object.values(ctx.TABLA_).sort(), Object.keys(ctx.TABLAS_).sort());
});
