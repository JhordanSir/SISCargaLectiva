/* Edición directa en la hoja (fase 3 del plan): disparadores, bloqueo con la primera
   edición, protecciones que siguen al bloqueo, interpretación al momento, fusiones que
   esperan, grupos eliminados, menú, panel lateral, reemplazo y autoguardado (P138–P142). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar, ejecutarEnLibro } from "./falsos.mjs";
import { plano, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";   // propietaria, Director con TODOS
const B = "fmaresg@ulasalle.edu.pe";    // Director con TODOS
const C = "jhuamanih@ulasalle.edu.pe";  // Director con TODOS
const COORD = "coord.ing@ulasalle.edu.pe";
const CICLO = "2026-1";
const COLUMNAS = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "TH", "DOCENTE", "DPTO", "TURNO",
                  "OBSERVACIONES", "GRUPO", "SUBGRUPO", "SECCIÓN", "SIS"];
const col = n => 1 + COLUMNAS.indexOf(n);

/* Libro instalado, 2026-1 sembrado desde los tres .xlsx y un Coordinador de ING. */
function sistema() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  [["SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", XLSX_CARRERA], ["SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", XLSX_DEPARTAMENTO],
   ["SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", XLSX_DOCENTES]]
    .forEach(([n, r]) => e.subir(e.propiedades.SIS_CARPETA_XLSX, n, fs.readFileSync(r), { fecha: "2026-09-20T10:00:00Z" }));
  ejecutar(e, A, "sembrarCiclo", CICLO);
  e.hoja("_SYS_USUARIOS").getRange(8, 1, 1, 4).setNumberFormat("@").setValues([[COORD, "coordinador", "ING", ""]]);
  ejecutar(e, A, "protegerHojasCicloActual");
  return e;
}
/* La aplicación web publicada y abierta una vez, para que el menú sepa su dirección. */
function conWeb(e) {
  e.publicarWeb();
  ejecutar(e, A, "doGet");
  return e;
}
const nombre = (e, sig) => e.ctx.nombreHojaCarrera(sig, CICLO);
const hoja = (e, sig) => e.hoja(nombre(e, sig));
const filaDe = (e, sig, codigo, grupo = "1") =>
  4 + hoja(e, sig).filas(4).findIndex(f => f[col("CODIGO") - 1] === codigo && String(f[col("GRUPO") - 1]) === String(grupo));
const celda = (e, sig, f, c) => hoja(e, sig).getRange(f, col(c)).getValue();
const nota = (e, sig, f, c) => hoja(e, sig).getRange(f, col(c)).getNotes()[0][0];
const fila = (t, sig) => t.filas.find(f => f.sig === sig);
const bitacora = e => e.hoja("_SYS_BITACORA").filas().map(f => f[4]);
const editoresHoja = (e, sig) => hoja(e, sig).getProtections("SHEET")
  .find(p => p.getDescription() === "SISCargaLectiva: hoja de " + sig).getEditors().map(x => x.getEmail()).sort();
/* Dos personas que escriben casi a la vez: la segunda escribe antes de que la protección se
   ajuste al bloqueo de la primera. */
function editarSinProteccion(e, correo, sig, f, c, valor) {
  const h = hoja(e, sig), x = h.celdaCreada(f, col(c));
  const antes = x.v;
  x.v = valor;
  return e.disparar("ON_EDIT", correo, { range: h.getRange(f, col(c)), source: e.libroActivo, value: valor,
                                         oldValue: antes === "" ? undefined : antes });
}

test("instalar crea los disparadores de la hoja una sola vez, como la cuenta propietaria", () => {
  const e = sistema();
  assert.deepEqual(e.disparadores.map(d => [d.funcion, d.tipo, d.minutos || null, d.creador]),
    [["onSheetEdit", "ON_EDIT", null, A], ["onSheetChange", "ON_CHANGE", null, A], ["revisarBloqueos", "CLOCK", 5, A]]);
  ejecutar(e, A, "instalar");
  assert.equal(e.disparadores.length, 3);
});

