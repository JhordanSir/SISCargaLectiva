import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar, ejecutarFallo, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";
import { cargar, partesXlsx, plano, XLSX_CARRERA, XLSX_DEPARTAMENTO } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";
const B = "fmaresg@ulasalle.edu.pe";
const CICLO = "2026-1";

/* Sistema instalado y con los dos xlsx de ejemplo en la carpeta. */
function sistema({ conXlsx = true } = {}) {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  if (conXlsx) {
    e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA), { fecha: "2026-09-20T10:00:00Z" });
    e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO), { fecha: "2026-09-20T10:05:00Z" });
  }
  return e;
}
const fila = (tablero, sig) => tablero.filas.find(f => f.sig === sig);

test("sin instalar, la aplicación lo indica", () => {
  const e = crearEntorno();
  cargarServidor(e);
  assert.equal(ejecutar(e, A, "datosIniciales_").estado, "sin-instalar");
});

test("instalar() crea carpeta, hoja, pestañas y usuarios, y se puede repetir", () => {
  const e = sistema({ conXlsx: false });
  const carpeta = e.propiedades.SIS_CARPETA_ID, bd = e.propiedades.SIS_BD_ID;
  assert.ok(carpeta && bd);
  assert.equal(e.propiedades.SIS_CICLO_XLSX, "2026-1");
  const libro = e.libros.get(bd);
  assert.deepEqual(libro.getSheets().map(h => h.getName()), ["Usuarios", "Planes", "Versiones", "Bloqueos", "Fuentes", "Cargas", "VersionesCarga", "Recuperacion"]);
  assert.equal(e.hoja("Usuarios").filas().length, 6);
  ejecutar(e, A, "instalar");
  assert.equal(e.propiedades.SIS_CARPETA_ID, carpeta);
  assert.equal(e.propiedades.SIS_BD_ID, bd);
  assert.equal(e.carpetas.size, 1);
  assert.equal(e.hoja("Usuarios").filas().length, 6);
  assert.throws(() => ejecutar(e, B, "instalar"), /propietaria/);
});

test("sin el xlsx en la carpeta, el tablero avisa y queda en Sin Iniciar", () => {
  const e = sistema({ conXlsx: false });
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.deepEqual(t.avisos.map(a => [a.tipo, a.nivel]), [["FALTA_CARGA_CARRERA", "aviso"]]);
  assert.match(t.avisos[0].texto, /no tiene el archivo CargaXCarrera/);
  assert.ok(t.filas.every(f => f.estado === "Sin Iniciar" && f.version === 0));
});

test("el tablero lee los xlsx de Drive: 8 carreras Registradas v1 con 365 grupos", () => {
  const e = sistema();
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.equal(t.filas.length, 8);
  assert.ok(t.filas.every(f => f.estado === "Registrado" && f.version === 1), JSON.stringify(t.filas.map(f => [f.sig, f.estado, f.version])));
  assert.equal(t.filas.reduce((n, f) => n + f.totales.grupos, 0), 365);
  assert.equal(t.filas.reduce((n, f) => n + f.totales.asig, 0), 345);
  const fila = t.avisos.find(a => a.tipo === "FILA_REPETIDA");
  assert.match(fila.texto, /9\.2\.5\.24/);
  assert.deepEqual([fila.datos.carrera, fila.datos.codigo], ["PSI", "9.2.5.24"]);
  const versiones = e.hoja("Versiones").filas();
  assert.equal(versiones.length, 8);
  assert.ok(versiones.every(v => v[4] === "importación desde xlsx" && v[5] === "xlsx: SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx"));
  assert.equal(versiones[0][6], "2026-09-20T10:05:00.000Z");

  const otra = ejecutar(e, B, "obtenerTablero", CICLO);
  assert.equal(e.hoja("Versiones").filas().length, 8, "una segunda lectura no crea versiones");
  assert.deepEqual(otra.avisos, t.avisos, "el aviso de la lectura se sigue mostrando a todos");
  assert.ok(ejecutar(e, A, "obtenerTablero", "2026-2").filas.every(f => f.estado === "Sin Iniciar"));
});

