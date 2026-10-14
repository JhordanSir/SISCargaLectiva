/* Servidor sobre el libro de Google Sheets (fase 2 del plan): instalación, siembra desde
   los .xlsx, hojas de carrera como contenido vigente, versiones, bloqueo, permisos y
   consolidación de lo editado a mano (P110–P134). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar } from "./falsos.mjs";
import { plano, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";
const B = "fmaresg@ulasalle.edu.pe";
const CICLO = "2026-1";

function subirXlsx(e, cuales = ["carrera", "departamento", "docentes"]) {
  const archivos = { carrera: ["SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", XLSX_CARRERA],
                     departamento: ["SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", XLSX_DEPARTAMENTO],
                     docentes: ["SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", XLSX_DOCENTES] };
  cuales.forEach(k => e.subir(e.propiedades.SIS_CARPETA_XLSX, archivos[k][0], fs.readFileSync(archivos[k][1]), { fecha: "2026-09-20T10:00:00Z" }));
}

/* Libro instalado y, salvo que se pida otra cosa, con 2026-1 sembrado desde los tres .xlsx. */
function sistema({ sembrado = true } = {}) {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  subirXlsx(e);
  if (sembrado) ejecutar(e, A, "sembrarCiclo", CICLO);
  return e;
}
const fila = (tablero, sig) => tablero.filas.find(f => f.sig === sig);
const hojaDe = (e, sig, ciclo = CICLO) => e.hoja(e.ctx.nombreHojaCarrera(sig, ciclo));
const col = n => 1 + ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "TH", "DOCENTE", "DPTO", "TURNO",
                      "OBSERVACIONES", "GRUPO", "SUBGRUPO", "SECCIÓN", "SIS"].indexOf(n);
/* Fila de la hoja de la carrera donde está el código (la primera, si hay varios grupos). */
const filaDe = (e, sig, codigo) => 4 + hojaDe(e, sig).filas(4).findIndex(f => f[col("CODIGO") - 1] === codigo);
const bitacora = e => e.hoja("_SYS_BITACORA").filas().map(f => f[4]);

test("sin instalar, la aplicación lo indica", () => {
  const e = crearEntorno();
  cargarServidor(e);
  assert.equal(ejecutar(e, A, "datosIniciales_").estado, "sin-instalar");
});

test("instalar() prepara las hojas del sistema ocultas y protegidas, la carpeta y los usuarios, y se puede repetir", () => {
  const e = sistema({ sembrado: false });
  assert.equal(e.propiedades.SIS_LIBRO_ID, e.libroActivo.getId());
  const carpeta = e.propiedades.SIS_CARPETA_XLSX;
  assert.ok(carpeta);
  assert.deepEqual(e.libroActivo.getSheets().map(h => h.getName()), ["_SYS_USUARIOS", "_SYS_PLANES_ESTADO", "_SYS_VERSIONES", "_SYS_BITACORA"]);
  for (const h of e.libroActivo.getSheets()) {
    assert.ok(h.isSheetHidden(), h.getName() + " oculta");
    assert.ok(!h.permite(B, 2, 1), h.getName() + " solo la escribe la cuenta propietaria");
    assert.ok(h.permite(A, 2, 1));
  }
  assert.deepEqual(plano(e.hoja("_SYS_USUARIOS").filas()[0]), [A, "director", "", "TODOS"]);
  ejecutar(e, A, "instalar");
  assert.equal(e.propiedades.SIS_CARPETA_XLSX, carpeta);
  assert.equal(e.carpetas.size, 1);
  assert.equal(e.hoja("_SYS_USUARIOS").filas().length, 6);
  assert.throws(() => ejecutar(e, B, "instalar"), /propietaria/);
});