test("onOpen pone el menú «🎓 SISCargaLectiva» con sus siete opciones (RF-084)", () => {
  const e = sistema();
  ejecutarEnLibro(e, B, "onOpen");
  assert.equal(e.menus[0].nombre, "🎓 SISCargaLectiva");
  const funciones = e.menus[0].items.filter(i => i.funcion).map(i => i.funcion);
  assert.deepEqual(funciones, ["menuAbrirPanel", "menuSincronizar", "menuTerminar", "menuAlertas", "menuReemplazo", "menuRestaurar", "menuAbrirWeb"]);
  funciones.forEach(f => assert.equal(typeof e.ctx[f], "function", f));
});

test("la primera edición en la hoja toma el bloqueo y la deja solo para esa persona (P138)", () => {
  const e = sistema();
  const f = filaDe(e, "ING", "3.2.2.24");
  const ht = Number(celda(e, "ING", f, "HT")) + 1, hp = Number(celda(e, "ING", f, "HP"));
  assert.ok(editoresHoja(e, "ING").includes(C) && editoresHoja(e, "ING").includes(COORD));
  const r = e.editarComo(B, nombre(e, "ING"), f, col("HT"), [[String(ht)]]);
  assert.equal(r[0].cambios, true);
  assert.equal(celda(e, "ING", f, "TH"), ht + hp, "TH se recalcula al momento");
  const t = fila(ejecutar(e, A, "obtenerTablero", CICLO), "ING");
  assert.deepEqual([t.bloqueo.correo, t.pendiente, t.version], [B, true, 1]);
  assert.deepEqual(editoresHoja(e, "ING"), [A, B].sort());
  assert.throws(() => e.escribirComo(C, nombre(e, "ING"), f, col("HT"), [["4"]]), /protegido/);
  assert.ok(bitacora(e).includes("toma del bloqueo"));
  assert.ok(!bitacora(e).includes("sincronización desde la hoja"), "la versión se crea al sincronizar (P111)");
});

test("si otra persona ya tiene el bloqueo, lo que escribe vuelve atrás con una nota (P138)", () => {
  const e = sistema();
  const f = filaDe(e, "ING", "3.2.2.24");
  e.editarComo(B, nombre(e, "ING"), f, col("TURNO"), [["Noche"]]);
  const antes = String(celda(e, "ING", f, "HT"));
  const r = editarSinProteccion(e, C, "ING", f, "HT", "9");
  assert.match(r[0].revertido, /ING la edita fmaresg@ulasalle\.edu\.pe desde las \d\d:\d\d/);
  assert.equal(String(celda(e, "ING", f, "HT")), antes);
  assert.match(nota(e, "ING", f, "HT"), /^SISCargaLectiva · No se guardó: ING la edita fmaresg/);
  assert.equal(celda(e, "ING", f, "TURNO"), "Noche", "lo de quien tiene el bloqueo se conserva");
});

test("una cuenta que no puede editar la carrera ve su cambio revertido; sin cuenta informada, cuenta quien tiene el bloqueo", () => {
  const e = sistema();
  const f = filaDe(e, "ADM", "1.8.5.21");
  const r = editarSinProteccion(e, COORD, "ADM", f, "HT", "9");
  assert.match(r[0].revertido, /no puede editar la hoja de Administración/);
  assert.equal(String(celda(e, "ADM", f, "HT")), "3");
  const r2 = editarSinProteccion(e, null, "ADM", f, "HP", "7");
  assert.match(r2[0].revertido, /No se pudo identificar la cuenta/);
  assert.equal(String(celda(e, "ADM", f, "HP")), "2");
  e.editarComo(B, nombre(e, "ADM"), f, col("TURNO"), [["Tarde"]]);
  const r3 = e.editarComo(B, nombre(e, "ADM"), f, col("HP"), [["3"]], { quien: null });
  assert.equal(r3[0].cambios, true);
  assert.equal(celda(e, "ADM", f, "TH"), 6);
});

