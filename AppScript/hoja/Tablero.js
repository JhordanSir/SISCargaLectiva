// @ts-nocheck
/* ============================================================
   SISCargaLectiva · tablero «Inicio»: botones, estado de cada grupo y bitácora.
   Es la única pestaña con formato propio: no se envía a ningún lado.
   ============================================================ */
var TABLERO = {
  FILA_GRUPOS: 10,
  FILA_ENVIO: 15,
  FILA_BITACORA: 18,
  MAX_BITACORA: 200,
  ANCHOS: [18, 210, 270, 90, 140, 150, 100, 110, 115, 150, 18],
  BOTONES: [
    { clave: "traer", funcion: "botonTraer", col: 2, dx: 10 },
    { clave: "enviar", funcion: "botonEnviar", col: 3, dx: 110 },
    { clave: "panel", funcion: "botonPanel", col: 5, dx: 30 }
  ]
};

function construirInicio_(libro) {
  var h = libro.getSheetByName(CENTRO.INICIO);
  if (!h) {
    var vacia = libro.getSheets().filter(function (x) { return !grupoDeHoja_(x.getName()) && x.getLastRow() === 0; })[0];
    h = vacia ? vacia.setName(CENTRO.INICIO) : libro.insertSheet(CENTRO.INICIO, 0);
  }
  var bitacora = [];
  if (h.getLastRow() > TABLERO.FILA_BITACORA)
    bitacora = h.getRange(TABLERO.FILA_BITACORA + 1, 2, h.getLastRow() - TABLERO.FILA_BITACORA, 3).getValues();
  h.getImages().forEach(function (i) { i.remove(); });
  h.getRange(1, 1, h.getMaxRows(), h.getMaxColumns()).breakApart();
  h.clear();
  h.setConditionalFormatRules([]);
  if (h.getMaxColumns() > 11) h.deleteColumns(12, h.getMaxColumns() - 11);
  if (h.getMaxColumns() < 11) h.insertColumnsAfter(h.getMaxColumns(), 11 - h.getMaxColumns());
  if (h.getMaxRows() < 260) h.insertRowsAfter(h.getMaxRows(), 260 - h.getMaxRows());
  TABLERO.ANCHOS.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  for (var f = 1; f <= 20; f++) h.setRowHeight(f, 21);
  h.setHiddenGridlines(true);
  h.setTabColor(ESTILO.cabecera);
  h.getRange(1, 1, h.getMaxRows(), 11).setBackground("#FFFFFF").setFontColor(ESTILO.texto)
    .setFontFamily("Roboto").setFontSize(10).setFontWeight("normal").setFontStyle("normal").setVerticalAlignment("middle");

  /* Encabezado */
  h.setRowHeight(1, 56);
  h.getRange("B1:J1").merge().setValue("SISCargaLectiva · Centro de datos")
    .setBackground(ESTILO.cabecera).setFontColor("#FFFFFF").setFontSize(18).setFontWeight("bold").setHorizontalAlignment("left");
  h.setRowHeight(2, 26);
  h.getRange("B2:J2").merge().setValue("Edición de los archivos de la app con revisión de advertencias antes del envío.")
    .setFontColor(ESTILO.tenue).setHorizontalAlignment("left");
  h.setRowHeight(3, 10);

  /* Botones e instrucciones */
  [4, 5, 6].forEach(function (f) { h.setRowHeight(f, 26); });
  TABLERO.BOTONES.forEach(function (b) {
    var img = h.insertImage(Utilities.newBlob(Utilities.base64Decode(BOTONES[b.clave]), "image/png", b.clave + ".png"), b.col, 4, b.dx, 11);
    img.setWidth(240).setHeight(56).assignScript(b.funcion).setAltTextTitle(b.clave);
  });
  h.getRange("G4:J6").merge().setValue(
    "1. Traer datos: copia los tres Excel de la carpeta y los usuarios de la BD.\n" +
    "2. Editar: las celdas con advertencia se resaltan y su nota explica el motivo.\n" +
    "3. Enviar cambios: crea un .xlsx nuevo; el anterior pasa a «Anteriores».")
    .setWrap(true).setFontSize(9).setFontColor(ESTILO.tenue).setBackground("#F4F6F9").setVerticalAlignment("middle")
    .setBorder(true, true, true, true, false, false, ESTILO.borde, SpreadsheetApp.BorderStyle.SOLID);
  h.setRowHeight(7, 14);

  /* Estado de los datos */
  h.setRowHeight(8, 28);
  h.getRange("B8:J8").merge().setValue("Estado de los datos").setFontSize(12).setFontWeight("bold").setFontColor(ESTILO.cabecera);
  h.getRange("B9:J9").setValues([["Datos", "Fuente", "Pestañas", "Traído", "Cambios sin enviar", "Errores", "Advertencias", "Observaciones", "Estado"]])
    .setBackground("#E8ECF2").setFontColor(ESTILO.cabecera).setFontWeight("bold").setHorizontalAlignment("center")
    .setBorder(true, null, true, null, false, false, ESTILO.borde, SpreadsheetApp.BorderStyle.SOLID);
  h.getRange("B9:C9").setHorizontalAlignment("left");
  h.setRowHeight(9, 26);
  CENTRO.GRUPOS.forEach(function (g, i) {
    var f = TABLERO.FILA_GRUPOS + i;
    h.setRowHeight(f, 28);
    h.getRange(f, 2, 1, 9).setBorder(null, null, true, null, false, false, ESTILO.borde, SpreadsheetApp.BorderStyle.SOLID);
    h.getRange(f, 2).setFontWeight("bold").setFontColor(g.color);
    h.getRange(f, 4, 1, 7).setHorizontalAlignment("center");
    h.getRange(f, 7, 1, 3).setFontWeight("bold");
  });
  h.setRowHeight(14, 10);
  h.getRange(TABLERO.FILA_ENVIO, 2, 1, 9).merge().setFontColor(ESTILO.tenue).setFontStyle("italic");
  h.setRowHeight(16, 14);

  /* Bitácora */
  h.setRowHeight(17, 28);
  h.getRange("B17:J17").merge().setValue("Bitácora").setFontSize(12).setFontWeight("bold").setFontColor(ESTILO.cabecera);
  h.getRange(TABLERO.FILA_BITACORA, 2, 1, 3).setValues([["Fecha", "Acción", "Detalle"]]);
  h.getRange(TABLERO.FILA_BITACORA, 4, 1, 7).merge();
  h.getRange(TABLERO.FILA_BITACORA, 2, 1, 9).setBackground("#E8ECF2").setFontColor(ESTILO.cabecera).setFontWeight("bold");
  h.setFrozenRows(0);

  /* Resaltado de los contadores */
  var c = function (a1) { return h.getRange(a1); };
  var g0 = TABLERO.FILA_GRUPOS, g1 = g0 + CENTRO.GRUPOS.length - 1;
  var n = ESTILO.nivel;
  h.setConditionalFormatRules([
    reglaRev_("tab-error", "G" + g0 + ">0", [c("G" + g0 + ":G" + g1)], n.error.celda, n.error.texto, true),
    reglaRev_("tab-advertencia", "H" + g0 + ">0", [c("H" + g0 + ":H" + g1)], n.advertencia.celda, n.advertencia.texto, true),
    reglaRev_("tab-observacion", "I" + g0 + ">0", [c("I" + g0 + ":I" + g1)], n.observacion.celda, n.observacion.texto, true),
    reglaRev_("tab-cambios", "LEFT(F" + g0 + ",2)=\"Sí\"", [c("F" + g0 + ":F" + g1)], "#FEF7E0", n.advertencia.texto, true),
    reglaRev_("tab-estado-error", "J" + g0 + "=\"Con errores\"", [c("J" + g0 + ":J" + g1)], null, n.error.texto, true),
    reglaRev_("tab-estado-adv", "J" + g0 + "=\"Con advertencias\"", [c("J" + g0 + ":J" + g1)], null, n.advertencia.texto, true),
    reglaRev_("tab-estado-ok", "J" + g0 + "=\"Correcto\"", [c("J" + g0 + ":J" + g1)], null, "#1E6B34", true)
  ]);

  bitacora.filter(function (f) { return f[0] !== "" || f[1] !== ""; }).reverse().forEach(function (f) {
    escribirBitacora_(h, f[0], formalizar_(f[1]), formalizar_(f[2]));
  });
  return h;
}

