// @ts-nocheck
/* ============================================================
   SISCargaLectiva · formato de revisión
   Todo lo que esta herramienta pinta es formato condicional con la marca «scl:» en su
   fórmula y notas que empiezan con «Revisión:». No toca los valores ni el formato propio
   de las celdas: quitarRevision_() lo borra todo y deja la hoja como vino del Excel.
   Lo usan el Centro de datos y la BD.
   ============================================================ */
var ESTILO = {
  cabecera: "#1F3A5F", cabeceraTexto: "#FFFFFF", texto: "#1F2933", tenue: "#5F6B7A", borde: "#D5DBE3", zebra: "#F6F8FB",
  nivel: {
    error: { celda: "#F4C7C3", texto: "#7A1F1A", fila: "#FCE8E6", nombre: "Error", plural: "Errores", descripcion: "la app rechaza o descarta el dato" },
    advertencia: { celda: "#FCE29A", texto: "#5A4300", fila: "#FEF7E0", nombre: "Advertencia", plural: "Advertencias", descripcion: "la app lo acepta, pero conviene revisarlo" },
    observacion: { celda: "#C6DAF7", texto: "#0B3A75", fila: "#EDF3FC", nombre: "Observación", plural: "Observaciones", descripcion: "no cambia lo que hace la app" }
  },
  destacado: {
    error: ["#E57373", "#F4C7C3"],
    advertencia: ["#F6C445", "#FCE29A"],
    observacion: ["#8AB4F8", "#C6DAF7"],
    corregida: ["#A8D5AE", "#E6F4EA"]
  },
  NOTA: "Revisión: ",
  SEPARADOR_NOTA: "\n\nRevisión: ",
  NOTAS_ANTERIORES: ["\u26A1 "],
  ORDEN: ["error", "advertencia", "observacion"]
};

/* ---------- formato condicional marcado ---------- */
function formulaRev_(etiqueta, expresion) {
  return "=AND(" + (expresion || "TRUE") + ",\"scl:" + etiqueta + "\"<>\"\")";
}

/* También reconoce la marca «ki:» de la primera versión, para poder reemplazarla. */
function esReglaRev_(regla) {
  var c = regla.getBooleanCondition();
  if (!c || c.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) return false;
  var f = String(c.getCriteriaValues()[0] || "");
  return f.indexOf("\"scl:") >= 0 || f.indexOf("\"ki:") >= 0;
}

function reglaRev_(etiqueta, expresion, rangos, fondo, texto, negrita) {
  var r = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formulaRev_(etiqueta, expresion)).setRanges(rangos);
  if (fondo) r.setBackground(fondo);
  if (texto) r.setFontColor(texto);
  if (negrita) r.setBold(true);
  return r.build();
}

/* La fila de cabeceras se resalta hasta la última columna con datos; el resto conserva
   el formato del Excel. */
function reglasTema_(hoja, filaCabecera) {
  var cab = Math.max(1, filaCabecera || 1);
  return [reglaRev_("cabecera", null, [hoja.getRange(cab, 1, 1, Math.max(1, hoja.getLastColumn()))], ESTILO.cabecera, ESTILO.cabeceraTexto, true)];
}

/* Celdas con advertencia (color del nivel) y su fila (un tono claro del mismo color). */
function reglasAvisos_(hoja, avisos) {
  var celdas = { error: {}, advertencia: {}, observacion: {} }, filas = { error: {}, advertencia: {}, observacion: {} };
  var nivelCelda = {}, nivelFila = {};
  var peor = function (a, b) { return !a || ESTILO.ORDEN.indexOf(b) < ESTILO.ORDEN.indexOf(a) ? b : a; };
  avisos.forEach(function (a) {
    var k = a.fila + ":" + a.col;
    nivelCelda[k] = peor(nivelCelda[k], a.nivel);
    nivelFila[a.fila] = peor(nivelFila[a.fila], a.nivel);
  });
  Object.keys(nivelCelda).forEach(function (k) { celdas[nivelCelda[k]][k] = true; });
  Object.keys(nivelFila).forEach(function (f) { filas[nivelFila[f]][f] = true; });
  var ancho = Math.max(1, hoja.getLastColumn());
  var reglas = [];
  ESTILO.ORDEN.forEach(function (n) {
    var lista = Object.keys(celdas[n]).map(function (k) { var p = k.split(":"); return hoja.getRange(+p[0], +p[1]); });
    if (lista.length) reglas.push(reglaRev_("celda-" + n, null, lista, ESTILO.nivel[n].celda, ESTILO.nivel[n].texto, true));
  });
  ESTILO.ORDEN.forEach(function (n) {
    var lista = Object.keys(filas[n]).map(function (f) { return hoja.getRange(+f, 1, 1, ancho); });
    if (lista.length) reglas.push(reglaRev_("fila-" + n, null, lista, ESTILO.nivel[n].fila, null));
  });
  return reglas;
}