test("un «1-2» escrito en SEMESTRE de una fila nueva es semestre 1, grupo 2, y la fila recibe TH y SIS (P132)", () => {
  const e = sistema();
  const nueva = hoja(e, "ING").getLastRow() + 1;
  e.editarComo(B, nombre(e, "ING"), nueva, 1, [["ING", "2024", "1-2", "3.1.9.24", "Taller Nuevo", "2", "2", "", "", "DIMA", "Mañana", "", ""]]);
  assert.deepEqual([celda(e, "ING", nueva, "SEMESTRE"), celda(e, "ING", nueva, "GRUPO"), celda(e, "ING", nueva, "TH")], ["1", "2", 4]);
  const sis = JSON.parse(celda(e, "ING", nueva, "SIS"));
  assert.ok(sis.id && sis.v);
  const a = ejecutar(e, B, "obtenerPlan", CICLO, "ING").asignaturas.find(x => x.codigo === "3.1.9.24");
  assert.deepEqual([a.sem, a.grupos[0].n, a.nombre], [1, 2, "Taller Nuevo"]);
});

test("un «1-2» que Sheets convirtió en fecha se reconstruye con la configuración regional del libro", () => {
  const e = sistema();
  const f = filaDe(e, "ING", "3.2.2.24"), h = hoja(e, "ING");
  h.celdaCreada(f, col("SEMESTRE")).v = new Date(2026, 1, 3);   // «3-2» en un libro es_PE: 3 de febrero
  h.celdaCreada(f, col("GRUPO")).v = "";
  e.disparar("ON_EDIT", B, { range: h.getRange(f, col("SEMESTRE")), source: e.libroActivo });
  assert.deepEqual([celda(e, "ING", f, "SEMESTRE"), celda(e, "ING", f, "GRUPO")], ["3", "2"]);
});

test("un cambio en el nombre de la asignatura escrito en su segunda fila vale para todas sus filas", () => {
  const e = sistema();
  const f1 = filaDe(e, "ING", "3.1.1.24", "1"), f2 = filaDe(e, "ING", "3.1.1.24", "2");
  e.editarComo(B, nombre(e, "ING"), f2, col("ASIGNATURA"), [["Introducción a la Programación I"]]);
  assert.equal(celda(e, "ING", f1, "ASIGNATURA"), "Introducción a la Programación I");
  assert.equal(celda(e, "ING", f2, "ASIGNATURA"), "Introducción a la Programación I");
});

test("DOCENTE: un nombre que no está en General se da de alta «por completar» al momento (P126, RF-081)", () => {
  const e = sistema();
  const f = filaDe(e, "IND", "17.3.6.24");
  e.editarComo(B, nombre(e, "IND"), f, col("DOCENTE"), [["Docente Nuevo Del Ciclo"]]);
  assert.equal(celda(e, "IND", f, "DOCENTE"), "Docente Nuevo Del Ciclo");
  assert.match(nota(e, "IND", f, "DOCENTE"), /se dio de alta «por completar»/);
  assert.ok(e.hoja("General 2026-I").filas().some(x => x[2] === "Docente" && x[3] === "Nuevo"), "General se actualiza al momento");
  const t = fila(ejecutar(e, A, "obtenerTablero", CICLO), "IND");
  assert.deepEqual([t.version, t.pendiente], [1, true]);
});

test("DOCENTE que A11 impide vuelve a su último valor aceptado, con nota y color (P122)", () => {
  const e = sistema();
  const f = filaDe(e, "IND", "17.3.6.24");
  const r = e.editarComo(B, nombre(e, "IND"), f, col("DOCENTE"), [["ARIAS ENRÍQUEZ JOEL FERNANDO"]]);
  assert.deepEqual(r[0].rechazados.map(x => x.regla), ["A11"]);
  assert.equal(celda(e, "IND", f, "DOCENTE"), "");
  assert.match(nota(e, "IND", f, "DOCENTE"), /No se aceptó «ARIAS ENRÍQUEZ JOEL FERNANDO».*\(A11\)/);
  assert.equal(hoja(e, "IND").getRange(f, col("DOCENTE")).getBackgrounds()[0][0], "#f4cccc");
});