test("sembrarCiclo llena las 13 hojas del ciclo y deja las 8 carreras Registradas v1 (P110, P131)", () => {
  const e = sistema({ sembrado: false });
  assert.throws(() => ejecutar(e, B, "sembrarCiclo", CICLO), /propietaria/);
  const r = ejecutar(e, A, "sembrarCiclo", CICLO);
  assert.deepEqual([r.fusiones, r.docentes, r.altas, r.pendientes.length], [23, 119, 107, 3]);
  assert.ok(r.avisos.some(a => /9\.2\.5\.24/.test(a)));

  const nombres = e.libroActivo.getSheets().map(h => h.getName());
  assert.deepEqual(nombres.slice(0, 13), ["Adm. Neg. Int. 2026-I", "Derecho 2026-I", "Ing. Software 2026-I", "Ing. Comercial 2026-I",
    "Cs. de la Comunicación 2026-I", "Psicología 2026-I", "Arquitectura 2026-I", "Ing. Industrial 2026-I", "General 2026-I",
    "CARGA DAHUC 2026-I", "CARGA DACJ 2026-I", "CARGA DIMA 2026-I", "CARGA DACTE 2026-I"]);
  assert.equal(new Set(e.libroActivo.getSheets().slice(0, 13).map(h => h.getTabColor())).size, 1, "las pestañas del ciclo, del mismo color");
  const ing = hojaDe(e, "ING");
  assert.equal(ing.getRange(1, col("ASIGNATURA")).getValue(), "CARGA LECTIVA 2026-I");
  assert.deepEqual(plano(ing.getRange(3, 1, 1, 16).getValues()[0]).slice(0, 15), ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA",
    "HT", "HP", "TH", "DOCENTE", "DPTO", "TURNO", "OBSERVACIONES", "GRUPO", "SUBGRUPO", "SECCIÓN"]);
  assert.ok(ing.isColumnHiddenByUser(col("SIS")));

  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.ok(t.filas.every(f => f.estado === "Registrado" && f.version === 1), JSON.stringify(t.filas.map(f => [f.sig, f.estado, f.version])));
  assert.equal(t.filas.reduce((n, f) => n + f.totales.grupos, 0), 365);
  assert.equal(t.filas.reduce((n, f) => n + f.totales.asig, 0), 345);
  assert.ok(t.filas.every(f => f.editadas === 0));
  const versiones = e.hoja("_SYS_VERSIONES").filas();
  assert.equal(versiones.length, 8);
  assert.ok(versiones.every(v => v[4] === "importación desde xlsx" && v[5] === "xlsx: SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx"));
  assert.ok(bitacora(e).includes("siembra desde xlsx"));
  assert.throws(() => ejecutar(e, A, "sembrarCiclo", CICLO), /ya tiene planes guardados/);
});

test("sembrar sin CargaXCarrera en la carpeta avisa y el ciclo queda en Sin Iniciar", () => {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  assert.throws(() => ejecutar(e, A, "sembrarCiclo", CICLO), /no tiene el archivo CargaXCarrera/);
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.ok(t.filas.every(f => f.estado === "Sin Iniciar" && f.version === 0 && f.contenido.length === 0));
});

test("protecciones: cada carrera la escriben sus Coordinadores y los Directores; DOCENTE, solo los Directores (P112, P114)", () => {
  const e = sistema();
  const coord = "coord@ulasalle.edu.pe";
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([[coord, "coordinador", "IND", ""]]);
  ejecutar(e, A, "protegerHojasCicloActual");
  const ind = e.ctx.nombreHojaCarrera("IND", CICLO), fila17 = filaDe(e, "IND", "17.1.1.24");
  e.escribirComo(coord, ind, fila17, col("HT"), [["3"]]);
  assert.throws(() => e.escribirComo(coord, ind, fila17, col("DOCENTE"), [["Otro Docente"]]), /protegido/);
  assert.throws(() => e.escribirComo(coord, e.ctx.nombreHojaCarrera("ADM", CICLO), 4, col("HT"), [["3"]]), /protegido/);
  e.escribirComo(B, ind, fila17, col("DOCENTE"), [["VILCA MAMANI MARCO ANTONIO"]]);
  assert.throws(() => e.escribirComo(B, ind, fila17, col("SIS"), [["{}"]]), /protegido/, "las columnas del sistema, nadie");
  assert.throws(() => e.escribirComo(B, ind, 3, col("HT"), [["X"]]), /protegido/, "las cabeceras, nadie");
  assert.throws(() => e.escribirComo(B, "General 2026-I", 2, 20, [["Sí"]]), /protegido/, "General es de solo lectura (P124)");
  assert.throws(() => e.escribirComo("nadie@ulasalle.edu.pe", ind, fila17, col("HT"), [["3"]]), /protegido/);
});

