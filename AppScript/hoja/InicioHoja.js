// @ts-check
/* Preparación de la hoja del sistema y su pestaña «Inicio»: qué es la hoja, el botón del
   panel de advertencias, el estado de cada tipo de datos y cuándo los leyó la app por
   última vez. Inicio es la única pestaña con formato propio. */

var INICIO_HOJA_ = {
  NOMBRE: "Inicio",
  FILA_TIPOS: 10,
  FILA_LECTURA: 15,
  FILA_BITACORA: 19,
  ANCHOS: [18, 210, 90, 100, 110, 115, 150, 18],
  /* Las fórmulas del formato condicional separan con comas, como en esta configuración. */
  CONFIGURACION_REGIONAL: "es_MX"
};

/* Imagen del botón «Panel de advertencias» (PNG en base64). */
var BOTON_PANEL_ = "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";

/**
 * Deja lista la hoja del sistema para editarla: zona horaria y configuración regional,
 * Inicio, la pestaña Usuarios, el color y el orden de las pestañas de datos y su revisión.
 * La llama instalar().
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {void}
 */
function prepararHojaDatos_(libro) {
  libro.setSpreadsheetTimeZone("America/Lima");
  if (libro.getSpreadsheetLocale() !== INICIO_HOJA_.CONFIGURACION_REGIONAL) libro.setSpreadsheetLocale(INICIO_HOJA_.CONFIGURACION_REGIONAL);
  construirInicio_(libro);
  prepararUsuarios_(libro);
  ordenarPestanas_(libro);
  actualizarInicio_(libro, revisarHoja_(libro, TIPOS_REVISADOS_, null, true));
}

/**
 * Anchos de columna y validación del rol en la pestaña Usuarios.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {void}
 */
function prepararUsuarios_(libro) {
  const h = libro.getSheetByName(TABLA_.USUARIOS);
  if (!h) return;
  [260, 120, 240, 140].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  const dv = SpreadsheetApp.newDataValidation().requireValueInList(["director", "coordinador"], true).setAllowInvalid(true)
    .setHelpText("director (asigna docentes de su departamento) o coordinador (edita el plan de sus carreras)").build();
  h.getRange(2, 2, h.getMaxRows() - 1, 1).setDataValidation(dv);
}

/**
 * Orden de las pestañas: Inicio, Usuarios y las de datos por tipo, cada tipo con su color.
 * Las tablas ocultas del sistema quedan detrás, donde estén.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {void}
 */
function ordenarPestanas_(libro) {
  const hojas = libro.getSheets();
  const orden = [INICIO_HOJA_.NOMBRE, TABLA_.USUARIOS];
  TIPOS_FUENTE_.forEach(function (t) {
    hojas.forEach(function (h) { if (tipoDePestana_(h.getName()) === t) orden.push(h.getName()); });
  });
  orden.forEach(function (nombre, i) {
    const h = libro.getSheetByName(nombre);
    if (!h) return;
    const tipo = tipoDePestana_(nombre);
    if (tipo) h.setTabColor(PESTANAS_DATOS_[tipo].color);
    libro.setActiveSheet(h);
    libro.moveActiveSheet(i + 1);
  });
  const inicio = libro.getSheetByName(INICIO_HOJA_.NOMBRE);
  if (inicio) libro.setActiveSheet(inicio);
}

/**
 * Bitácora de «Traer datos» y «Enviar cambios» que dejó el Centro de datos en Inicio
 * (fecha, acción y detalle), para conservarla al rehacer la pestaña.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} h
 * @returns {string[][]}
 */
function bitacoraAnterior_(h) {
  for (let f = 1; f <= Math.min(h.getLastRow(), 30); f++) {
    if (!/^Bit[aá]cora/.test(String(h.getRange(f, 2).getDisplayValue()))) continue;
    const desde = f + 2;
    if (h.getLastRow() < desde) return [];
    return h.getRange(desde, 2, h.getLastRow() - desde + 1, 3).getDisplayValues()
      .filter(function (x) { return x[0] !== "" || x[1] !== ""; });
  }
  return [];
}