test("A07 también se aplica al editar: con el tope en 26 h, TORRES CALCIN (25 h) no recibe otro curso", () => {
  const e = sistema();
  e.propiedades.SIS_REGLAS = JSON.stringify({ A07: { max: 26 } });
  const f = filaDe(e, "ADM", "1.8.5.21");
  const r = e.editarComo(B, nombre(e, "ADM"), f, col("DOCENTE"), [["TORRES CALCIN, HENRY LUIS"]]);
  assert.deepEqual(r[0].rechazados.map(x => x.regla), ["A07"]);
  assert.equal(celda(e, "ADM", f, "DOCENTE"), "");
});

test("una anotación de fusión escrita en la hoja crea la sección al momento y versiona la otra carrera (RF-089)", () => {
  const e = sistema();
  const f = filaDe(e, "ADM", "1.3.3.24");
  const r = e.editarComo(B, nombre(e, "ADM"), f, col("OBSERVACIONES"), [["FUSIÓN ADM-3/ARQ-3"]]);
  assert.equal(r[0].fusiones, 1);
  assert.deepEqual(Object.keys(r[0].versiones), ["ARQ"]);
  assert.match(celda(e, "ADM", f, "SECCIÓN"), / · principal$/);
  assert.match(celda(e, "ARQ", filaDe(e, "ARQ", "16.3.3.24"), "SECCIÓN"), / · con ADM 1\.3\.3\.24$/);
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ")[1].tipo, "fusión desde ADM");
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ADM").length, 1, "ADM se versiona al sincronizar");
});

test("si otra persona edita la otra carrera, la fusión espera con una nota y se crea al sincronizar con ella libre (P139)", () => {
  const e = sistema();
  ejecutar(e, C, "abrirEdicion", CICLO, "ARQ");
  const f = filaDe(e, "ADM", "1.3.3.24");
  const r = e.editarComo(B, nombre(e, "ADM"), f, col("OBSERVACIONES"), [["FUSIÓN ADM-3/ARQ-3"]]);
  assert.deepEqual([r[0].fusiones, r[0].esperas.length], [0, 1]);
  assert.equal(celda(e, "ADM", f, "SECCIÓN"), "");
  assert.match(nota(e, "ADM", f, "OBSERVACIONES"),
               /ARQ la edita jhuamanih@ulasalle\.edu\.pe desde las \d\d:\d\d: la fusión se crea al sincronizar esta hoja cuando se libere/);
  e.editarComo(B, nombre(e, "ADM"), f, col("TURNO"), [["Tarde"]]);
  assert.equal(celda(e, "ADM", f, "SECCIÓN"), "", "otra edición no la vuelve a probar");
  assert.ok(ejecutar(e, B, "datosPanel", CICLO, "ADM").alertas.some(a => a.codigo === "Fusión" && a.fila === f));
  assert.equal(ejecutar(e, B, "consolidarHoja", CICLO, "ADM").esperas.length, 1, "con ARQ ocupada sigue esperando");

  ejecutar(e, C, "liberarBloqueo", CICLO, "ARQ");
  const s = ejecutar(e, B, "consolidarHoja", CICLO, "ADM");
  assert.equal(s.fusiones, 1);
  assert.ok(s.versiones.ARQ);
  const g = filaDe(e, "ADM", "1.3.3.24");
  assert.match(celda(e, "ADM", g, "SECCIÓN"), / · principal$/);
  assert.equal(nota(e, "ADM", g, "OBSERVACIONES"), "");
});

test("vaciar la fila del único grupo de una asignatura la saca del plan y queda como A06 en las alertas (P143)", () => {
  const e = sistema();
  const f = filaDe(e, "ING", "3.2.2.24");
  const r = e.editarComo(B, nombre(e, "ING"), f, 1, [Array(13).fill("")]);
  assert.deepEqual(r[0].eliminados.map(x => [x.codigo, x.a06]), [["3.2.2.24", true]]);
  assert.equal(celda(e, "ING", f, "SIS"), "", "la fila también pierde sus columnas del sistema");
  assert.ok(!ejecutar(e, B, "obtenerPlan", CICLO, "ING").asignaturas.some(a => a.codigo === "3.2.2.24"));
  const alerta = ejecutar(e, B, "datosPanel", CICLO, "ING").alertas.find(a => /3\.2\.2\.24/.test(a.texto) && /eliminó/.test(a.texto));
  assert.equal(alerta.codigo, "A06");
  assert.match(alerta.texto, /era el único grupo de la asignatura/);
  assert.equal(ejecutar(e, B, "consolidarHoja", CICLO, "ING").nueva, true);
  assert.ok(!ejecutar(e, B, "datosPanel", CICLO, "ING").alertas.some(a => /eliminó/.test(a.texto)));
});