/* Firma de lo que se pinta en una hoja: si no cambia, no se vuelve a pintar. Se calcula
   sin llamar a Google, para que una edición solo toque las pestañas que cambian. */
function firmaAvisos_(avisos, filaCabecera) {
  var partes = avisos.map(function (a) { return a.fila + ":" + a.col + ":" + a.nivel + ":" + a.mensaje; }).sort();
  var texto = "v4|" + filaCabecera + "#" + partes.join("\n");
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));
}

function claveFirma_(nombreHoja) { return "scl:firma:" + nombreHoja; }

/* Pinta la hoja con sus advertencias. firmas: las guardadas (de un getAll), para no
   consultar la caché una vez por pestaña; sin ellas se consulta aquí. Devuelve la firma
   nueva si tuvo que repintar, o null. */
function pintarRevision_(hoja, avisos, filaCabecera, forzar, firmas) {
  var cache = CacheService.getDocumentCache();
  var clave = claveFirma_(hoja.getName());
  var firma = firmaAvisos_(avisos, filaCabecera);
  var previa = firmas ? firmas[clave] : cache.get(clave);
  if (!forzar && previa === firma) return null;
  var ajenas = hoja.getConditionalFormatRules().filter(function (r) { return !esReglaRev_(r); });
  hoja.setConditionalFormatRules(reglasAvisos_(hoja, avisos).concat(reglasTema_(hoja, filaCabecera), ajenas));
  notasRev_(hoja, avisos);
  if (!firmas) cache.put(clave, firma, 21600);
  return firma;
}

/* ---------- notas «Revisión:» ---------- */
function esNotaRev_(t) {
  return t.indexOf(ESTILO.NOTA) === 0 || ESTILO.NOTAS_ANTERIORES.some(function (p) { return t.indexOf(p) === 0; });
}

/* La nota propia de la celda, sin lo que añadió la revisión. */
function sinNotaRev_(nota) {
  var t = String(nota || "");
  if (esNotaRev_(t)) return "";
  var cortes = [ESTILO.SEPARADOR_NOTA].concat(ESTILO.NOTAS_ANTERIORES.map(function (p) { return "\n\n" + p; }));
  for (var i = 0; i < cortes.length; i++) {
    var k = t.indexOf(cortes[i]);
    if (k >= 0) return t.slice(0, k);
  }
  return t;
}

function textoNotaRev_(lista) {
  return lista.map(function (a) { return ESTILO.NOTA + ESTILO.nivel[a.nivel].nombre + ". " + a.mensaje; }).join("\n");
}

function notasRev_(hoja, avisos) {
  var filas = Math.max(1, hoja.getLastRow()), cols = Math.max(1, hoja.getLastColumn());
  avisos.forEach(function (a) { filas = Math.max(filas, a.fila); cols = Math.max(cols, a.col); });
  var rango = hoja.getRange(1, 1, filas, cols);
  var antes = rango.getNotes();
  var porCelda = {};
  avisos.forEach(function (a) { var k = (a.fila - 1) + ":" + (a.col - 1); (porCelda[k] = porCelda[k] || []).push(a); });
  var cambio = false;
  var despues = antes.map(function (fila, i) {
    return fila.map(function (nota, j) {
      var propia = sinNotaRev_(nota), lista = porCelda[i + ":" + j];
      var nueva = lista ? (propia ? propia + "\n\n" + textoNotaRev_(lista) : textoNotaRev_(lista)) : propia;
      if (nueva !== nota) cambio = true;
      return nueva;
    });
  });
  if (cambio) rango.setNotes(despues);
}

/* Deja la hoja sin rastro de la revisión (antes de exportarla al .xlsx). */
function quitarRevision_(hoja) {
  hoja.setConditionalFormatRules(hoja.getConditionalFormatRules().filter(function (r) { return !esReglaRev_(r); }));
  var filas = hoja.getLastRow(), cols = hoja.getLastColumn();
  if (filas && cols) {
    var rango = hoja.getRange(1, 1, filas, cols);
    var antes = rango.getNotes(), cambio = false;
    var despues = antes.map(function (f) { return f.map(function (n) { var s = sinNotaRev_(n); if (s !== n) cambio = true; return s; }); });
    if (cambio) rango.setNotes(despues);
  }
  hoja.setTabColor(null);
}