test("la consulta devuelve el contenido de la versión vigente", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const p = ejecutar(e, B, "obtenerPlan", CICLO, "ING");
  assert.equal(p.version, 1);
  assert.equal(p.asignaturas.length, 68);
  assert.equal(p.asignaturas.find(a => a.codigo === "3.4.1.24").obs, "INTERNACIONAL - MÉXICO");
  assert.equal(p.bloqueo, null);
});

test("el bloqueo es por carrera: el segundo usuario abre en solo lectura", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const ra = ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  assert.equal(ra.version, 1);
  assert.ok(Date.parse(ra.expira) > Date.now() + 29 * 60000);
  const rb = ejecutarFallo(e, B, "abrirEdicion", CICLO, "ING");
  assert.deepEqual([rb.codigo, rb.detalle.correo], ["BLOQUEADO", A]);
  assert.equal(fila(ejecutar(e, B, "obtenerTablero", CICLO), "ING").bloqueo.correo, A);
  assert.ok(ejecutar(e, B, "abrirEdicion", CICLO, "ADM").expira, "otra carrera sí se puede editar");
  assert.throws(() => ejecutar(e, B, "guardarPlan", CICLO, "ING", { asignaturas: [], tipo: "guardar cambios", versionBase: 1 }), { codigo: "BLOQUEADO", message: /lo está editando/ });
});

test("el bloqueo caduca por inactividad y el latido lo renueva", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  e.desfase = 20 * 60000;
  assert.ok(ejecutar(e, A, "renovarBloqueo", CICLO, "ING").expira);
  e.desfase = 45 * 60000;
  assert.equal(ejecutarFallo(e, B, "abrirEdicion", CICLO, "ING").detalle.correo, A, "a los 25 min del latido sigue vigente");
  e.desfase = 51 * 60000;
  assert.ok(ejecutar(e, B, "abrirEdicion", CICLO, "ING").expira, "caducado, lo toma otra cuenta");
  const perdido = ejecutarFallo(e, A, "renovarBloqueo", CICLO, "ING");
  assert.deepEqual([perdido.codigo, perdido.detalle.correo], ["BLOQUEO_PERDIDO", B]);
  ejecutar(e, B, "liberarBloqueo", CICLO, "ING");
  assert.equal(e.hoja("Bloqueos").filas().length, 0);
});

test("guardar crea versiones y un plan Registrado nunca vuelve a Borrador", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ");
  p.asignaturas[0].grupos[0].ht = "5";
  const r = ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Borrador", tipo: "guardar borrador", versionBase: 1 });
  assert.deepEqual([r.version, r.estado], [2, "Registrado"]);
  const r2 = ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", motivo: "=Matrícula extemporánea", versionBase: 2 });
  assert.equal(r2.version, 3);
  const h = ejecutar(e, B, "obtenerHistorial", CICLO, "ARQ");
  assert.deepEqual(h.map(v => [v.n, v.tipo]), [[1, "importación desde xlsx"], [2, "guardar borrador"], [3, "guardar cambios"]]);
  assert.equal(h[2].motivo, "=Matrícula extemporánea");
  assert.equal(ejecutar(e, B, "obtenerPlan", CICLO, "ARQ").asignaturas[0].grupos[0].ht, "5");
});

test("un plan nuevo pasa de Sin Iniciar a Borrador y a Registrado", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", "2026-2", "ING");
  assert.deepEqual([p.estado, p.version, p.asignaturas.length], ["Sin Iniciar", 0, 0]);
  const plan = [{ sem: 1, malla: "2024", codigo: "3.1.1.24", nombre: "Cálculo", dpto: "DIMA", obs: "", grupos: [{ id: "g1", n: 1, ht: "3", hp: "2", desdoble: null, fusion: null }] }];
  assert.equal(ejecutar(e, A, "guardarPlan", "2026-2", "ING", { asignaturas: plan, estado: "Borrador", tipo: "guardar borrador", versionBase: 0 }).estado, "Borrador");
  assert.equal(ejecutar(e, A, "guardarPlan", "2026-2", "ING", { asignaturas: plan, estado: "Registrado", tipo: "registrar", versionBase: 1 }).estado, "Registrado");
  const t = fila(ejecutar(e, A, "obtenerTablero", "2026-2"), "ING");
  assert.deepEqual([t.estado, t.version, t.totales.grupos, t.totales.dictado], ["Registrado", 2, 1, 5]);
});