test("vaciar un grupo fusionado deshace la fusión en la otra carrera y la versiona (P143)", () => {
  const e = sistema();
  const fa = filaDe(e, "ARQ", "16.1.1.24");
  assert.match(celda(e, "ARQ", fa, "SECCIÓN"), / · principal$/);
  const r = e.editarComo(B, nombre(e, "IND"), filaDe(e, "IND", "17.1.1.24"), 1, [Array(13).fill("")]);
  assert.deepEqual(r[0].eliminados.map(x => [x.codigo, x.a06]), [["17.1.1.24", true]]);
  assert.ok(r[0].versiones.ARQ, "ARQ queda versionada");
  assert.equal(celda(e, "ARQ", fa, "SECCIÓN"), "", "la sección se queda con un solo grupo y se deshace");
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ARQ").at(-1).tipo, "fusión desde IND");
});

test("vaciar un grupo de una asignatura con varios grupos se acepta y queda en las alertas hasta sincronizar (P140)", () => {
  const e = sistema();
  const f2 = filaDe(e, "ING", "3.1.1.24", "2");
  const r = e.editarComo(B, nombre(e, "ING"), f2, 1, [Array(13).fill("")]);
  assert.deepEqual(r[0].eliminados.map(x => [x.codigo, x.grupo, x.a06]), [["3.1.1.24", 2, false]]);
  assert.equal(celda(e, "ING", f2, "SIS"), "", "la fila también pierde sus columnas del sistema");
  assert.equal(ejecutar(e, B, "obtenerPlan", CICLO, "ING").asignaturas.find(a => a.codigo === "3.1.1.24").grupos.length, 1);
  assert.ok(ejecutar(e, B, "datosPanel", CICLO, "ING").alertas.some(a => a.codigo === "Eliminado" && /3\.1\.1\.24/.test(a.texto)));
  assert.equal(ejecutar(e, B, "consolidarHoja", CICLO, "ING").nueva, true);
  assert.ok(!ejecutar(e, B, "datosPanel", CICLO, "ING").alertas.some(a => a.codigo === "Eliminado"));
});