/**
 * Arma la pestaña Inicio desde cero. Si tenía la bitácora de «Traer datos» y «Enviar
 * cambios» del Centro de datos, la conserva al final como «Bitácora anterior».
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function construirInicio_(libro) {
  const h = libro.getSheetByName(INICIO_HOJA_.NOMBRE) || libro.insertSheet(INICIO_HOJA_.NOMBRE, 0);
  const bitacora = bitacoraAnterior_(h);
  const B = INICIO_HOJA_.FILA_BITACORA, cols = INICIO_HOJA_.ANCHOS.length;

  h.getImages().forEach(function (i) { i.remove(); });
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).breakApart();
  h.clear();
  h.setConditionalFormatRules([]);
  if (h.getMaxColumns() > cols) h.deleteColumns(cols + 1, h.getMaxColumns() - cols);
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns());
  const filasMin = B + bitacora.length + 20;
  if (h.getMaxRows() < filasMin) h.insertRowsAfter(h.getMaxRows(), filasMin - h.getMaxRows());
  INICIO_HOJA_.ANCHOS.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  for (let f = 1; f <= 20; f++) h.setRowHeight(f, 21);
  h.setHiddenGridlines(true);
  h.setTabColor(ESTILO_HOJA_.cabecera);
  h.getRange(1, 1, h.getMaxRows(), cols).setBackground("#FFFFFF").setFontColor(ESTILO_HOJA_.texto)
    .setFontFamily("Roboto").setFontSize(10).setFontWeight("normal").setFontStyle("normal").setVerticalAlignment("middle");

  /* Encabezado */
  h.setRowHeight(1, 56);
  h.getRange("B1:G1").merge().setValue("SISCargaLectiva · " + libro.getName())
    .setBackground(ESTILO_HOJA_.cabecera).setFontColor("#FFFFFF").setFontSize(18).setFontWeight("bold").setHorizontalAlignment("left");
  h.setRowHeight(2, 26);
  h.getRange("B2:G2").merge().setValue("Hoja del sistema: la app lee de aquí la oferta, la carga por departamento, los docentes y las cuentas.")
    .setFontColor(ESTILO_HOJA_.tenue).setHorizontalAlignment("left");
  h.setRowHeight(3, 10);

  /* Botón e instrucciones */
  [4, 5, 6].forEach(function (f) { h.setRowHeight(f, 26); });
  const img = h.insertImage(Utilities.newBlob(Utilities.base64Decode(BOTON_PANEL_), "image/png", "panel.png"), 2, 4, 10, 11);
  img.setWidth(240).setHeight(56).assignScript("menuAbrirPanel").setAltTextTitle("Panel de advertencias");
  h.getRange("D4:G6").merge().setValue(
    "1. Edita las pestañas «Oferta - …», «Carga - …», «Docentes - General» y «Usuarios».\n" +
    "2. Las celdas con advertencia se resaltan y su nota explica el motivo.\n" +
    "3. La app lee los cambios en unos minutos, o al pulsar «Releer la hoja» en su tablero.")
    .setWrap(true).setFontSize(9).setFontColor(ESTILO_HOJA_.tenue).setBackground("#F4F6F9").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, false, false, ESTILO_HOJA_.borde, SpreadsheetApp.BorderStyle.SOLID);
  h.setRowHeight(7, 14);

  /* Estado de los datos */
  h.setRowHeight(8, 28);
  h.getRange("B8:G8").merge().setValue("Estado de los datos").setFontSize(12).setFontWeight("bold").setFontColor(ESTILO_HOJA_.cabecera);
  h.getRange("B9:G9").setValues([["Datos", "Pestañas", "Errores", "Advertencias", "Observaciones", "Estado"]])
    .setBackground("#E8ECF2").setFontColor(ESTILO_HOJA_.cabecera).setFontWeight("bold").setHorizontalAlignment("center")
    .setBorder(true, null, true, null, false, false, ESTILO_HOJA_.borde, SpreadsheetApp.BorderStyle.SOLID);
  h.getRange("B9").setHorizontalAlignment("left");
  h.setRowHeight(9, 26);
  TIPOS_REVISADOS_.forEach(function (t, i) {
    const f = INICIO_HOJA_.FILA_TIPOS + i;
    h.setRowHeight(f, 28);
    h.getRange(f, 2, 1, 6).setBorder(null, null, true, null, false, false, ESTILO_HOJA_.borde, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(f, 2).setValue(PESTANAS_DATOS_[t].etiqueta).setFontWeight("bold").setFontColor(PESTANAS_DATOS_[t].color);
    h.getRange(f, 3, 1, 5).setHorizontalAlignment("center");
    h.getRange(f, 4, 1, 3).setFontWeight("bold");
  });
  h.setRowHeight(14, 10);
  h.getRange(INICIO_HOJA_.FILA_LECTURA, 2, 1, 6).merge().setFontColor(ESTILO_HOJA_.tenue).setFontStyle("italic");
  let url = "";
  try { url = ScriptApp.getService().getUrl() || ""; } catch (e) { url = ""; }
  h.getRange(INICIO_HOJA_.FILA_LECTURA + 1, 2, 1, 6).merge().setFontColor(ESTILO_HOJA_.tenue)
    .setValue(url ? "Enlace de la app: " + url : "La app todavía no está implementada como aplicación web.");

  /* Resaltado de los contadores */
  const g0 = INICIO_HOJA_.FILA_TIPOS, g1 = g0 + TIPOS_REVISADOS_.length - 1, n = ESTILO_HOJA_.nivel;
  const columna = function (letra) { return [h.getRange(letra + g0 + ":" + letra + g1)]; };
  h.setConditionalFormatRules([
    reglaRevision_("tab-error", "D" + g0 + ">0", columna("D"), n.error.celda, n.error.texto, true),
    reglaRevision_("tab-advertencia", "E" + g0 + ">0", columna("E"), n.advertencia.celda, n.advertencia.texto, true),
    reglaRevision_("tab-observacion", "F" + g0 + ">0", columna("F"), n.observacion.celda, n.observacion.texto, true),
    reglaRevision_("tab-estado-error", "G" + g0 + "=\"Con errores\"", columna("G"), null, n.error.texto, true),
    reglaRevision_("tab-estado-adv", "G" + g0 + "=\"Con advertencias\"", columna("G"), null, n.advertencia.texto, true),
    reglaRevision_("tab-estado-ok", "G" + g0 + "=\"Correcto\"", columna("G"), null, "#1E6B34", true)
  ]);

  if (bitacora.length) {
    h.getRange(B - 1, 2, 1, 6).merge().setValue("Bitácora anterior (Traer y Enviar del Centro de datos)")
      .setFontSize(12).setFontWeight("bold").setFontColor(ESTILO_HOJA_.cabecera);
    h.getRange(B, 2, 1, 6).setBackground("#E8ECF2").setFontColor(ESTILO_HOJA_.cabecera).setFontWeight("bold");
    h.getRange(B, 2, 1, 3).setValues([["Fecha", "Acción", "Detalle"]]);
    h.getRange(B + 1, 2, bitacora.length, 3).setNumberFormat("@").setValues(bitacora);
    h.getRange(B + 1, 2, bitacora.length, 6).setFontSize(9).setVerticalAlignment("top").setWrap(true);
  }
  return h;
}