test("una cuenta sin acceso al libro no impide proteger: se añaden las demás y se avisa", () => {
  const e = sistema();
  const coord = "sinacceso@ulasalle.edu.pe";
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([[coord, "coordinador", "IND", ""]]);
  e.sinAcceso.add(coord);
  const r = ejecutar(e, A, "protegerHojasCicloActual");
  assert.match(r, /No se pudo dar permiso de edición a sinacceso@ulasalle.edu.pe/);
  const ind = e.ctx.nombreHojaCarrera("IND", CICLO);
  e.escribirComo(B, ind, filaDe(e, "IND", "17.1.1.24"), col("HT"), [["3"]]);
  assert.throws(() => e.escribirComo(coord, ind, filaDe(e, "IND", "17.1.1.24"), col("HT"), [["3"]]), /protegido/);
});

test("la consulta devuelve el plan leído de la hoja, con sus docentes", () => {
  const e = sistema();
  const p = ejecutar(e, B, "obtenerPlan", CICLO, "ING");
  assert.equal(p.version, 1);
  assert.equal(p.asignaturas.length, 68);
  assert.equal(p.asignaturas.find(a => a.codigo === "3.4.1.24").obs, "INTERNACIONAL - MÉXICO");
  assert.equal(p.asignaturas.find(a => a.codigo === "3.1.1.24").grupos[0].asignacion.T.id, "DNI:29619827");
  assert.equal(p.bloqueo, null);
  assert.equal(p.editadas, 0);
});

test("el bloqueo es por carrera: el segundo usuario abre en solo lectura", () => {
  const e = sistema();
  const ra = ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  assert.equal(ra.version, 1);
  assert.ok(Date.parse(ra.expira) > Date.now() + 29 * 60000);
  const rb = ejecutar(e, B, "abrirEdicion", CICLO, "ING");
  assert.equal(rb.bloqueado.correo, A);
  assert.equal(fila(ejecutar(e, B, "obtenerTablero", CICLO), "ING").bloqueo.correo, A);
  assert.ok(ejecutar(e, B, "abrirEdicion", CICLO, "ADM").expira, "otra carrera sí se puede editar");
  assert.throws(() => ejecutar(e, B, "guardarPlan", CICLO, "ING", { asignaturas: [], tipo: "guardar cambios", versionBase: 1 }), /lo está editando/);
  assert.throws(() => ejecutar(e, B, "consolidarHoja", CICLO, "ING"), /la está editando/);
  assert.deepEqual(bitacora(e).filter(a => /bloqueo/.test(a)), ["toma del bloqueo", "toma del bloqueo"]);
});

test("el bloqueo caduca por inactividad y el latido lo renueva", () => {
  const e = sistema();
  ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  e.desfase = 20 * 60000;
  assert.ok(ejecutar(e, A, "renovarBloqueo", CICLO, "ING").expira);
  e.desfase = 45 * 60000;
  assert.equal(ejecutar(e, B, "abrirEdicion", CICLO, "ING").bloqueado.correo, A, "a los 25 min del latido sigue vigente");
  e.desfase = 51 * 60000;
  assert.ok(ejecutar(e, B, "abrirEdicion", CICLO, "ING").expira, "caducado, lo toma otra cuenta");
  assert.equal(ejecutar(e, A, "renovarBloqueo", CICLO, "ING").perdido.correo, B);
  ejecutar(e, B, "liberarBloqueo", CICLO, "ING");
  assert.equal(fila(ejecutar(e, A, "obtenerTablero", CICLO), "ING").bloqueo, null);
  assert.equal(bitacora(e).filter(a => a === "liberación del bloqueo").length, 1);
});

