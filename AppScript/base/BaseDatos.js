// @ts-check
/* Tablas del sistema en la hoja del sistema, la hoja a la que está ligado el script. Todas
   las celdas se guardan como texto plano para que Sheets no convierta «2026-1» en una fecha.
   Usuarios es la única que se edita a mano; las demás las escribe la app y van ocultas. */
var TABLAS_ = {
  Usuarios: ["correo", "rol", "carreras", "departamento"],
  Planes: ["ciclo", "carrera", "estado", "version", "actualizado_por", "actualizado_en", "firma_hoja", "totales", "fila_version"],
  Versiones: ["ciclo", "carrera", "n", "estado", "tipo", "usuario", "fecha", "motivo", "contenido"],
  /* «ref» es el documento bloqueado: «plan:ADM» o «carga:DIMA» (Dominio.REF). */
  Bloqueos: ["ciclo", "ref", "correo", "desde", "expira"],
  /* Lo último que se leyó de cada fuente (FuenteHoja.js): sus pestañas y su firma. */
  Fuentes: ["tipo", "pestanas", "firma", "procesado_en", "avisos"],
  /* Carga docente de cada carrera en cada ciclo: como Planes y Versiones. «planes»
     guarda la versión de cada plan que se tenía a la vista al guardar. */
  Cargas: ["ciclo", "carrera", "version", "actualizado_por", "actualizado_en", "fila_version"],
  VersionesCarga: ["ciclo", "carrera", "n", "tipo", "usuario", "fecha", "motivo", "planes", "contenido"],
  /* Copia de lo que se está editando y aún no se guardó, por si se cierra la página. */
  Recuperacion: ["ciclo", "ref", "correo", "fecha", "version_base", "contenido"]
};

/* Nombres de las pestañas, para no repetirlos como texto en el código. */
var TABLA_ = {
  USUARIOS: "Usuarios", PLANES: "Planes", VERSIONES: "Versiones", BLOQUEOS: "Bloqueos", FUENTES: "Fuentes",
  CARGAS: "Cargas", VERSIONES_CARGA: "VersionesCarga", RECUPERACION: "Recuperacion"
};

/* Pestañas de versiones anteriores del sistema que instalar() retira aunque tengan datos.
   «Asignaciones» guardaba la asignación docente antes de la carga por departamento. */
var PESTANAS_OBSOLETAS_ = ["Asignaciones"];

/* Pestañas que Sheets crea vacías en una hoja nueva: instalar() las retira si siguen vacías. */
var PESTANAS_VACIAS_ = ["Hoja 1", "Hoja1", "Sheet1"];

/* Una celda admite 50 000 caracteres; el contenido de una versión se reparte en
   celdas consecutivas a partir de la columna «contenido». */
var MAX_CELDA_ = 45000;

var libroBdCache_ = null;
var hojasCache_ = null;   // pestañas ya abiertas en esta ejecución

/**
 * La hoja de cálculo del sistema (SIS_BD_ID). Falla con NO_INSTALADO si no está configurada.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function libroBd_() {
  if (libroBdCache_) return libroBdCache_;
  const id = config_().bdId;
  if (!id) fallo_("NO_INSTALADO", "El sistema no está instalado: falta la propiedad SIS_BD_ID. Usa «Instalar o reparar» en el menú SISCargaLectiva de la hoja.");
  libroBdCache_ = SpreadsheetApp.openById(id);
  return libroBdCache_;
}

/**
 * Una pestaña que falta (por ejemplo, una tabla nueva tras actualizar el código) se crea
 * con sus cabeceras la primera vez que se usa.
 * @param {string} nombre Uno de TABLA_.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function hojaBd_(nombre) {
  if (!hojasCache_) hojasCache_ = {};
  if (hojasCache_[nombre]) return hojasCache_[nombre];
  const libro = libroBd_();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    if (!TABLAS_[nombre]) fallo_("NO_INSTALADO", "Falta la pestaña «" + nombre + "» en la hoja del sistema. Usa «Instalar o reparar» en el menú SISCargaLectiva de la hoja.");
    h = prepararTabla_(libro, nombre);
  }
  hojasCache_[nombre] = h;
  return h;
}

/**
 * Crea la pestaña si falta, con formato de texto y su fila de cabeceras. Las que escribe
 * solo la app (todas menos Usuarios) quedan ocultas y avisan antes de editarlas a mano.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {string} nombre
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function prepararTabla_(libro, nombre) {
  const columnas = TABLAS_[nombre];
  const h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (columnas.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), columnas.length - h.getMaxColumns());
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).setNumberFormat("@");
  h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight("bold");
  h.setFrozenRows(1);
  if (nombre !== TABLA_.USUARIOS) {
    if (!h.isSheetHidden()) h.hideSheet();
    if (!h.getProtections(SpreadsheetApp.ProtectionType.SHEET).length)
      h.protect().setWarningOnly(true).setDescription("Tabla de SISCargaLectiva: la escribe la app.");
  }
  return h;
}

/**
 * Prepara todas las pestañas de TABLAS_ y borra las de PESTANAS_OBSOLETAS_ y las de
 * PESTANAS_VACIAS_ que sigan vacías. Las demás pestañas (las de datos, Inicio) no se tocan.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {void}
 */
