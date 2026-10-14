/* El libro de Google Sheets del sistema (P110, P113): las hojas de cada ciclo y las del
   sistema, que están ocultas y solo escribe la cuenta propietaria (P112). En las hojas
   del sistema todas las celdas se guardan como texto plano para que Sheets no convierta
   «2026-1» en una fecha. */
var TABLAS_ = {
  _SYS_USUARIOS: ["correo", "rol", "carreras", "departamento"],
  _SYS_PLANES_ESTADO: ["ciclo", "carrera", "estado", "version", "actualizado_por", "actualizado_en", "totales",
                       "fila_version", "bloqueo_correo", "bloqueo_desde", "bloqueo_expira", "hoja_cambiada_en", "hoja_cambiada_por"],
  _SYS_VERSIONES: ["ciclo", "carrera", "n", "estado", "tipo", "usuario", "fecha", "motivo", "contenido"],
  _SYS_BITACORA: ["fecha", "usuario", "ciclo", "carrera", "accion", "version", "detalle"]
};

/* Una celda admite 50 000 caracteres; el contenido de una versión se reparte en
   celdas consecutivas a partir de la columna «contenido». */
var MAX_CELDA_ = 45000;

/* Las protecciones que pone el sistema llevan esta marca, para reconocerlas al rehacerlas. */
var MARCA_PROTECCION_ = "SISCargaLectiva";

var libroCache_ = null;

function libro_() {
  if (libroCache_) return libroCache_;
  const id = config_().libroId;
  if (!id) throw new Error("El sistema no está instalado: falta la propiedad SIS_LIBRO_ID. Ejecuta instalar() desde el editor del proyecto.");
  libroCache_ = SpreadsheetApp.openById(id);
  return libroCache_;
}

function hojaSys_(nombre) {
  const h = libro_().getSheetByName(nombre);
  if (!h) throw new Error("Falta la hoja «" + nombre + "» en el libro. Ejecuta instalar() desde el editor del proyecto.");
  return h;
}

/* Solo la cuenta propietaria escribe en la hoja (o en el rango): sus protecciones previas
   del sistema se quitan antes. */
function protegerSoloSistema_(objetivo, descripcion) {
  const p = objetivo.protect().setDescription(MARCA_PROTECCION_ + ": " + descripcion);
  p.removeEditors(p.getEditors());
  p.addEditor(Session.getEffectiveUser());
  if (p.canDomainEdit()) p.setDomainEdit(false);
  return p;
}

function quitarProtecciones_(hoja) {
  [SpreadsheetApp.ProtectionType.SHEET, SpreadsheetApp.ProtectionType.RANGE].forEach(function (tipo) {
    hoja.getProtections(tipo).forEach(function (p) {
      if (String(p.getDescription()).indexOf(MARCA_PROTECCION_) === 0) p.remove();
    });
  });
}

function prepararTablas_(libro) {
  Object.keys(TABLAS_).forEach(function (nombre) {
    const columnas = TABLAS_[nombre];
    const h = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
    if (columnas.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), columnas.length - h.getMaxColumns());
    h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).setNumberFormat("@");
    h.getRange(1, 1, 1, columnas.length).setValues([columnas]).setFontWeight("bold");
    h.setFrozenRows(1);
    quitarProtecciones_(h);
    protegerSoloSistema_(h, "hoja del sistema");
    if (!h.isSheetHidden()) h.hideSheet();
  });
}

/* Filas de datos como objetos con los campos de TABLAS_; _fila es su número de fila. */
function leerTabla_(nombre, columnas) {
  const h = hojaSys_(nombre);
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
  const h = hojaSys_(nombre);
  if (fila > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), fila - h.getMaxRows() + 50);
  if (valores.length > h.getMaxColumns()) h.insertColumnsAfter(h.getMaxColumns(), valores.length - h.getMaxColumns());
  h.getRange(fila, 1, 1, valores.length).setNumberFormat("@").setValues([valores.map(celdaTexto_)]);
}

function agregarFila_(nombre, valores) {
  const fila = hojaSys_(nombre).getLastRow() + 1;
  escribirFila_(nombre, fila, valores);
  return fila;
}

function borrarFila_(nombre, fila) {
  hojaSys_(nombre).deleteRow(fila);
}

function trocear_(texto) {
  const partes = [];
  for (let i = 0; i < texto.length; i += MAX_CELDA_) partes.push(texto.slice(i, i + MAX_CELDA_));
  return partes.length ? partes : [""];
}

/* Bitácora inmutable (RF-070): solo se añaden filas. */
function anotarBitacora_(usuario, ciclo, carrera, accion, version, detalle) {
  agregarFila_("_SYS_BITACORA", [new Date().toISOString(), usuario || "", ciclo || "", carrera || "", accion,
                                 version == null ? "" : String(version), String(detalle || "").slice(0, 5000)]);
}

/* Caché del script, compartida por todos los usuarios. Las claves llevan el ID del libro
   para que una reinstalación no sirva datos de la anterior. */
function cache_() {
  return CacheService.getScriptCache();
}

function claveCache_(tipo, resto) {
  return "sis:" + config_().libroId + ":" + tipo + ":" + resto;
}

function leerDeCache_(clave) {
  const v = cache_().get(clave);
  return v == null ? null : JSON.parse(v);
}

function guardarEnCache_(clave, valor, segundos) {
  try {
    cache_().put(clave, JSON.stringify(valor), segundos);
  } catch (e) {
    /* Un valor de más de 100 KB no cabe: se volverá a leer del libro. */
  }
}

/* Ejecuta fn con el candado del script, para que dos usuarios no escriban a la vez.
   No se anida: las funciones que se llaman dentro no vuelven a tomarlo. */
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