test("guardar escribe la hoja, crea versiones y un plan Registrado nunca vuelve a Borrador", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ");
  p.asignaturas[0].grupos[0].ht = "5";
  const r = ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Borrador", tipo: "guardar borrador", versionBase: 1 });
  assert.deepEqual([r.version, r.estado], [2, "Registrado"]);
  assert.equal(hojaDe(e, "ARQ").getRange(4, col("HT")).getValue(), 5, "la hoja de la carrera es el contenido vigente");
  const r2 = ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", motivo: "=Matrícula extemporánea", versionBase: 2 });
  assert.equal(r2.version, 3);
  const h = ejecutar(e, B, "obtenerHistorial", CICLO, "ARQ");
  assert.deepEqual(h.map(v => [v.n, v.tipo]), [[1, "importación desde xlsx"], [2, "guardar borrador"], [3, "guardar cambios"]]);
  assert.equal(h[2].motivo, "=Matrícula extemporánea");
  assert.equal(ejecutar(e, B, "obtenerPlan", CICLO, "ARQ").asignaturas[0].grupos[0].ht, "5");
});

test("guardar desde la web no cambia los docentes: los conserva la hoja (RNF-02)", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  const g = p.asignaturas.find(a => a.codigo === "3.1.1.24").grupos[0];
  const antes = plano(g.asignacion);
  g.asignacion = { T: { texto: "Alguien Inventado", id: "N:ALGUIEN INVENTADO" }, P: null };
  ejecutar(e, A, "guardarPlan", CICLO, "ING", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.deepEqual(ejecutar(e, B, "obtenerPlan", CICLO, "ING").asignaturas.find(a => a.codigo === "3.1.1.24").grupos[0].asignacion, antes);
});

test("un plan nuevo pasa de Sin Iniciar a Borrador y a Registrado, y crea las hojas de su ciclo", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", "2026-2", "ING");
  assert.deepEqual([p.estado, p.version, p.asignaturas.length], ["Sin Iniciar", 0, 0]);
  const plan = [{ sem: 1, malla: "2024", codigo: "3.1.1.24", nombre: "Cálculo", dpto: "DIMA", obs: "",
                  grupos: [{ id: "g1", n: 1, ht: "3", hp: "2", desdoble: null, fusion: null, turno: "Noche", asignacion: null }] }];
  assert.equal(ejecutar(e, A, "guardarPlan", "2026-2", "ING", { asignaturas: plan, estado: "Borrador", tipo: "guardar borrador", versionBase: 0 }).estado, "Borrador");
  assert.equal(ejecutar(e, A, "guardarPlan", "2026-2", "ING", { asignaturas: plan, estado: "Registrado", tipo: "registrar", versionBase: 1 }).estado, "Registrado");
  const t = fila(ejecutar(e, A, "obtenerTablero", "2026-2"), "ING");
  assert.deepEqual([t.estado, t.version, t.totales.grupos, t.totales.dictado, t.hoja], ["Registrado", 2, 1, 5, "Ing. Software 2026-II"]);
  assert.equal(hojaDe(e, "ING", "2026-2").getRange(4, col("TURNO")).getValue(), "Noche");
  assert.ok(e.hoja("General 2026-II") && e.hoja("CARGA DIMA 2026-II"));
});

test("si llegó una versión nueva mientras se editaba, se advierte y se puede guardar igual", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "PSI");
  ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  const r = ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "autoguardado", versionBase: 1 });
  assert.equal(r.conflicto.n, 2);
  assert.equal(r.conflicto.tipo, "guardar cambios");
  const f = ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "autoguardado", versionBase: 1, forzar: true });
  assert.equal(f.version, 3);
});