function prepararTablas_(libro) {
  Object.keys(TABLAS_).forEach(function (nombre) { prepararTabla_(libro, nombre); });
  libro.getSheets().forEach(function (h) {
    const obsoleta = PESTANAS_OBSOLETAS_.indexOf(h.getName()) >= 0;
    const vacia = PESTANAS_VACIAS_.indexOf(h.getName()) >= 0 && h.getLastRow() === 0;
    if ((obsoleta || vacia) && libro.getSheets().length > 1) libro.deleteSheet(h);
  });
}

/**
 * Filas de datos como objetos con los campos de TABLAS_; _fila es su número de fila.
 * @param {string} nombre
 * @param {number=} columnas Cuántas columnas leer (todas si no se indica).
 * @returns {FilaTabla[]}
 */
function leerTabla_(nombre, columnas) {
  const h = hojaBd_(nombre);
  const campos = TABLAS_[nombre];
  const cols = Math.min(columnas || campos.length, campos.length);
  const n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, cols).getValues().map(function (v, i) {
    const o = { _fila: i + 2 };
    for (let j = 0; j < cols; j++) o[campos[j]] = v[j] == null ? "" : String(v[j]);
    return o;
  }).filter(function (o) { return o[campos[0]] !== ""; });
}

/**
 * Un texto que empiece por «=», «+», «-» o «@» se escribe con apóstrofo para que
 * Sheets no lo tome como una fórmula.
 * @param {*} v
 * @returns {string}
 */