/* Las entradas de la bitácora de la primera versión tenían íconos. */
function formalizar_(texto) {
  return String(texto).replace(/\u2B07 Traer/g, "Traer datos").replace(/\u2B06 Enviar/g, "Enviar cambios")
    .replace(/\u2705 /g, "Correcto. ").replace(/\u274C /g, "Error. ").replace(/ · (\d+ pestañas)/g, ", $1");
}

function estadoDe_(cuentas, pestanas) {
  if (!pestanas) return "Sin datos";
  return cuentas.error ? "Con errores" : cuentas.advertencia ? "Con advertencias" : "Correcto";
}

function actualizarTablero_(libro, r, meta) {
  var h = libro.getSheetByName(CENTRO.INICIO);
  if (!h) return;
  var f0 = TABLERO.FILA_GRUPOS;
  var actuales = h.getRange(f0, 2, CENTRO.GRUPOS.length, 9).getDisplayValues();
  var filas = CENTRO.GRUPOS.map(function (g, i) {
    var m = meta.grupos[g.id] || {};
    var c = r.cuentas[g.id] || { error: 0, advertencia: 0, observacion: 0 };
    var pestanas = r.pestanas[g.id] !== undefined ? r.pestanas[g.id] : +actuales[i][2] || 0;
    var cambios = actuales[i][4];
    if (r.hashes[g.id] !== undefined) cambios = !pestanas ? "—" : (!m.hash || r.hashes[g.id] !== m.hash ? "Sí, sin enviar" : "No");
    return [g.etiqueta, m.nombre || g.fuente, pestanas, legible_(m.traido), cambios, c.error, c.advertencia, c.observacion, estadoDe_(c, pestanas)];
  });
  h.getRange(f0, 2, filas.length, 9).setValues(filas);
  h.getRange(TABLERO.FILA_ENVIO, 2).setValue(meta.ultimoEnvio
    ? "Último envío a la app: " + legible_(meta.ultimoEnvio) + (meta.carpeta ? ". Los .xlsx se guardan en la carpeta «" + meta.carpeta + "»." : ".")
    : "Todavía no se ha enviado ningún cambio a la app desde este Centro.");
}