test("eliminar la fila entera de un grupo también se acepta (onSheetChange, P143)", () => {
  const e = sistema();
  assert.throws(() => e.borrarFilaComo(B, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24")), /protegido/,
                "las columnas del sistema no dejan eliminar filas a los demás");
  const ultima = hoja(e, "ING").getLastRow();
  const r = e.borrarFilaComo(A, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24"));
  assert.deepEqual(r[0].eliminados.map(x => [x.codigo, x.a06]), [["3.2.2.24", true]]);
  assert.equal(hoja(e, "ING").getLastRow(), ultima - 1);
  assert.ok(!ejecutar(e, B, "obtenerPlan", CICLO, "ING").asignaturas.some(a => a.codigo === "3.2.2.24"));
});

test("si quien elimina una fila no puede editar la hoja, el grupo vuelve al final", () => {
  const e = sistema();
  ejecutar(e, C, "abrirEdicion", CICLO, "ING", 1);
  const ultima = hoja(e, "ING").getLastRow();
  const r = e.borrarFilaComo(A, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24"));
  assert.match(r[0].revertido, /ING la edita jhuamanih/);
  assert.deepEqual(r[0].restaurados.map(x => x.codigo), ["3.2.2.24"]);
  assert.equal(hoja(e, "ING").getLastRow(), ultima);
  assert.equal(celda(e, "ING", ultima, "CODIGO"), "3.2.2.24");
});

test("abrir la edición en la web deja la hoja solo para quien edita; soltarla la devuelve (3.3)", () => {
  const e = sistema();
  ejecutar(e, B, "abrirEdicion", CICLO, "ING", 1);
  assert.deepEqual(editoresHoja(e, "ING"), [A, B].sort());
  assert.throws(() => e.escribirComo(C, nombre(e, "ING"), 5, col("HT"), [["1"]]), /protegido/);
  ejecutar(e, B, "liberarBloqueo", CICLO, "ING");
  assert.ok(editoresHoja(e, "ING").includes(C) && editoresHoja(e, "ING").includes(COORD));
});

test("guardar desde la web sobre una hoja con cambios sin versionar advierte y, al forzar, versiona antes la hoja (3.7)", () => {
  const e = sistema();
  ejecutar(e, B, "abrirEdicion", CICLO, "ING", 1);
  e.editarComo(B, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24"), col("TURNO"), [["Noche"]]);
  const plan = ejecutar(e, B, "obtenerPlan", CICLO, "ING");
  assert.equal(plan.pendiente, true);
  assert.ok(ejecutar(e, B, "abrirEdicion", CICLO, "ING", 1).asignaturas, "con cambios en la hoja, la web recibe el contenido");
  const g = ejecutar(e, B, "guardarPlan", CICLO, "ING", { asignaturas: plan.asignaturas, tipo: "guardar cambios", versionBase: 1 });
  assert.equal(g.conflicto.tipo, "cambios en la hoja sin versionar");
  const g2 = ejecutar(e, B, "guardarPlan", CICLO, "ING", { asignaturas: plan.asignaturas, tipo: "guardar cambios", versionBase: 1, forzar: true });
  assert.equal(g2.version, 3);
  assert.deepEqual(ejecutar(e, A, "obtenerHistorial", CICLO, "ING").map(v => v.tipo),
                   ["importación desde xlsx", "sincronización desde la hoja", "guardar cambios"]);
});

test("«Terminar edición» desde el menú versiona, suelta el bloqueo y devuelve la hoja a sus editores (P138, RNF-13)", () => {
  const e = conWeb(sistema());
  assert.equal(e.propiedades.SIS_URL_WEB, e.urlWeb, "doGet guarda la dirección de la web publicada");
  const f = filaDe(e, "ING", "3.2.2.24");
  e.editarComo(B, nombre(e, "ING"), f, col("TURNO"), [["Noche"]]);
  const r = ejecutarEnLibro(e, B, "menuTerminar");
  assert.equal(r.nueva, true);
  assert.match(e.alertas.at(-1).texto, /Se creó la versión v2 de ING\.[\s\S]*Se soltó el bloqueo/);
  const t = fila(ejecutar(e, A, "obtenerTablero", CICLO), "ING");
  assert.deepEqual([t.version, t.bloqueo, t.pendiente], [2, null, false]);
  assert.ok(editoresHoja(e, "ING").includes(C));
  assert.ok(e.cuentas.urlfetch >= 1, "la acción pasó por la aplicación web");
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "ING")[1].usuario, B);
});

test("«Sincronizar y versionar» desde el menú mantiene el bloqueo (P138)", () => {
  const e = conWeb(sistema());
  e.editarComo(B, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24"), col("TURNO"), [["Noche"]]);
  ejecutarEnLibro(e, B, "menuSincronizar");
  assert.match(e.alertas.at(-1).texto, /Se creó la versión v2 de ING\.[\s\S]*Sigues con el bloqueo/);
  assert.equal(fila(ejecutar(e, A, "obtenerTablero", CICLO), "ING").bloqueo.correo, B);
});

test("sin la aplicación web publicada el menú lo explica: con la cuenta de quien hace clic no podría escribir lo protegido (RNF-13)", () => {
  const e = sistema();
  e.seleccion = { hoja: nombre(e, "ING"), fila: 5, col: 1 };
  ejecutarEnLibro(e, B, "menuSincronizar");
  assert.match(e.alertas.at(-1).texto, /necesita la aplicación web publicada/);
  assert.throws(() => ejecutarEnLibro(e, B, "consolidarHoja", CICLO, "ING", ""), /protegido/);
  e.seleccion = { hoja: "General 2026-I", fila: 2, col: 1 };
  ejecutarEnLibro(e, B, "menuSincronizar");
  assert.match(e.alertas.at(-1).texto, /Abre la hoja de una carrera/);
});

test("la aplicación web valida a quien llama desde el menú: cuenta sin rol y Coordinador de otra carrera (P125)", () => {
  const e = conWeb(sistema());
  e.seleccion = { hoja: nombre(e, "ADM"), fila: 5, col: 1 };
  ejecutarEnLibro(e, "nadie@ulasalle.edu.pe", "menuSincronizar");
  assert.match(e.alertas.at(-1).texto, /Acceso denegado/);
  assert.throws(() => ejecutarEnLibro(e, COORD, "panelLlamar", "consolidarHoja", [CICLO, "ADM", ""]), /no tiene permiso para editar/);
  assert.throws(() => ejecutarEnLibro(e, B, "panelLlamar", "guardarPlan", []), /Acción desconocida/);
});

test("revisarBloqueos autoguarda y suelta los bloqueos vencidos (P138)", () => {
  const e = sistema();
  e.editarComo(B, nombre(e, "ING"), filaDe(e, "ING", "3.2.2.24"), col("TURNO"), [["Noche"]]);
  e.desfase = 10 * 60000;
  assert.deepEqual(e.dispararTiempo(), [[]], "a los 10 minutos no vence");
  e.desfase = 31 * 60000;
  assert.deepEqual(e.dispararTiempo()[0].map(x => [x.sig, x.caducado, x.version]), [["ING", true, 2]]);
  const h = ejecutar(e, A, "obtenerHistorial", CICLO, "ING");
  assert.deepEqual([h[1].tipo, h[1].usuario], ["autoguardado", B]);
  const t = fila(ejecutar(e, A, "obtenerTablero", CICLO), "ING");
  assert.deepEqual([t.bloqueo, t.pendiente], [null, false]);
  assert.ok(editoresHoja(e, "ING").includes(C));
  assert.ok(bitacora(e).includes("caducidad del bloqueo"));
});

test("el panel lateral muestra totales, bloqueo, versiones y alertas con su fila, y lleva a ella (P141)", () => {
  const e = conWeb(sistema());
  e.seleccion = { hoja: nombre(e, "IND"), fila: 4, col: 1 };
  ejecutarEnLibro(e, B, "menuAlertas");
  const p = e.paneles.at(-1);
  assert.equal(p.titulo, "SISCargaLectiva");
  assert.match(p.html, /const VISTA_INICIAL = "alertas"/);
  assert.doesNotMatch(p.html, /<\?/);
  assert.deepEqual(plano(ejecutarEnLibro(e, B, "panelContexto")), { hoja: nombre(e, "IND"), ciclo: CICLO, sig: "IND", fila: 4 });
  const d = ejecutarEnLibro(e, B, "panelLlamar", "datosPanel", [CICLO, "IND"]);
  assert.deepEqual([d.totales.asig, d.bloqueo, d.versiones[0].n, d.urlWeb], [13, null, 1, e.urlWeb]);
  const f = filaDe(e, "IND", "17.3.6.24");
  const a13 = d.alertas.find(a => a.codigo === "A13" && /17\.3\.6\.24/.test(a.texto));
  assert.equal(a13.fila, f);
  assert.ok(d.alertas.some(a => a.codigo === "A11" && a.fila === f), "lo que A11 dejó pendiente al sembrar");
  assert.ok(ejecutarEnLibro(e, B, "panelIrA", d.hoja, a13.fila));
  assert.deepEqual([e.seleccion.hoja, e.seleccion.fila], [nombre(e, "IND"), f]);
});

test("reemplazo: la fila elegida y las marcadas cambian juntas, con historial y bitácora; si una incumple, no cambia ninguna (P142)", () => {
  const e = conWeb(sistema());
  const f = filaDe(e, "ADM", "1.1.1.24");
  assert.throws(() => ejecutarEnLibro(e, COORD, "panelLlamar", "datosReemplazo", [CICLO, "ADM", f]), /Solo un Director/);
  const d = ejecutarEnLibro(e, B, "panelLlamar", "datosReemplazo", [CICLO, "ADM", f]);
  const t = d.titulares[0];
  assert.match(t.nombre, /Mazeyra/i);
  assert.deepEqual(t.items.filter(i => i.marcada).map(i => [i.sig, i.codigo]), [["ADM", "1.1.1.24"]]);
  const der = t.items.find(i => i.sig === "DER");
  assert.ok(der, "también lista sus asignaturas de otras carreras");
  const elegidos = [t.items.find(i => i.marcada), der].map(i => ({ sig: i.sig, id: i.id, componentes: i.componentes }));
  const datos = { titular: t.clave, reemplazante: "Patiño Reemplazo, Luis", motivo: "Licencia médica", resolucion: "R-0123-2026",
                  fechaEfectiva: "2026-05-10", items: elegidos };
  const r = ejecutarEnLibro(e, B, "panelLlamar", "registrarReemplazo", [CICLO, datos]);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.versiones).sort(), ["ADM", "DER"]);
  assert.equal(celda(e, "ADM", f, "DOCENTE"), "Patiño Reemplazo, Luis");
  assert.match(nota(e, "ADM", f, "DOCENTE"), /Reemplaza a «Mazeyra Guillén, Orlando Alonso» desde 2026-05-10 \(Licencia médica, resolución R-0123-2026\)/);
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "DER").at(-1).tipo, "reemplazo docente");
  const bit = e.hoja("_SYS_BITACORA").filas().filter(x => x[4] === "reemplazo docente");
  assert.equal(bit.length, 2);
  assert.match(bit[0][6], /"saliente":"Mazeyra Guillén, Orlando Alonso".*"motivo":"Licencia médica","resolucion":"R-0123-2026","fechaEfectiva":"2026-05-10"/);

  e.propiedades.SIS_REGLAS = JSON.stringify({ A07: { max: 5 } });
  const d2 = ejecutarEnLibro(e, B, "panelLlamar", "datosReemplazo", [CICLO, "ADM", f]);
  const t2 = d2.titulares[0];
  const todos = t2.items.map(i => ({ sig: i.sig, id: i.id, componentes: i.componentes }));
  const r2 = ejecutarEnLibro(e, B, "panelLlamar", "registrarReemplazo",
                             [CICLO, Object.assign({}, datos, { titular: t2.clave, reemplazante: "Otro Docente Temporal", items: todos })]);
  assert.equal(r2.ok, false);
  assert.equal(r2.bloqueos[0].codigo, "A07");
  assert.equal(celda(e, "ADM", f, "DOCENTE"), "Patiño Reemplazo, Luis", "no cambió ninguna");
  assert.throws(() => ejecutarEnLibro(e, B, "panelLlamar", "registrarReemplazo", [CICLO, Object.assign({}, datos, { motivo: "Vacaciones" })]), /Elige el motivo/);
});

test("el reemplazo no se registra si otra persona edita una de las carreras (P117)", () => {
  const e = conWeb(sistema());
  const f = filaDe(e, "ADM", "1.1.1.24");
  const t = ejecutarEnLibro(e, B, "panelLlamar", "datosReemplazo", [CICLO, "ADM", f]).titulares[0];
  ejecutar(e, C, "abrirEdicion", CICLO, "DER");
  const items = t.items.filter(i => i.sig === "DER").map(i => ({ sig: i.sig, id: i.id, componentes: i.componentes }));
  assert.throws(() => ejecutarEnLibro(e, B, "panelLlamar", "registrarReemplazo", [CICLO, {
    titular: t.clave, reemplazante: "Patiño Reemplazo, Luis", motivo: "Renuncia", resolucion: "R-9", fechaEfectiva: "2026-06-01", items
  }]), /DER la edita jhuamanih@ulasalle\.edu\.pe: el reemplazo no se registró/);
});