/**
 * Estado de cada tipo de datos según la revisión.
 * @param {Object<NivelHoja, number>} cuentas
 * @param {number} pestanas
 * @returns {string}
 */
function estadoDeTipo_(cuentas, pestanas) {
  if (!pestanas) return "Sin datos";
  return cuentas.error ? "Con errores" : cuentas.advertencia ? "Con advertencias" : "Correcto";
}

/**
 * Escribe en Inicio las cuentas de la revisión y cuándo leyó la app las pestañas. Lee
 * Fuentes del propio libro: desde onEdit no se puede abrir la hoja por su id.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {{pestanas: Object<string, number>, cuentas: Object<string, Object<NivelHoja, number>>}} r
 * @returns {void}
 */
function actualizarInicio_(libro, r) {
  const h = libro.getSheetByName(INICIO_HOJA_.NOMBRE);
  if (!h) return;
  const f0 = INICIO_HOJA_.FILA_TIPOS;
  const actuales = h.getRange(f0, 3, TIPOS_REVISADOS_.length, 1).getDisplayValues();
  const filas = TIPOS_REVISADOS_.map(function (t, i) {
    const c = r.cuentas[t] || { error: 0, advertencia: 0, observacion: 0 };
    const pestanas = r.pestanas[t] !== undefined ? r.pestanas[t] : +actuales[i][0] || 0;
    return [pestanas, c.error, c.advertencia, c.observacion, estadoDeTipo_(c, pestanas)];
  });
  h.getRange(f0, 3, filas.length, 5).setValues(filas);

  const fuentes = libro.getSheetByName(TABLA_.FUENTES);
  let leido = "";
  if (fuentes && fuentes.getLastRow() > 1) {
    const col = TABLAS_.Fuentes.indexOf("procesado_en") + 1;
    leido = fuentes.getRange(2, col, fuentes.getLastRow() - 1, 1).getValues()
      .map(function (v) { return String(v[0] || ""); }).sort().pop() || "";
  }
  const t = Date.parse(leido);
  h.getRange(INICIO_HOJA_.FILA_LECTURA, 2).setValue(isFinite(t)
    ? "La app leyó estas pestañas por última vez el " + Utilities.formatDate(new Date(t), "America/Lima", "dd/MM/yyyy 'a las' HH:mm") + "."
    : "La app todavía no ha leído estas pestañas.");
}
