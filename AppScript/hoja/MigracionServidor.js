// @ts-check
/* Entradas del diálogo «Traer los datos de la BD anterior» (hoja/Migracion.html). Se usa
   una vez, al pasar de dos hojas (la BD con las versiones y el Centro de datos con el
   contenido) a la hoja única: copia en esta hoja las tablas de la BD que usaba la app. */

/* Tablas que se copian. Bloqueos y Fuentes no: los bloqueos eran de la app anterior y
   Fuentes se rehace al leer las pestañas de esta hoja. */
var TABLAS_MIGRADAS_ = ["Usuarios", "Planes", "Versiones", "Cargas", "VersionesCarga", "Recuperacion"];

/* Columnas que cambiaron de nombre (en la misma posición) desde la BD anterior. */
var COLUMNAS_RENOMBRADAS_ = { firma_xlsx: "firma_hoja" };

/**
 * Lo que hay en la BD anterior y lo que se reemplazaría en esta hoja, para confirmarlo.
 * @param {string} enlace Enlace o id de la hoja anterior.
 * @returns {Respuesta<ResumenMigracion>}
 */
function migracionRevisar(enlace) {
  return responder_(function () {
    exigirPropietarioHoja_();
    return resumenMigracion_(abrirBdAnterior_(enlace));
  });
}

/**
 * Copia las tablas de la BD anterior en esta hoja (reemplaza las suyas), aplica las
 * migraciones y lee las pestañas de datos: los planes cuyo contenido difiera del de las
 * pestañas reciben una versión «actualización desde la hoja».
 * @param {string} enlace
 * @returns {Respuesta<{tablas: Array<{nombre: string, filas: number}>, cambiados: string[], avisos: Aviso[]}>}
 */
function migracionAplicar(enlace) {
  return responder_(function () {
    exigirPropietarioHoja_();
    const origen = abrirBdAnterior_(enlace);
    const tablas = conCandado_(function () {
      const copiadas = copiarTablasAnteriores_(origen);
      ["Bloqueos", "Fuentes"].forEach(function (t) { reemplazarFilas_(t, []); });
      convertirFechasAPeru_();
      migrarCargasPorCarrera_();
      return copiadas;
    });
    /* Lo guardado en la caché es de antes de la copia: una generación nueva lo deja de lado. */
    const props = PropertiesService.getScriptProperties();
    props.setProperty("SIS_GENERACION", Date.now().toString(36));
    props.setProperty("SIS_BD_ANTERIOR_ID", origen.getId());
    configCache_ = null;

    const ciclo = config_().cicloHoja;
    const version = function () {
      const v = {};
      leerPlanes_().filter(function (f) { return f.ciclo === ciclo; }).forEach(function (f) { v[f.carrera] = f.version; });
      return v;
    };
    const antes = version();
    const avisos = sincronizarFuentes_(true);
    const despues = version();
    const cambiados = Object.keys(despues).filter(function (s) { return despues[s] !== antes[s]; }).sort();
    return { tablas: tablas, cambiados: cambiados, avisos: avisos };
  });
}

/**
 * Id de una hoja a partir de su enlace («…/spreadsheets/d/<id>/edit…») o del id solo.
 * @param {*} enlace
 * @returns {string}
 */
