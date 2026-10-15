/* Tablas del sistema en la hoja de cálculo «SISCargaLectiva-BD». Todas las celdas
   se guardan como texto plano para que Sheets no convierta «2026-1» en una fecha. */
var TABLAS_ = {
  Usuarios: ["correo", "rol", "carreras", "departamento"],
  Planes: ["ciclo", "carrera", "estado", "version", "actualizado_por", "actualizado_en", "firma_xlsx", "totales", "fila_version"],
  Versiones: ["ciclo", "carrera", "n", "estado", "tipo", "usuario", "fecha", "motivo", "contenido"],
  /* «ref» es el documento bloqueado: «plan:ADM» o «carga:DIMA» (REF_ en Bloqueos.js). */
  Bloqueos: ["ciclo", "ref", "correo", "desde", "expira"],
  Fuentes: ["tipo", "archivo_id", "nombre", "modificado", "procesado_en", "avisos"],
  /* Carga docente de cada departamento en cada ciclo: como Planes y Versiones. «planes»
     guarda la versión de cada plan que se tenía a la vista al guardar. */
  Cargas: ["ciclo", "departamento", "version", "actualizado_por", "actualizado_en", "fila_version"],
  VersionesCarga: ["ciclo", "departamento", "n", "tipo", "usuario", "fecha", "motivo", "planes", "contenido"],
  /* Copia de lo que se está editando y aún no se guardó, por si se cierra la página. */
  Recuperacion: ["ciclo", "ref", "correo", "fecha", "version_base", "contenido"]
};

/* Una celda admite 50 000 caracteres; el contenido de una versión se reparte en
   celdas consecutivas a partir de la columna «contenido». */
var MAX_CELDA_ = 45000;

var libroBdCache_ = null;
var hojasCache_ = null;   // pestañas ya abiertas en esta ejecución

function libroBd_() {
  if (libroBdCache_) return libroBdCache_;
  const id = config_().bdId;
  if (!id) throw new Error("El sistema no está instalado: falta la propiedad SIS_BD_ID. Ejecuta instalar() desde el editor.");
  libroBdCache_ = SpreadsheetApp.openById(id);
  return libroBdCache_;
}

/* Una pestaña que falta (por ejemplo, una tabla nueva tras actualizar el código) se crea
   con sus cabeceras la primera vez que se usa. */
function hojaBd_(nombre) {
  if (!hojasCache_) hojasCache_ = {};
  if (hojasCache_[nombre]) return hojasCache_[nombre];
  const libro = libroBd_();
  let h = libro.getSheetByName(nombre);
  if (!h) {
    if (!TABLAS_[nombre]) throw new Error("Falta la pestaña «" + nombre + "» en la hoja del sistema. Ejecuta instalar() desde el editor.");
    h = prepararTabla_(libro, nombre);
  }
  hojasCache_[nombre] = h;
  return h;
}

function prepararTabla_(libro, nombre) {
  const columnas = TABLAS_[nombre];
  const h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (columnas.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), columnas.length - h.getMaxColumns());
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).setNumberFormat("@");
  h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight("bold");
  h.setFrozenRows(1);
  return h;
}

function prepararTablas_(libro) {
  Object.keys(TABLAS_).forEach(function (nombre) { prepararTabla_(libro, nombre); });
  libro.getSheets().forEach(function (h) {
    if (!TABLAS_[h.getName()] && h.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(h);
  });
}

/* Filas de datos como objetos con los campos de TABLAS_; _fila es su número de fila. */
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

/* Un texto que empiece por «=», «+», «-» o «@» se escribe con apóstrofo para que
   Sheets no lo tome como una fórmula. */
function celdaTexto_(v) {
  const t = v == null ? "" : String(v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

/* Asegura que la pestaña llegue hasta esa fila y esa columna. Las filas y columnas
   nuevas se dejan con formato de texto, como el resto de la pestaña (prepararTabla_), así
   que escribir no necesita volver a darlo. */
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

function escribirFila_(nombre, fila, valores) {
  escribirFilas_(nombre, fila, [valores]);
}

/* Escribe un bloque de filas desde «fila» en una sola llamada. Las filas cortas se
   completan con celdas vacías. */
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

function agregarFila_(nombre, valores) {
  const fila = hojaBd_(nombre).getLastRow() + 1;
  escribirFila_(nombre, fila, valores);
  return fila;
}

/* Borra las filas que cumplen la condición (que recibe la fila como objeto de
   leerTabla_). Las filas seguidas se borran juntas, de abajo arriba. Devuelve cuántas
   borró. columnas: cuántas leer para evaluar la condición (todas si no se indica). */
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

/* Sustituye todas las filas de datos de la pestaña por «filas», en una sola escritura. */
function reemplazarFilas_(nombre, filas) {
  const h = hojaBd_(nombre);
  const ancho = TABLAS_[nombre].length;
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, Math.max(ancho, h.getLastColumn())).clearContent();
  escribirFilas_(nombre, 2, filas);
}

/* Une las celdas de contenido de una fila de versión, a partir de la columna «contenido». */
function unirDesde_(valores, indice) {
  return valores.slice(indice).map(function (c) { return c == null ? "" : String(c); }).join("");
}

function trocear_(texto) {
  const partes = [];
  for (let i = 0; i < texto.length; i += MAX_CELDA_) partes.push(texto.slice(i, i + MAX_CELDA_));
  return partes.length ? partes : [""];
}

/* Caché del script, compartida por todos los usuarios. Las claves llevan el ID de la
   hoja del sistema para que una reinstalación no sirva datos de la anterior. */
function cache_() {
  return CacheService.getScriptCache();
}

function claveCache_(tipo, resto) {
  return "sis:" + config_().bdId + ":" + tipo + ":" + resto;
}

function leerDeCache_(clave) {
  const v = cache_().get(clave);
  return v == null ? null : JSON.parse(v);
}

function guardarEnCache_(clave, valor, segundos) {
  try {
    cache_().put(clave, JSON.stringify(valor), segundos);
  } catch (e) {
    /* Un valor de más de 100 KB no cabe: se volverá a leer de la hoja. */
  }
}

/* Ejecuta fn con el candado del script, para que dos usuarios no escriban a la vez. */
function conCandado_(fn) {
  const candado = LockService.getScriptLock();
  if (!candado.tryLock(30000))
    throw new Error("El sistema está ocupado con otra operación. Inténtalo de nuevo en unos segundos.");
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    candado.releaseLock();
  }
}