test("si la hoja se editó a mano, guardar desde la web lo advierte y, al forzar, versiona antes lo editado", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "PSI");
  e.escribirComo(A, e.ctx.nombreHojaCarrera("PSI", CICLO), 4, col("TURNO"), [["Noche"]]);
  const r = ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.equal(r.conflicto.tipo, "1 fila editada a mano en la hoja");
  const f = ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1, forzar: true });
  assert.equal(f.version, 3);
  assert.deepEqual(ejecutar(e, A, "obtenerHistorial", CICLO, "PSI").map(v => v.tipo), ["importación desde xlsx", "sincronización desde la hoja", "guardar cambios"]);
});

test("restaurar crea una versión nueva, reescribe la hoja y vuelve a pasar los docentes por las reglas", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "IND");
  const original = plano(p.asignaturas);
  p.asignaturas.splice(0, 5);
  ejecutar(e, A, "guardarPlan", CICLO, "IND", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.equal(hojaDe(e, "IND").filas(4).length, 8);
  const r = ejecutar(e, A, "restaurarVersion", CICLO, "IND", 1);
  assert.deepEqual([r.version, r.estado, r.rechazados.length], [3, "Registrado", 0]);
  assert.equal(e.ctx.Dominio.contenidoCanonico(r.asignaturas), e.ctx.Dominio.contenidoCanonico(original));
  assert.equal(hojaDe(e, "IND").filas(4).length, 13);
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "IND")[2].tipo, "restauración de v1");
  assert.throws(() => ejecutar(e, A, "restaurarVersion", CICLO, "IND", 9), /no existe/);
});

test("un plan grande se reparte en varias celdas de la versión y se lee igual de la hoja", () => {
  const e = sistema();
  ejecutar(e, A, "abrirEdicion", "2027-1", "DER");
  const grande = Array.from({ length: 600 }, (_, i) => ({
    sem: 1 + (i % 10), malla: "2024", codigo: "2." + i + ".1.24", nombre: "Asignatura de prueba número " + i,
    dpto: "DACJ", obs: "x".repeat(40), grupos: [{ id: "g" + i, n: 1, ht: "2", hp: "2", desdoble: null, fusion: null, turno: "", asignacion: null }]
  }));
  assert.ok(JSON.stringify(grande).length > 90000);
  ejecutar(e, A, "guardarPlan", "2027-1", "DER", { asignaturas: grande, estado: "Borrador", tipo: "guardar borrador", versionBase: 0 });
  const D = e.ctx.Dominio;
  const ordenadas = D.ordenarAsignaturas(plano(grande));
  assert.equal(D.contenidoCanonico(ejecutar(e, B, "obtenerPlan", "2027-1", "DER").asignaturas), D.contenidoCanonico(ordenadas));
  assert.ok(e.hoja("_SYS_VERSIONES").filas().slice(-1)[0].length > 10, "la versión ocupa varias celdas");
});

test("el coordinador edita solo sus carreras y consulta todas", () => {
  const e = sistema();
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([["coord@ulasalle.edu.pe", "Coordinador", "Ing. Software, IND", ""]]);
  const d = ejecutar(e, "coord@ulasalle.edu.pe", "datosIniciales_");
  assert.deepEqual([d.estado, d.usuario.rol, d.usuario.carreras, d.usuario.departamento], ["ok", "coordinador", ["ING", "IND"], ""]);
  assert.ok(ejecutar(e, "coord@ulasalle.edu.pe", "abrirEdicion", CICLO, "IND").expira);
  assert.throws(() => ejecutar(e, "coord@ulasalle.edu.pe", "abrirEdicion", CICLO, "ADM"), /no tiene permiso/);
  assert.throws(() => ejecutar(e, "coord@ulasalle.edu.pe", "guardarPlan", CICLO, "ADM", { asignaturas: [], tipo: "registrar" }), /no tiene permiso/);
  assert.equal(ejecutar(e, "coord@ulasalle.edu.pe", "obtenerPlan", CICLO, "ADM").asignaturas.length, 60);
});

