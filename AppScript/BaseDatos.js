/* Tablas del sistema en la hoja de cálculo «SISCargaLectiva-BD». Todas las celdas
   se guardan como texto plano para que Sheets no convierta «2026-1» en una fecha. */
var TABLAS_ = {
  Usuarios: ["correo", "rol", "carreras"],
  Planes: ["ciclo", "carrera", "estado", "version", "actualizado_por", "actualizado_en", "firma_xlsx", "totales", "fila_version"],
  Versiones: ["ciclo", "carrera", "n", "estado", "tipo", "usuario", "fecha", "motivo", "contenido"],
  Bloqueos: ["ciclo", "carrera", "correo", "desde", "expira"],
  Fuentes: ["tipo", "archivo_id", "nombre", "modificado", "procesado_en", "avisos"],
  Asignaciones: ["ciclo", "departamento", "carrera", "codigo", "asignatura", "grupo", "componente", "docente", "horas", "condicion", "reemplazo_de", "fecha_asignacion"]
};

/* Una celda admite 50 000 caracteres; el contenido de una versión se reparte en
   celdas consecutivas a partir de la columna «contenido». */
var MAX_CELDA_ = 45000;

var libroBdCache_ = null;

function libroBd_() {
  if (libroBdCache_) return libroBdCache_;
  const id = config_().bdId;
  if (!id) throw new Error("El sistema no está instalado: falta la propiedad SIS_BD_ID. Ejecuta instalar() desde el editor.");
  libroBdCache_ = SpreadsheetApp.openById(id);
  return libroBdCache_;
}

function hojaBd_(nombre) {
  const h = libroBd_().getSheetByName(nombre);
  if (!h) throw new Error("Falta la pestaña «" + nombre + "» en la hoja del sistema. Ejecuta instalar() desde el editor.");
  return h;
}

function prepararTablas_(libro) {
  Object.keys(TABLAS_).forEach(function (nombre) {
    const columnas = TABLAS_[nombre];
    const h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    if (columnas.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), columnas.length - h.getMaxColumns());
    h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).setNumberFormat("@");
    h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight("bold");
    h.setFrozenRows(1);
  });
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

function escribirFila_(nombre, fila, valores) {
  const h = hojaBd_(nombre);
  if (fila > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), fila - h.getMaxRows() + 50);
  if (valores.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), valores.length - h.getMaxColumns());
  h.getRange(fila, 1, 1, valores.length).setNumberFormat("@").setValues([valores.map(celdaTexto_)]);
}

function agregarFila_(nombre, valores) {
  const fila = hojaBd_(nombre).getLastRow() + 1;
  escribirFila_(nombre, fila, valores);
  return fila;
}

function borrarFila_(nombre, fila) {
  hojaBd_(nombre).deleteRow(fila);
}

function reemplazarFilas_(nombre, filas) {
  const h = hojaBd_(nombre);
  const ancho = TABLAS_[nombre].length;
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, Math.max(ancho, h.getLastColumn())).clearContent();
  filas.forEach(function (valores, i) { escribirFila_(nombre, i + 2, valores); });
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