test("si llegó una versión nueva mientras se editaba, se advierte y se puede guardar igual", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "PSI");
  ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  const r = ejecutarFallo(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "autoguardado", versionBase: 1 });
  assert.equal(r.codigo, "CONFLICTO");
  assert.equal(r.detalle.n, 2);
  assert.equal(r.detalle.tipo, "guardar cambios");
  const f = ejecutar(e, A, "guardarPlan", CICLO, "PSI", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "autoguardado", versionBase: 1, forzar: true });
  assert.equal(f.version, 3);
});

test("restaurar crea una versión nueva con el contenido recuperado", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "IND");
  const original = plano(p.asignaturas);
  p.asignaturas.splice(0, 5);
  ejecutar(e, A, "guardarPlan", CICLO, "IND", { asignaturas: p.asignaturas, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  const r = ejecutar(e, A, "restaurarVersion", CICLO, "IND", 1);
  assert.deepEqual([r.version, r.estado], [3, "Registrado"]);
  assert.deepEqual(r.asignaturas, original);
  assert.equal(ejecutar(e, A, "obtenerHistorial", CICLO, "IND")[2].tipo, "restauración de v1");
  assert.throws(() => ejecutar(e, A, "restaurarVersion", CICLO, "IND", 9), { codigo: "NO_ENCONTRADO", message: /no existe/ });
});

test("un plan grande se reparte en varias celdas y se lee igual", () => {
  const e = sistema();
  ejecutar(e, A, "abrirEdicion", "2027-1", "DER");
  const grande = Array.from({ length: 600 }, (_, i) => ({
    sem: 1 + (i % 10), malla: "2024", codigo: "2." + i + ".1.24", nombre: "Asignatura de prueba número " + i,
    dpto: "DACJ", obs: "x".repeat(40), grupos: [{ id: "g" + i, n: 1, ht: "2", hp: "2", desdoble: null, fusion: null }]
  }));
  assert.ok(JSON.stringify(grande).length > 90000);
  ejecutar(e, A, "guardarPlan", "2027-1", "DER", { asignaturas: grande, estado: "Borrador", tipo: "guardar borrador", versionBase: 0 });
  assert.deepEqual(ejecutar(e, B, "obtenerPlan", "2027-1", "DER").asignaturas, grande);
});

test("el coordinador edita solo sus carreras y consulta todas", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  e.hoja("Usuarios").getRange(8, 1, 1, 3).setNumberFormat("@").setValues([["coord@ulasalle.edu.pe", "Coordinador", "Ing. Software, IND"]]);
  const d = ejecutar(e, "coord@ulasalle.edu.pe", "datosIniciales_");
  assert.deepEqual([d.estado, d.usuario.rol, d.usuario.carreras], ["ok", "coordinador", ["ING", "IND"]]);
  assert.ok(ejecutar(e, "coord@ulasalle.edu.pe", "abrirEdicion", CICLO, "IND").expira);
  assert.throws(() => ejecutar(e, "coord@ulasalle.edu.pe", "abrirEdicion", CICLO, "ADM"), { codigo: "SIN_PERMISO", message: /no tiene permiso/ });
  assert.throws(() => ejecutar(e, "coord@ulasalle.edu.pe", "guardarPlan", CICLO, "ADM", { asignaturas: [], tipo: "registrar" }), { codigo: "SIN_PERMISO", message: /no tiene permiso/ });
  assert.equal(ejecutar(e, "coord@ulasalle.edu.pe", "obtenerPlan", CICLO, "ADM").asignaturas.length, 60);
});