test("otro dominio o una cuenta sin rol reciben acceso denegado (P125, FA-037)", () => {
  const e = sistema();
  const d = ejecutar(e, "alguien@gmail.com", "datosIniciales_");
  assert.equal(d.estado, "denegado");
  assert.match(d.motivo, /no pertenece al dominio ulasalle\.edu\.pe/);
  assert.throws(() => ejecutar(e, "alguien@gmail.com", "obtenerTablero", CICLO), /no pertenece/);
  assert.equal(ejecutar(e, "nuevo@ulasalle.edu.pe", "datosIniciales_").motivo,
               "Acceso denegado. La cuenta no cuenta con permisos de Responsable del Plan de Ciclo. Contacte con la administración del sistema.");
  e.propiedades.SIS_ROL_POR_DEFECTO = "director";
  e.desfase = 6 * 60000;
  assert.equal(ejecutar(e, "nuevo@ulasalle.edu.pe", "datosIniciales_").usuario.rol, "director", "la propiedad lo cambia al caducar la caché");
  assert.equal(ejecutar(e, A, "datosIniciales_").estado, "ok");
});

test("un cambio en _SYS_USUARIOS se aplica cuando caduca la caché, a los 5 minutos", () => {
  const e = sistema();
  const coord = "coord@ulasalle.edu.pe";
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([[coord, "coordinador", "ING", ""]]);
  assert.deepEqual(ejecutar(e, coord, "datosIniciales_").usuario.carreras, ["ING"]);
  e.hoja("_SYS_USUARIOS").getRange(8, 2, 1, 3).setNumberFormat("@").setValues([["director", "", "DIMA"]]);
  e.desfase = 4 * 60000;
  assert.throws(() => ejecutar(e, coord, "abrirEdicion", CICLO, "ADM"), /no tiene permiso/);
  e.desfase = 6 * 60000;
  assert.ok(ejecutar(e, coord, "abrirEdicion", CICLO, "ADM").expira);
  assert.equal(ejecutar(e, coord, "datosIniciales_").usuario.departamento, "DIMA");
});

test("el tablero trae el contenido de cada hoja, en el orden del Excel", () => {
  const e = sistema();
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.deepEqual(t.filas.map(f => [f.sig, f.contenido.length]),
    [["ADM", 60], ["DER", 80], ["ING", 68], ["ICO", 45], ["COM", 38], ["PSI", 29], ["ARQ", 12], ["IND", 13]]);
  assert.ok(ejecutar(e, A, "obtenerTablero", "2026-2").filas.every(f => f.contenido.length === 0));
});

test("abrirEdicion solo devuelve el contenido si cambió la versión o la hoja se editó a mano", () => {
  const e = sistema();
  const r = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ", 1);
  assert.equal(r.version, 1);
  assert.equal("asignaturas" in r, false);
  e.escribirComo(A, e.ctx.nombreHojaCarrera("ARQ", CICLO), 4, col("TURNO"), [["Tarde"]]);
  const r2 = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ", 1);
  assert.equal(r2.editadas, 1);
  assert.equal(r2.asignaturas[0].grupos[0].turno, "Tarde");
  assert.equal(ejecutar(e, B, "abrirEdicion", CICLO, "ARQ", 1).bloqueado.correo, A);
});