function idDeEnlace_(enlace) {
  const t = String(enlace == null ? "" : enlace).trim();
  const m = t.match(/\/d\/([A-Za-z0-9_-]{20,})/) || t.match(/^([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : "";
}

/**
 * La BD anterior: una hoja distinta de esta con las tablas Planes y Versiones.
 * @param {*} enlace
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function abrirBdAnterior_(enlace) {
  const id = idDeEnlace_(enlace);
  if (!id) fallo_("DATO_INVALIDO", "Pega el enlace de la hoja anterior (la que empieza por https://docs.google.com/spreadsheets/d/…).");
  if (id === config_().bdId) fallo_("DATO_INVALIDO", "Ese es el enlace de esta misma hoja: pega el de la BD anterior.");
  const libro = abrirLibro_(id);
  if (!libro) fallo_("NO_ENCONTRADO", "No se pudo abrir esa hoja: revisa el enlace y que tu cuenta pueda abrirla.");
  if (!libro.getSheetByName("Planes") || !libro.getSheetByName("Versiones"))
    fallo_("DATO_INVALIDO", "«" + libro.getName() + "» no tiene las tablas Planes y Versiones de SISCargaLectiva.");
  return libro;
}

/**
 * Filas de datos (sin la cabecera) de una tabla de la BD anterior, como texto. Falla si sus
 * columnas no son las de TABLAS_ (salvo las renombradas).
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} origen
 * @param {string} nombre
 * @returns {string[][]|null} null si la BD anterior no tiene esa tabla.
 */
function filasAnteriores_(origen, nombre) {
  const h = origen.getSheetByName(nombre);
  if (!h) return null;
  const filas = h.getLastRow(), cols = Math.max(h.getLastColumn(), TABLAS_[nombre].length);
  if (!filas) return [];
  const valores = h.getRange(1, 1, filas, cols).getValues();
  const cabecera = TABLAS_[nombre].map(function (c, j) {
    const v = String(valores[0][j] == null ? "" : valores[0][j]).trim();
    return COLUMNAS_RENOMBRADAS_[v] || v;
  });
  if (cabecera.join("|") !== TABLAS_[nombre].join("|"))
    fallo_("DATO_INVALIDO", "Las columnas de «" + nombre + "» en la hoja anterior (" + cabecera.join(", ") + ") no son las que espera la app (" + TABLAS_[nombre].join(", ") + ").");
  return valores.slice(1).map(function (f) {
    return f.map(function (v) { return v instanceof Date ? Dominio.isoPeru(v) : String(v == null ? "" : v); });
  }).filter(function (f) { return f[0] !== ""; });
}

/**
 * Debe llamarse dentro de conCandado_. Reemplaza cada tabla de TABLAS_MIGRADAS_ por la de
 * la BD anterior.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} origen
 * @returns {Array<{nombre: string, filas: number}>}
 */
function copiarTablasAnteriores_(origen) {
  const leidas = TABLAS_MIGRADAS_.map(function (t) { return { nombre: t, filas: filasAnteriores_(origen, t) }; });
  return leidas.filter(function (x) { return x.filas; }).map(function (x) {
    reemplazarFilas_(x.nombre, x.filas);
    return { nombre: x.nombre, filas: x.filas.length };
  });
}

/**
 * Cuántas filas tiene cada tabla en la BD anterior y en esta hoja, y la fecha de su última
 * versión.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} origen
 * @returns {ResumenMigracion}
 */
function resumenMigracion_(origen) {
  const cuenta = function (libro, t) { const h = libro.getSheetByName(t); return h ? Math.max(0, h.getLastRow() - 1) : null; };
  const ultima = ["Versiones", "VersionesCarga"].map(function (t) {
    const h = origen.getSheetByName(t);
    if (!h || h.getLastRow() < 2) return "";
    const col = TABLAS_[t].indexOf("fecha") + 1;
    return h.getRange(2, col, h.getLastRow() - 1, 1).getValues().map(function (v) { return String(v[0] || ""); }).sort().pop() || "";
  }).sort().pop() || "";
  const carpetas = [];
  try {
    const it = DriveApp.getFileById(origen.getId()).getParents();
    while (it.hasNext()) carpetas.push(it.next().getName());
  } catch (e) { /* sin acceso a las carpetas */ }
  const destino = libroBd_();
  return {
    nombre: origen.getName(), url: origen.getUrl(), carpetas: carpetas, ultimaVersion: ultima,
    tablas: TABLAS_MIGRADAS_.map(function (t) { return { nombre: t, anterior: cuenta(origen, t), actual: cuenta(destino, t) }; })
  };
}