test("el director lleva su departamento y el coordinador las carreras que coordina", () => {
  const e = sistema();
  e.hoja("Usuarios").getRange(8, 1, 2, 4).setNumberFormat("@").setValues([
    ["dir@ulasalle.edu.pe", "Director", "", "Humanidades y Com."],
    ["coord@ulasalle.edu.pe", "coordinador", "Ing. Software", ""]
  ]);
  const d = ejecutar(e, "dir@ulasalle.edu.pe", "datosIniciales_").usuario;
  assert.deepEqual([d.rol, d.departamento, d.coordina, d.carreras], ["director", "DAHUC", [], []], "el director no edita planes");
  const c = ejecutar(e, "coord@ulasalle.edu.pe", "datosIniciales_").usuario;
  assert.deepEqual([c.rol, c.coordina, c.carreras, c.departamento], ["coordinador", ["ING"], ["ING"], ""]);
  assert.throws(() => ejecutar(e, "dir@ulasalle.edu.pe", "abrirEdicion", CICLO, "ADM"), { codigo: "SIN_PERMISO", message: /no edita los planes/ });
});

test("otro dominio o una cuenta sin rol reciben acceso denegado", () => {
  const e = sistema();
  const d = ejecutar(e, "alguien@gmail.com", "datosIniciales_");
  assert.equal(d.estado, "denegado");
  assert.match(d.motivo, /no pertenece al dominio ulasalle\.edu\.pe/);
  assert.throws(() => ejecutar(e, "alguien@gmail.com", "obtenerTablero", CICLO), { codigo: "FUERA_DEL_DOMINIO", message: /no pertenece/ });
  assert.equal(e.propiedades.SIS_ROL_POR_DEFECTO, "ninguno", "instalar() deniega por defecto");
  assert.match(ejecutar(e, "nuevo@ulasalle.edu.pe", "datosIniciales_").motivo, /no tiene un rol/);
  e.propiedades.SIS_ROL_POR_DEFECTO = "director";
  assert.equal(ejecutar(e, "nuevo@ulasalle.edu.pe", "datosIniciales_").estado, "denegado", "la denegación sigue en caché");
  e.desfase = 6 * 60000;
  assert.equal(ejecutar(e, "nuevo@ulasalle.edu.pe", "datosIniciales_").usuario.rol, "director");
  assert.equal(ejecutar(e, A, "datosIniciales_").estado, "ok");
});

test("un cambio en la pestaña Usuarios se aplica cuando caduca la caché, a los 5 minutos", () => {
  const e = sistema();
  const coord = "coord@ulasalle.edu.pe";
  e.hoja("Usuarios").getRange(8, 1, 1, 3).setNumberFormat("@").setValues([[coord, "coordinador", "ING"]]);
  assert.deepEqual(ejecutar(e, coord, "datosIniciales_").usuario.carreras, ["ING"]);
  e.hoja("Usuarios").getRange(8, 3, 1, 1).setNumberFormat("@").setValues([["ING, ADM"]]);
  e.desfase = 4 * 60000;
  assert.throws(() => ejecutar(e, coord, "abrirEdicion", CICLO, "ADM"), { codigo: "SIN_PERMISO", message: /no tiene permiso/ });
  e.desfase = 6 * 60000;
  assert.ok(ejecutar(e, coord, "abrirEdicion", CICLO, "ADM").expira);
});

test("el tablero trae el contenido vigente de cada plan", () => {
  const e = sistema();
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.deepEqual(t.filas.map(f => [f.sig, f.contenido.length]),
    [["ING", 68], ["IND", 13], ["ADM", 60], ["DER", 80], ["ARQ", 12], ["PSI", 29], ["COM", 38], ["ICO", 45]]);
  assert.ok(ejecutar(e, A, "obtenerTablero", "2026-2").filas.every(f => f.contenido.length === 0));
});