function celdaTexto_(v) {
  const t = v == null ? "" : String(v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/**
 * Asegura que la pestaña llegue hasta esa fila y esa columna. Las filas y columnas
 * nuevas se dejan con formato de texto, como el resto de la pestaña (prepararTabla_), así
 * que escribir no necesita volver a darlo.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} h
 * @param {number} filas
 * @param {number} columnas
 * @returns {void}
 */
function asegurarTamano_(h, filas, columnas) {
  const maxF = h.getMaxRows(), maxC = h.getMaxColumns();
  if (filas > maxF) {
    h.insertRowsAfter(maxF, filas - maxF + 50);
    h.getRange(maxF + 1, 1, filas - maxF + 50, h.getMaxColumns()).setNumberFormat("@");
  }
  if (columnas > maxC) {
    h.insertColumnsAfter(maxC, columnas - maxC);
    h.getRange(1, maxC + 1, h.getMaxRows(), columnas - maxC).setNumberFormat("@");
  }
}

/**
 * Escribe una fila desde la columna A.
 * @param {string} nombre
 * @param {number} fila
 * @param {Array<*>} valores
 * @returns {void}
 */
function escribirFila_(nombre, fila, valores) {
  escribirFilas_(nombre, fila, [valores]);
}

/**
 * Escribe un bloque de filas desde «fila» en una sola llamada. Las filas cortas se
 * completan con celdas vacías.
 * @param {string} nombre
 * @param {number} fila
 * @param {Array<Array<*>>} filas
 * @returns {void}
 */
function escribirFilas_(nombre, fila, filas) {
  if (!filas.length) return;
  const h = hojaBd_(nombre);
  const ancho = filas.reduce(function (n, f) { return Math.max(n, f.length); }, 0);
  asegurarTamano_(h, fila + filas.length - 1, ancho);
  h.getRange(fila, 1, filas.length, ancho).setValues(filas.map(function (f) {
    const v = f.map(celdaTexto_);
    while (v.length < ancho) v.push("");
    return v;
  }));
}

/**
 * Añade una fila al final de la pestaña.
 * @param {string} nombre
 * @param {Array<*>} valores
 * @returns {number} Su número de fila.
 */
function agregarFila_(nombre, valores) {
  const fila = hojaBd_(nombre).getLastRow() + 1;
  escribirFila_(nombre, fila, valores);
  return fila;
}

/**
 * Borra las filas que cumplen la condición (que recibe la fila como objeto de
 * leerTabla_). Las filas seguidas se borran juntas, de abajo arriba. Devuelve cuántas
 * borró. columnas: cuántas leer para evaluar la condición (todas si no se indica).
 * @param {string} nombre
 * @param {function(FilaTabla): boolean} condicion
 * @param {number=} columnas
 * @returns {number}
 */
function borrarFilasDonde_(nombre, condicion, columnas) {
  const filas = leerTabla_(nombre, columnas).filter(condicion).map(function (f) { return f._fila; })
    .sort(function (a, b) { return b - a; });
  const h = filas.length ? hojaBd_(nombre) : null;
  for (let i = 0; i < filas.length; ) {
    let desde = filas[i], cuantas = 1;
    while (i + cuantas < filas.length && filas[i + cuantas] === desde - 1) { desde--; cuantas++; }
    h.deleteRows(desde, cuantas);
    i += cuantas;
  }
  return filas.length;
}

/**
 * Sustituye todas las filas de datos de la pestaña por «filas», en una sola escritura.
 * @param {string} nombre
 * @param {Array<Array<*>>} filas
 * @returns {void}
 */
function reemplazarFilas_(nombre, filas) {
  const h = hojaBd_(nombre);
  const ancho = TABLAS_[nombre].length;
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, Math.max(ancho, h.getLastColumn())).clearContent();
  escribirFilas_(nombre, 2, filas);
}

/**
 * Une las celdas de contenido de una fila de versión, a partir de la columna «contenido».
 * @param {Array<*>} valores
 * @param {number} indice
 * @returns {string}
 */
function unirDesde_(valores, indice) {
  return valores.slice(indice).map(function (c) { return c == null ? "" : String(c); }).join("");
}

/**
 * Parte un texto en trozos que caben en una celda.
 * @param {string} texto
 * @returns {string[]}
 */
function trocear_(texto) {
  const partes = [];
  for (let i = 0; i < texto.length; i += MAX_CELDA_) partes.push(texto.slice(i, i + MAX_CELDA_));
  return partes.length ? partes : [""];
}

/**
 * Caché del script, compartida por todos los usuarios. Las claves llevan el ID de la
 * hoja del sistema para que una reinstalación no sirva datos de la anterior.
 * @returns {GoogleAppsScript.Cache.Cache}
 */
function cache_() {
  return CacheService.getScriptCache();
}

/**
 * Clave de caché del sistema: «sis:<bdId>[.<generación>]:<tipo>:<resto>».
 * @param {string} tipo
 * @param {string} resto
 * @returns {string}
 */
function claveCache_(tipo, resto) {
  const cfg = config_();
  return "sis:" + cfg.bdId + (cfg.generacion ? "." + cfg.generacion : "") + ":" + tipo + ":" + resto;
}

/**
 * Valor JSON guardado en la caché, o null.
 * @param {string} clave
 * @returns {*}
 */
function leerDeCache_(clave) {
  const v = cache_().get(clave);
  return v == null ? null : JSON.parse(v);
}

/**
 * Guarda un valor como JSON. Si no cabe (más de 100 KB), no lo guarda.
 * @param {string} clave
 * @param {*} valor
 * @param {number} segundos
 * @returns {void}
 */
function guardarEnCache_(clave, valor, segundos) {
  try {
    cache_().put(clave, JSON.stringify(valor), segundos);
  } catch (e) {
    /* Un valor de más de 100 KB no cabe: se volverá a leer de la hoja. */
  }
}

/**
 * Como conCandado_, pero solo espera unos instantes: si el candado está ocupado, no
 * ejecuta fn y devuelve null. Es para escrituras que se pueden saltar, como la copia de
 * recuperación, que el navegador repite al minuto siguiente: así no hacen esperar a los
 * guardados de verdad ni se quedan 30 s en cola.
 * @template T
 * @param {function(): T} fn
 * @param {number} milisegundos
 * @returns {T|null}
 */
function conCandadoSiLibre_(fn, milisegundos) {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(milisegundos)) return null;
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    candado.releaseLock();
  }
}

/**
 * Ejecuta fn con el candado del script, para que dos usuarios no escriban a la vez.
 * @template T
 * @param {function(): T} fn
 * @returns {T}
 */
function conCandado_(fn) {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(30000))
    fallo_("OCUPADO", "El sistema está ocupado con otra operación. Inténtalo de nuevo en unos segundos.");
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    candado.releaseLock();
  }
}