test("consolidar la hoja: lo editado a mano pasa por las reglas y queda como versión (P111, P122)", () => {
  const e = sistema();
  const ind = e.ctx.nombreHojaCarrera("IND", CICLO), f = filaDe(e, "IND", "17.3.6.24");
  e.escribirComo(B, ind, f, col("DOCENTE"), [["ARIAS ENRÍQUEZ JOEL FERNANDO"]]);
  assert.equal(fila(ejecutar(e, A, "obtenerTablero", CICLO), "IND").editadas, 1);
  const r1 = ejecutar(e, B, "consolidarHoja", CICLO, "IND");
  assert.deepEqual(r1.rechazados.map(x => [x.codigo, x.regla]), [["17.3.6.24", "A11"]]);
  assert.equal(r1.nueva, false, "nada aceptado: no hay versión nueva");
  assert.equal(hojaDe(e, "IND").getRange(f, col("DOCENTE")).getValue(), "", "la celda vuelve a su último valor aceptado");
  assert.match(hojaDe(e, "IND").getRange(f, col("DOCENTE")).getNotes()[0][0], /No se aceptó «ARIAS ENRÍQUEZ JOEL FERNANDO».*\(A11\)/);

  e.escribirComo(B, ind, f, col("DOCENTE"), [["Docente Nuevo Del Ciclo"]]);
  const r2 = ejecutar(e, B, "consolidarHoja", CICLO, "IND", "Contratación nueva");
  assert.deepEqual([r2.nueva, r2.version, r2.aceptados.length, r2.altas], [true, 2, 1, 1]);
  const h = ejecutar(e, A, "obtenerHistorial", CICLO, "IND");
  assert.deepEqual([h[1].tipo, h[1].usuario, h[1].motivo], ["sincronización desde la hoja", B, "Contratación nueva"]);
  const general = e.hoja("General 2026-I").filas();
  assert.ok(general.some(x => x[2] === "Docente" && x[3] === "Nuevo"), "el alta «por completar» llega a General");
  assert.equal(fila(ejecutar(e, A, "obtenerTablero", CICLO), "IND").editadas, 0);
});

test("una anotación de fusión escrita en la hoja crea la sección en las dos carreras al consolidar (P118, P134)", () => {
  const e = sistema();
  const adm = e.ctx.nombreHojaCarrera("ADM", CICLO), f = filaDe(e, "ADM", "1.3.3.24");
  e.escribirComo(B, adm, f, col("OBSERVACIONES"), [["FUSIÓN ADM-3/ARQ-3"]]);
  const r = ejecutar(e, B, "consolidarHoja", CICLO, "ADM");
  assert.equal(r.fusiones, 1);
  assert.deepEqual(Object.keys(r.versiones).sort(), ["ADM", "ARQ"]);
  assert.match(hojaDe(e, "ADM").getRange(f, col("SECCIÓN")).getValue(), / · principal$/);
  const arq = hojaDe(e, "ARQ").getRange(filaDe(e, "ARQ", "16.3.3.24"), col("SECCIÓN")).getValue();
  assert.match(arq, / · con ADM 1\.3\.3\.24$/);
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ")[1].tipo, "fusión desde ADM");
});

test("la página llega con el tablero del ciclo actual leído de las hojas", () => {
  const e = sistema();
  const d = ejecutar(e, A, "datosIniciales_");
  assert.equal(d.tablero.ciclo, CICLO);
  assert.equal(d.tablero.pendiente, false);
  assert.equal(d.tablero.filas.find(f => f.sig === "ING").contenido.length, 68);
  assert.deepEqual(d.usuario.departamento, "TODOS");
});

test("doGet arma la página con los datos iniciales y los dos dominios compartidos", () => {
  const e = sistema();
  const html = e.ctx.doGet().getContent();
  assert.match(html, /var SIS = \{"estado":"ok"/);
  assert.match(html, /var Dominio = \(function crearDominio\(\)/);
  assert.match(html, /var DominioCarga = \(function crearDominioCarga\(D\)/);
  assert.doesNotMatch(html, /<\?/);
  assert.ok(!/<\/script/i.test(e.ctx.crearDominio.toString() + e.ctx.crearDominioCarga.toString()),
            "el código compartido no puede cerrar la etiqueta <script>");
});