test("dentro del intervalo el tablero no llama a Drive; «Releer Excel» sí", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  e.reiniciarCuentas();
  ejecutar(e, B, "obtenerTablero", CICLO);
  assert.equal(e.cuentas.drive, 0, "segunda carga sin Drive");
  e.reiniciarCuentas();
  ejecutar(e, B, "obtenerTablero", CICLO, { releer: true });
  assert.ok(e.cuentas.drive > 0, "releer mira la carpeta");
  e.desfase = 6 * 60000;
  e.reiniciarCuentas();
  ejecutar(e, B, "obtenerTablero", CICLO);
  assert.ok(e.cuentas.drive > 0, "pasado el intervalo vuelve a mirar");
  e.propiedades.SIS_MINUTOS_REVISION_XLSX = "0";
  e.reiniciarCuentas();
  ejecutar(e, B, "obtenerTablero", CICLO);
  assert.ok(e.cuentas.drive > 0, "con 0 mira en cada carga");
});

test("con la caché caliente, el tablero y la consulta no leen Versiones ni Usuarios", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  /* Con una carga docente guardada, ni el tablero ni la página leen Cargas ni VersionesCarga. */
  ejecutar(e, DIRECTORES.DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIRECTORES.DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [], versionBase: 0 });
  ejecutar(e, A, "obtenerTablero", CICLO);
  e.reiniciarCuentas();
  ejecutar(e, A, "obtenerTablero", CICLO);
  ejecutar(e, A, "datosIniciales_");
  ejecutar(e, A, "obtenerPlan", CICLO, "DER");
  assert.equal(e.cuentas.lecturas.Versiones || 0, 0);
  assert.equal(e.cuentas.lecturas.Usuarios || 0, 0);
  assert.ok(Object.keys(e.cuentas.lecturas).every(h => h === "Planes" || h === "Bloqueos"), JSON.stringify(e.cuentas.lecturas));
});

test("con la caché vacía, el tablero lee las 8 versiones de un solo bloque", () => {
  const e = sistema();
  const antes = ejecutar(e, A, "obtenerTablero", CICLO).filas;
  e.cache.clear();
  e.reiniciarCuentas();
  const despues = ejecutar(e, A, "obtenerTablero", CICLO).filas;
  assert.equal(e.cuentas.lecturas.Versiones, 1);
  assert.deepEqual(despues.map(f => f.contenido), antes.map(f => f.contenido));
  e.reiniciarCuentas();
  ejecutar(e, A, "obtenerTablero", CICLO);
  assert.equal(e.cuentas.lecturas.Versiones || 0, 0, "y queda en caché");
});