/* ---------- reacción a la edición ---------- */
/* Destaca un instante las filas editadas con el color de su nivel: una regla temporal
   al frente que se quita al terminar. */
function destacarFilas_(hoja, filas, tono) {
  var cuadros = ESTILO.destacado[tono] || ESTILO.destacado.error;
  var base = hoja.getConditionalFormatRules();
  var ancho = Math.max(1, hoja.getLastColumn());
  var rangos = filas.slice(0, 5).map(function (f) { return hoja.getRange(f, 1, 1, ancho); });
  if (!rangos.length) return;
  try {
    cuadros.forEach(function (color) {
      hoja.setConditionalFormatRules([reglaRev_("destacado", null, rangos, color, null)].concat(base));
      SpreadsheetApp.flush();
      Utilities.sleep(150);
    });
  } finally {
    hoja.setConditionalFormatRules(base);
    SpreadsheetApp.flush();
  }
}

/* Compara las advertencias de las filas editadas antes y después de la edición: si
   aparece una nueva, la destaca y la explica en un aviso; si se corrigieron, lo indica. */
function reaccionarEdicion_(libro, hoja, filas, antes, despues) {
  var nombre = hoja.getName();
  var enFilas = function (l) { return l.filter(function (a) { return a.hoja === nombre && filas.indexOf(a.fila) >= 0; }); };
  var clave = function (a) { return a.fila + ":" + a.col + ":" + a.codigo + ":" + a.mensaje; };
  var previas = {};
  enFilas(antes || []).forEach(function (a) { previas[clave(a)] = true; });
  var ahora = Reglas.ordenar(enFilas(despues));
  var nuevas = ahora.filter(function (a) { return !previas[clave(a)]; });
  if (nuevas.length) {
    var a = nuevas[0];
    libro.toast(a.mensaje + (nuevas.length > 1 ? " (" + (nuevas.length - 1) + " más en el panel de advertencias)" : ""),
      ESTILO.nivel[a.nivel].nombre + " en la fila " + a.fila, 6);
    destacarFilas_(hoja, filas, a.nivel);
  } else if (!ahora.length && Object.keys(previas).length) {
    libro.toast(filas.length > 1 ? "Las filas editadas ya no tienen advertencias." : "La fila " + filas[0] + " ya no tiene advertencias.", "Advertencia corregida", 4);
    destacarFilas_(hoja, filas, "corregida");
  }
}

/* ---------- panel de advertencias ---------- */
function datosPanel_(avisos, titulo) {
  var cuentas = { error: 0, advertencia: 0, observacion: 0 };
  avisos.forEach(function (a) { cuentas[a.nivel]++; });
  return {
    titulo: titulo,
    generado: Utilities.formatDate(new Date(), "America/Lima", "HH:mm:ss"),
    total: avisos.length, cuentas: cuentas,
    items: Reglas.ordenar(avisos.slice()).slice(0, 500).map(function (a) {
      return { hoja: a.hoja, a1: columnaA1_(a.col) + a.fila, nivel: a.nivel, codigo: a.codigo, mensaje: a.mensaje };
    })
  };
}

function columnaA1_(c) {
  var s = "";
  for (var n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

/* El panel lleva a la celda de una advertencia. */
function irA(hoja, a1) {
  var h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(hoja);
  if (!h) return false;
  h.activate();
  h.getRange(a1).activate();
  return true;
}

function abrirPanel_(titulo, modo) {
  var t = HtmlService.createTemplateFromFile("Panel");
  t.titulo = titulo;
  t.modo = modo;
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle("Panel de advertencias"));
}

/* ---------- utilidades ---------- */
function valoresHoja_(hoja) {
  var filas = hoja.getLastRow(), cols = hoja.getLastColumn();
  if (!filas || !cols) return [];
  return hoja.getRange(1, 1, filas, cols).getDisplayValues();
}

function guardarAvisos_(clave, avisos) {
  try { CacheService.getDocumentCache().put(clave, JSON.stringify(avisos), 21600); } catch (e) { /* demasiado grande: el panel recalcula */ }
}

function leerAvisos_(clave) {
  var t = CacheService.getDocumentCache().get(clave);
  try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
}
