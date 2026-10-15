/* Pruebas de la auditoría P0: superficie pública, saneamiento de lo que llega del
   navegador, DNI restringido y lectura de los xlsx fuera del candado. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { crearEntorno, cargarServidor, ejecutar, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";
import { RAIZ, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";            // coordinador
const DIMA = DIRECTORES.DIMA, DAHUC = DIRECTORES.DAHUC;
const CICLO = "2026-1";

function sistema() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA));
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO));
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", fs.readFileSync(XLSX_DOCENTES));
  return e;
}

/* google.script.run puede llamar a cualquier función global que no termine en «_». */
const PUBLICAS = [
  "doGet", "instalar",
  "obtenerTablero", "obtenerPlan", "abrirEdicion", "guardarPlan", "obtenerHistorial", "restaurarVersion", "cambiarDepartamento",
  "renovarBloqueo", "liberarBloqueo",
  "obtenerEstadoDocentes", "abrirEdicionCarga", "renovarBloqueoCarga", "liberarBloqueoCarga", "guardarCarga",
  "obtenerHistorialCarga", "obtenerVersionCarga", "restaurarCarga",
  "guardarRecuperacion", "descartarRecuperacion"
].sort();

test("solo los endpoints y doGet/instalar se pueden llamar desde el navegador", () => {
  const publicas = fs.readdirSync(RAIZ).filter(f => f.endsWith(".js"))
    .flatMap(f => [...fs.readFileSync(path.join(RAIZ, f), "utf8").matchAll(/^function\s+([A-Za-z]\w*)\s*\(/gm)].map(m => m[1]))
    .filter(n => !n.endsWith("_"))
    .sort();
  assert.deepEqual(publicas, PUBLICAS);
});

test("guardarPlan guarda solo los campos del modelo y rechaza un volumen desmedido", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ");
  const a = p.asignaturas[0];
  a.intruso = "<script>"; a.nombre = "x".repeat(400);
  a.grupos[0].extra = { mucho: 1 }; a.grupos[0].desdoble = "cualquier cosa"; a.grupos[0].fusion = "no es una marca";
  a.grupos[0].id = "id con espacios";
  ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  const g = ejecutar(e, A, "obtenerPlan", CICLO, "ARQ").asignaturas[0];
  assert.equal(g.intruso, undefined);
  assert.equal(g.nombre.length, 250);
  assert.deepEqual(Object.keys(g.grupos[0]).sort(), ["desdoble", "fusion", "hp", "ht", "id", "n"]);
  assert.equal(g.grupos[0].desdoble, null);
  assert.equal(g.grupos[0].fusion, null);
  assert.match(g.grupos[0].id, /^[A-Za-z0-9_-]+$/, "un identificador no válido se reemplaza");

  assert.throws(() => ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: "nada", tipo: "guardar cambios", versionBase: 2 }), /se esperaba una lista/);
  const enorme = [{ sem: 1, codigo: "X", nombre: "Y", obs: "z".repeat(500), grupos: Array.from({ length: 61 }, (_, i) => ({ id: "g" + i, n: i, ht: 1, hp: 1 })) }];
  assert.throws(() => ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: enorme, tipo: "guardar cambios", versionBase: 2 }), /máximo es 60/);
  const pesado = Array.from({ length: 1500 }, (_, i) => ({ sem: 1, codigo: "C" + i, nombre: "n".repeat(240), obs: "o".repeat(490), grupos: [{ id: "g" + i, n: 1, ht: 1, hp: 1 }] }));
  assert.throws(() => ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: pesado, tipo: "guardar cambios", versionBase: 2 }), /demasiado grande/);
});

test("guardarCarga sanea cada asignación: campos, componente y horas", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const st = ejecutar(e, DIMA, "obtenerEstadoDocentes", CICLO, "DIMA");
  const u = st.unidades.find(x => x.dpto === "DIMA");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  const r = ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { versionBase: 0, asignaciones: [
    { unidad: u.id, componente: "T", docente: "  PRUEBA, UNO ", horas: "3 h", heredada: true, dptoCarga: "DAHUC", raro: 1 },
    { unidad: u.id, componente: "<img>", docente: "PRUEBA, DOS", horas: "-5", dni: "12 34" }
  ] });
  const [x, y] = r.asignaciones;
  assert.equal(x.docente, "PRUEBA, UNO");
  assert.equal(x.horas, 3);
  assert.equal(x.heredada, undefined);
  assert.equal(x.raro, undefined);
  assert.ok(x.id);
  assert.equal(y.componente, "C");
  assert.equal(y.horas, 0, "las horas no bajan de 0");
  assert.equal(e.ctx.Dominio.sanearAsignaciones([{ horas: 500 }])[0].horas, 60, "ni pasan de 60");
  assert.equal(y.dni, "", "un DNI con caracteres no válidos se descarta");
  assert.throws(() => ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { versionBase: 1, asignaciones: { no: "lista" } }), /se esperaba una lista/);
  assert.throws(() => ejecutar(e, DIMA, "guardarRecuperacion", CICLO, "carga:DIMA", { contenido: "texto" }), /se esperaba una lista/);
});

test("el DNI solo llega al director del departamento, y solo el de los suyos", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const dimaSt = ejecutar(e, DIMA, "obtenerEstadoDocentes", CICLO, "DIMA");
  const conDni = dimaSt.catalogo.filter(d => d.dni);
  assert.ok(conDni.length > 0 && conDni.every(d => d.dpto === "DIMA"), "el director ve el DNI de los docentes de su departamento");
  assert.ok(dimaSt.catalogo.some(d => d.dpto !== "DIMA" && d.dni === undefined), "y no el de los demás");

  const docente = conDni[0];
  const u = dimaSt.unidades.find(x => x.dpto === "DIMA");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { versionBase: 0, asignaciones: [{ unidad: u.id, componente: "T", docente: docente.nombreCompleto, dni: docente.dni }] });
  assert.equal(ejecutar(e, DIMA, "obtenerEstadoDocentes", CICLO, "DIMA").cargas.DIMA.asignaciones[0].dni, docente.dni);

  const coord = ejecutar(e, A, "obtenerEstadoDocentes", CICLO, "DIMA");
  assert.ok(coord.catalogo.every(d => d.dni === undefined), "el coordinador no recibe DNI");
  assert.equal(coord.cargas.DIMA.asignaciones[0].dni, undefined);
  assert.equal(ejecutar(e, DAHUC, "obtenerEstadoDocentes", CICLO, "DIMA").cargas.DIMA.asignaciones[0].dni, undefined, "ni el director de otro departamento");
  assert.equal(ejecutar(e, A, "obtenerVersionCarga", CICLO, "DIMA", 1)[0].dni, undefined);
  assert.equal(ejecutar(e, DIMA, "obtenerVersionCarga", CICLO, "DIMA", 1)[0].dni, docente.dni);
});

test("los xlsx se leen antes de tomar el candado", () => {
  const e = sistema();
  const ctx = e.ctx;
  let dentro = false, leidosDentro = 0, leidosFuera = 0;
  const candado = ctx.conCandado_, leer = ctx.leerLibroXlsx_;
  ctx.conCandado_ = fn => { dentro = true; try { return candado(fn); } finally { dentro = false; } };
  ctx.leerLibroXlsx_ = partes => { if (dentro) leidosDentro++; else leidosFuera++; return leer(partes); };
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.ok(t.filas.every(f => f.estado === "Registrado"), "la lectura se aplicó");
  assert.equal(leidosDentro, 0, "ningún xlsx se lee con el candado tomado");
  assert.ok(leidosFuera >= 2);
});