test("abrirEdicion solo devuelve el contenido si la versión que tiene el navegador ya no es la vigente", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const r = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ", 1);
  assert.equal(r.version, 1);
  assert.equal("asignaturas" in r, false);
  const nueva = ejecutar(e, A, "guardarPlan", CICLO, "ARQ", { asignaturas: [], estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.equal(nueva.version, 2);
  const r2 = ejecutar(e, A, "abrirEdicion", CICLO, "ARQ", 1);
  assert.deepEqual([r2.version, r2.asignaturas], [2, []]);
  assert.equal(ejecutarFallo(e, B, "abrirEdicion", CICLO, "ARQ", 2).detalle.correo, A);
});

test("la página llega con el tablero y avisa si falta revisar los xlsx", () => {
  const e = sistema();
  const d = ejecutar(e, A, "datosIniciales_");
  assert.equal(d.tablero.ciclo, CICLO);
  assert.equal(d.tablero.pendiente, true, "sin revisión reciente, el navegador la pide aparte");
  assert.ok(d.tablero.filas.every(f => f.estado === "Sin Iniciar"), "doGet no lee Drive");
  ejecutar(e, A, "obtenerTablero", CICLO);
  const d2 = ejecutar(e, B, "datosIniciales_");
  assert.equal(d2.tablero.pendiente, false);
  assert.equal(d2.tablero.filas.find(f => f.sig === "ING").contenido.length, 68);
  assert.match(d2.tablero.avisos.map(a => a.texto).join(" "), /9\.2\.5\.24/);
});

test("cambiar solo la fecha del xlsx no crea versiones; cambiar su contenido sí", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const carpeta = e.carpetas.get(e.propiedades.SIS_CARPETA_ID);
  const [carrera, departamento] = [...carpeta.archivos].filter(a => /CargaX/.test(a.getName())).sort((x, y) => x.getName().localeCompare(y.getName()));
  carrera.fecha = new Date("2026-09-25T08:00:00Z");
  ejecutar(e, A, "obtenerTablero", CICLO, { releer: true });
  assert.equal(e.hoja("Versiones").filas().length, 8);

  /* Sin el libro por departamento desaparecen las marcas de CONDICIÓN: cambian las
     carreras que tenían alguna y solo esas reciben «actualización desde xlsx». */
  const ctx = cargar(["Dominio.js", "LectorXlsx.js"]);
  const lc = ctx.leerLibroXlsx_(partesXlsx(XLSX_CARRERA));
  const con = plano(ctx.ofertaDesdeLibros_(lc, ctx.leerLibroXlsx_(partesXlsx(XLSX_DEPARTAMENTO)))).oferta;
  const sin = plano(ctx.ofertaDesdeLibros_(lc, null)).oferta;
  const cambian = Object.keys(con).filter(s => JSON.stringify(con[s].map(a => a.obs)) !== JSON.stringify(sin[s].map(a => a.obs)));
  assert.ok(cambian.includes("ING"));

  carpeta.archivos.delete(departamento);
  ejecutar(e, A, "obtenerTablero", CICLO);
  assert.equal(e.hoja("Versiones").filas().length, 8, "dentro del intervalo aún no se ve el cambio");
  const t = ejecutar(e, A, "obtenerTablero", CICLO, { releer: true });
  const actualizadas = e.hoja("Versiones").filas().filter(v => v[4] === "actualización desde xlsx").map(v => v[1]).sort();
  assert.deepEqual(actualizadas, cambian.sort());
  assert.equal(fila(t, "ING").version, 2);
  assert.equal(fila(t, "ING").estado, "Registrado");
  assert.equal(fila(t, "ING").contenido.find(a => a.codigo === "3.4.1.24").obs, "", "el tablero ya trae el contenido nuevo");
});

test("los avisos guardados como texto en Fuentes llegan como avisos con tipo TEXTO", () => {
  const e = sistema();
  ejecutar(e, A, "obtenerTablero", CICLO);
  const hoja = e.hoja("Fuentes");
  const filas = hoja.filas();
  const i = filas.findIndex(f => f[0] === "carrera");
  hoja.getRange(i + 2, 6).setNumberFormat("@").setValues([[JSON.stringify(["Aviso de antes"])]]);
  const t = ejecutar(e, B, "obtenerTablero", CICLO, { releer: true });
  assert.deepEqual(t.avisos.map(a => [a.tipo, a.nivel, a.texto]), [["TEXTO", "aviso", "Aviso de antes"]]);
});

test("un xlsx convertido a Hoja de cálculo de Google se señala y no se lee", () => {
  const e = sistema({ conXlsx: false });
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera", Buffer.from(""), { tipo: "application/vnd.google-apps.spreadsheet" });
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  const conv = t.avisos.find(a => a.tipo === "XLSX_CONVERTIDO");
  assert.match(conv.texto, /convertido a Hoja de cálculo de Google/);
  assert.equal(conv.datos.archivo, "SISCargaLectiva-Ejemplo-CargaXCarrera");
});

test("doGet arma la página con los datos iniciales y el dominio compartido", () => {
  const e = sistema();
  const html = e.ctx.doGet().getContent();
  assert.match(html, /var SIS = \{"estado":"ok"/);
  assert.match(html, /var Dominio = \(function \(\) \{\nfunction crearDominioComun_\(\)/);
  assert.doesNotMatch(html, /<\?/);
  assert.doesNotMatch(html, /icono_\(/, "las pantallas se evalúan como plantillas");
  const iconos = (html.match(/<svg class="ico[^"]*" aria-hidden="true" focusable="false"><use href="#i-[a-z0-9-]+"><\/use><\/svg>/g) || []).length;
  assert.ok(iconos >= 82, "los íconos de las pantallas llegan dibujados (" + iconos + ")");
  assert.ok(!/<\/script/i.test(e.ctx.fuenteDominio_()), "el código compartido no puede cerrar la etiqueta <script>");
});
