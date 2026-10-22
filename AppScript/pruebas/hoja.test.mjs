/* Herramientas de la hoja del sistema (hoja/): advertencias de las pestañas de datos,
   reacción a la edición, panel, «Traer los datos de la BD anterior» y «Limpiar la carpeta». */
import test from "node:test";
import assert from "node:assert/strict";
import { crearEntorno, cargarServidor, cargarPestanasEjemplo, ejecutar, ejecutarFallo, fijarUsuarios, USUARIOS_PRUEBA, MIME_XLSX } from "./falsos.mjs";
import { plano } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";      // propietaria de la hoja y coordinadora
const B = "fmaresg@ulasalle.edu.pe";       // otra cuenta con acceso a la hoja
const CICLO = "2026-1";

/* Hoja instalada con las pestañas de ejemplo; las llamadas se hacen desde la hoja. */
function hoja() {
  const e = crearEntorno();
  cargarServidor(e);
  cargarPestanasEjemplo(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  e.enHoja = true;
  return e;
}

/* Edita una celda como lo haría una persona: escribe y dispara onEdit. */
function editar(e, pestana, fila, col, valor) {
  const h = e.activo.getSheetByName(pestana);
  h.celdaCreada(fila, col).v = valor;
  e.usuario = A; e.efectivo = A;
  e.ctx.onEdit({ range: { getSheet: () => h, getRow: () => fila, getLastRow: () => fila } });
}

test("instalar deja la hoja con Inicio, las pestañas de datos en orden y su revisión pintada", () => {
  const e = hoja();
  const nombres = e.activo.getSheets().map(h => h.getName());
  assert.deepEqual(nombres.slice(0, 2), ["Inicio", "Usuarios"]);
  const primeraCarga = nombres.findIndex(n => n.startsWith("Carga - "));
  assert.ok(nombres.findIndex(n => n.startsWith("Oferta - ")) < primeraCarga && primeraCarga < nombres.findIndex(n => n.startsWith("Docentes - ")));
  assert.equal(e.activo.regional, "es_MX", "las fórmulas del formato condicional separan con comas");
  const psi = e.activo.getSheetByName("Oferta - Psicología");
  assert.ok(psi.getConditionalFormatRules().some(r => r.formula.includes('"scl:celda-error"')), "la fila repetida se resalta");
  const notas = psi.getRange(1, 1, psi.getLastRow(), psi.getLastColumn()).getNotes().flat().filter(Boolean);
  assert.ok(notas.some(n => /^Revisión: Error\. Código 9\.2\.5\.24 con grupo 1 repetido/.test(n)), notas.join(" | "));
  const inicio = e.activo.getSheetByName("Inicio");
  assert.deepEqual(inicio.getRange(10, 2, 4, 1).getValues().flat(), ["Usuarios", "Oferta por carrera", "Carga por departamento", "Catálogo de docentes"]);
  assert.equal(inicio.getRange(11, 3).getValue(), 8, "ocho pestañas de oferta");
});

test("las advertencias usan las reglas de la app: oferta, usuarios y catálogo", () => {
  const e = hoja();
  const { avisos } = plano(e.ctx.revisarHoja_(e.activo, ["usuarios", "carrera"], null, false));
  const de = (hoja, codigo) => avisos.filter(a => a.hoja === hoja && a.codigo === codigo);
  assert.equal(de("Oferta - Psicología", "FILA_REPETIDA").length, 1, "la misma fila que la app no lee");
  assert.equal(avisos.filter(a => a.hoja === "Usuarios").length, 0, "las cuentas de prueba son válidas");
  fijarUsuarios(e, USUARIOS_PRUEBA.concat([["alguien@gmail.com", "coordinador", "ADM", ""], ["otra@ulasalle.edu.pe", "jefa", "", ""]]));
  const r = plano(e.ctx.revisarHoja_(e.activo, ["usuarios"], avisos, false));
  assert.deepEqual(r.avisos.filter(a => a.hoja === "Usuarios").map(a => [a.fila, a.codigo]), [[8, "FUERA_DOMINIO"], [9, "ROL"]]);
  assert.equal(r.cuentas.usuarios.error, 2);
  assert.ok(r.avisos.some(a => a.hoja.startsWith("Oferta - ")), "conserva las advertencias de las demás pestañas");
});

test("al editar, una advertencia nueva se avisa y al corregirla también", () => {
  const e = hoja();
  editar(e, "Usuarios", 2, 2, "jefa");
  assert.deepEqual(e.activo.avisos.at(-1), ["Error en la fila 2", "Rol «jefa» no válido (director o coordinador): la app le niega el acceso."]);
  editar(e, "Usuarios", 2, 2, "coordinador");
  assert.deepEqual(e.activo.avisos.at(-1), ["Advertencia corregida", "La fila 2 ya no tiene advertencias."]);
  e.reiniciarCuentas();
  editar(e, "Inicio", 1, 1, "x");
  assert.equal(e.cuentas.sheets, 0, "editar una pestaña que no es de datos no revisa nada");
});

test("el panel lista las advertencias y lleva a su celda", () => {
  const e = hoja();
  const d = ejecutar(e, A, "panelObtener");
  assert.ok(d.total > 0 && d.items.length === Math.min(d.total, 500));
  const fila = d.items.find(i => i.codigo === "FILA_REPETIDA");
  assert.match(fila.a1, /^[A-Z]+\d+$/);
  assert.equal(ejecutar(e, A, "panelIrA", fila.hoja, fila.a1), true);
  assert.equal(ejecutarFallo(e, A, "panelIrA", "Planes", "A1").codigo, "DATO_INVALIDO", "solo lleva a pestañas de datos");
  const otra = ejecutar(e, B, "panelActualizar");
  assert.ok(otra.items.some(i => i.codigo === "FILA_REPETIDA"), "cualquiera que edite la hoja puede usar el panel");
});

test("las funciones de la hoja no responden desde la app web", () => {
  const e = hoja();
  e.enHoja = false;   // en la app web el script se ejecuta como la cuenta propietaria
  for (const [f, ...args] of [["panelObtener"], ["panelActualizar"], ["panelIrA", "Usuarios", "A1"], ["migracionRevisar", "x"],
                              ["migracionAplicar", "x"], ["limpiezaListar"], ["limpiezaAplicar", []]])
    assert.equal(ejecutarFallo(e, B, f, ...args).codigo, "SIN_PERMISO", f);
  assert.throws(() => ejecutar(e, B, "menuAbrirPanel"), /solo se usa desde la hoja/);
  assert.equal(e.ctx.onEdit({ range: {} }), undefined, "onEdit sin un rango de verdad no hace nada");
});

/* La BD anterior: una hoja con las tablas que dejó el sistema de antes (con la columna
   firma_xlsx), copiadas de un sistema que ya leyó la oferta y guardó una versión. */
function conBdAnterior() {
  const e = hoja();
  e.enHoja = false;
  ejecutar(e, A, "tableroObtener", CICLO);
  const p = ejecutar(e, A, "edicionPlanAbrir", CICLO, "ARQ");
  ejecutar(e, A, "edicionPlanGuardar", CICLO, "ARQ", { asignaturas: p.asignaturas.slice(1), estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  e.enHoja = true;
  const carpetaBd = e.nuevaCarpeta("SISCargaLectiva (app)", e.raiz);
  const vieja = e.nuevoLibro("SISCargaLectiva-BD", carpetaBd);
  for (const t of ["Usuarios", "Planes", "Versiones", "Bloqueos", "Fuentes", "Cargas", "VersionesCarga", "Recuperacion"]) {
    const h = e.activo.getSheetByName(t);
    const filas = h.getRange(1, 1, Math.max(1, h.getLastRow()), Math.max(1, h.getLastColumn())).getValues()
      .map(f => f.map(v => (v === "firma_hoja" ? "firma_xlsx" : v)));
    vieja.insertSheet(t).poner(filas);
    if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).clearContent();
  }
  return { e, vieja, carpetaBd };
}

test("traer la BD anterior copia sus tablas, deja de lado la caché y lee las pestañas", () => {
  const { e, vieja } = conBdAnterior();
  const r = ejecutar(e, A, "migracionRevisar", vieja.getUrl() + "/edit#gid=0");
  assert.equal(r.nombre, "SISCargaLectiva-BD");
  assert.deepEqual(r.carpetas, ["SISCargaLectiva (app)"]);
  assert.deepEqual(r.tablas.find(t => t.nombre === "Versiones"), { nombre: "Versiones", anterior: 9, actual: 0 });

  /* La oferta de Arquitectura cambió en su pestaña desde la última lectura de la app anterior. */
  const arqHoja = e.activo.getSheetByName("Oferta - Arquitectura");
  const celdaCodigo = [...arqHoja.datos].find(([, x]) => /^\d+(\.\d+){3}$/.test(x.v));
  const [fila, col] = celdaCodigo[0].split(":").map(Number);
  arqHoja.celdaCreada(fila, col + 1).v += " (nuevo nombre)";
  const hecho = ejecutar(e, A, "migracionAplicar", vieja.getId());
  assert.deepEqual(hecho.tablas.map(t => [t.nombre, t.filas]), [["Usuarios", 6], ["Planes", 8], ["Versiones", 9], ["Cargas", 0], ["VersionesCarga", 0], ["Recuperacion", 0]]);
  assert.deepEqual(hecho.cambiados, ["ARQ"], "solo ARQ cambió en su pestaña: recibe una versión desde la hoja");
  assert.ok(e.propiedades.SIS_GENERACION, "una generación nueva deja de lado la caché");
  assert.equal(e.propiedades.SIS_BD_ANTERIOR_ID, vieja.getId());
  const arq = e.hoja("Versiones").filas().filter(v => v[1] === "ARQ").map(v => v[4]);
  assert.deepEqual(arq, ["importación desde la hoja", "guardar cambios", "actualización desde la hoja"]);
  e.enHoja = false;
  assert.equal(ejecutar(e, A, "edicionPlanHistorial", CICLO, "ARQ").length, 3);
});

test("traer la BD anterior rechaza esta misma hoja, otra hoja y otra cuenta", () => {
  const { e, vieja } = conBdAnterior();
  assert.match(ejecutarFallo(e, A, "migracionRevisar", e.activo.getUrl()).mensaje, /esta misma hoja/);
  assert.equal(ejecutarFallo(e, A, "migracionRevisar", "no es un enlace").codigo, "DATO_INVALIDO");
  const otra = e.nuevoLibro("Notas de la reunión");
  assert.match(ejecutarFallo(e, A, "migracionRevisar", otra.getId()).mensaje, /no tiene las tablas Planes y Versiones/);
  vieja.getSheetByName("Planes").getRange(1, 3).setValue("otra cosa");
  assert.match(ejecutarFallo(e, A, "migracionAplicar", vieja.getId()).mensaje, /Las columnas de «Planes»/);
  assert.equal(ejecutarFallo(e, B, "migracionRevisar", vieja.getId()).codigo, "SIN_PERMISO", "solo la propietaria de la hoja");
});

test("limpiar la carpeta lista lo que no es la hoja y manda a la papelera solo lo elegido y propio", () => {
  const { e, vieja, carpetaBd } = conBdAnterior();
  ejecutar(e, A, "migracionAplicar", vieja.getId());
  const xlsx = e.subir(e.carpetaApp, "SISCargaLectiva-CargaXCarrera.xlsx", Buffer.from("x"), { tipo: MIME_XLSX });
  const ajeno = e.subir(e.carpetaApp, "SISCargaLectiva-BD (copia)", Buffer.from(""), { tipo: "application/vnd.google-apps.spreadsheet", propietario: "jhuamanih@ulasalle.edu.pe" });
  const anteriores = e.nuevaCarpeta("Anteriores", e.carpetaApp);
  const viejo = e.subir(anteriores, "CargaXCarrera (anterior).xlsx", Buffer.from("x"));
  const guardado = e.subir(anteriores, "Notas.xlsx", Buffer.from("x"));

  const lista = ejecutar(e, A, "limpiezaListar");
  assert.deepEqual(lista.carpetas.map(c => [c.nombre, c.conHoja]), [["SISCargaLectiva", true], ["SISCargaLectiva (app)", false]]);
  const nombres = lista.archivos.map(a => a.nombre).sort();
  assert.deepEqual(nombres, ["Anteriores", "CargaXCarrera (anterior).xlsx", "Notas.xlsx", "SISCargaLectiva-BD", "SISCargaLectiva-BD (copia)", "SISCargaLectiva-CargaXCarrera.xlsx"]);
  assert.ok(!lista.archivos.some(a => a.id === e.activo.getId()), "la hoja del sistema no se lista");

  const id = n => lista.archivos.find(a => a.nombre === n).id;
  const r = ejecutar(e, A, "limpiezaAplicar", [xlsx.id, ajeno.id, viejo.id, id("Anteriores"), vieja.getId()], carpetaBd.id);
  const por = Object.fromEntries(r.resultados.map(x => [x.nombre, x]));
  assert.ok(por["SISCargaLectiva-CargaXCarrera.xlsx"].ok && por["SISCargaLectiva-BD"].ok && por["CargaXCarrera (anterior).xlsx"].ok);
  assert.match(por["SISCargaLectiva-BD (copia)"].motivo, /Es de jhuamanih@ulasalle\.edu\.pe/);
  assert.match(por.Anteriores.motivo, /conserva archivos/, "«Notas.xlsx» no se eligió: la carpeta se queda");
  assert.equal(guardado.papelera, false);
  assert.deepEqual([xlsx.papelera, ajeno.papelera, viejo.papelera, anteriores.papelera], [true, false, true, false]);
  assert.equal(r.movida, true);
  assert.equal(e.archivos.get(e.activo.getId()).carpeta, carpetaBd, "la hoja pasó a la carpeta de la app");
  assert.equal(ejecutarFallo(e, A, "limpiezaAplicar", [xlsx.id], "otra-carpeta").codigo, "DATO_INVALIDO");
});

test("limpiar nunca lista Mi unidad ni manda a la papelera la carpeta que contiene la hoja", () => {
  const e = hoja();
  const sub = e.nuevaCarpeta("Hoja", e.carpetaApp);
  e.archivos.get(e.activo.getId()).moveTo(sub);
  e.subir(e.raiz, "Personal.xlsx", Buffer.from("x"));
  e.propiedades.SIS_BD_ANTERIOR_ID = e.nuevoLibro("BD vieja", e.carpetaApp).getId();
  const lista = ejecutar(e, A, "limpiezaListar");
  assert.ok(!lista.archivos.some(a => a.nombre === "Personal.xlsx"), "Mi unidad no se recorre");
  const carpeta = lista.archivos.find(a => a.id === sub.id);
  assert.equal(carpeta.conHoja, true);
  const r = ejecutar(e, A, "limpiezaAplicar", [sub.id]);
  assert.match(r.resultados[0].motivo, /Contiene la hoja del sistema/);
  assert.equal(sub.papelera, false);
});