function bitacora_(libro, accion, detalle) {
  var h = libro.getSheetByName(CENTRO.INICIO);
  if (!h) return;
  var cuenta = "";
  try { cuenta = Session.getActiveUser().getEmail(); } catch (e) { cuenta = ""; }
  escribirBitacora_(h, Utilities.formatDate(new Date(), "America/Lima", "dd/MM/yyyy HH:mm"), accion, detalle + (cuenta ? "\nCuenta: " + cuenta : ""));
}

function escribirBitacora_(h, fecha, accion, detalle) {
  var f = TABLERO.FILA_BITACORA + 1;
  h.insertRowBefore(f);
  h.getRange(f, 2, 1, 3).setValues([[fecha, accion, detalle]]);
  h.getRange(f, 4, 1, 7).merge().setWrap(true);
  h.getRange(f, 2, 1, 9).setBackground("#FFFFFF").setFontColor(ESTILO.texto).setFontWeight("normal").setFontFamily("Roboto").setFontSize(9)
    .setVerticalAlignment("top").setBorder(null, null, true, null, false, false, ESTILO.borde, SpreadsheetApp.BorderStyle.SOLID);
  h.getRange(f, 3).setFontColor(ESTILO.cabecera).setFontWeight("bold");
  var sobra = h.getLastRow() - (TABLERO.FILA_BITACORA + TABLERO.MAX_BITACORA);
  if (sobra > 0) h.deleteRows(TABLERO.FILA_BITACORA + TABLERO.MAX_BITACORA + 1, sobra);
}
