// @ts-check
/* Cómo se ven las advertencias en las pestañas de datos. Todo lo que se pinta es formato
   condicional con la marca «scl:» en su fórmula y notas que empiezan con «Revisión:»: no se
   tocan los valores ni el formato propio de las celdas. */

var ESTILO_HOJA_ = {
  cabecera: "#1F3A5F", cabeceraTexto: "#FFFFFF", texto: "#1F2933", tenue: "#5F6B7A", borde: "#D5DBE3",
  nivel: {
    error: { celda: "#F4C7C3", texto: "#7A1F1A", fila: "#FCE8E6", nombre: "Error" },
    advertencia: { celda: "#FCE29A", texto: "#5A4300", fila: "#FEF7E0", nombre: "Advertencia" },
    observacion: { celda: "#C6DAF7", texto: "#0B3A75", fila: "#EDF3FC", nombre: "Observación" }
  },
  destacado: {
    error: ["#E57373", "#F4C7C3"],
    advertencia: ["#F6C445", "#FCE29A"],
    observacion: ["#8AB4F8", "#C6DAF7"],
    corregida: ["#A8D5AE", "#E6F4EA"]
  },
  NOTA: "Revisión: ",
  SEPARADOR_NOTA: "\n\nRevisión: "
};

/* ---------- formato condicional marcado ---------- */

/**
 * Fórmula de una regla de la revisión: la marca «scl:etiqueta» la distingue de las reglas
 * propias de la hoja.
 * @param {string} etiqueta
 * @param {string|null} expresion
 * @returns {string}
 */
function formulaRevision_(etiqueta, expresion) {
  return "=AND(" + (expresion || "TRUE") + ",\"scl:" + etiqueta + "\"<>\"\")";
}

/**
 * ¿Es una regla de la revisión? También reconoce la marca «ki:» de la primera versión del
 * Centro de datos, para reemplazarla.
 * @param {GoogleAppsScript.Spreadsheet.ConditionalFormatRule} regla
 * @returns {boolean}
 */
function esReglaRevision_(regla) {
  const c = regla.getBooleanCondition();
  if (!c || c.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) return false;
  const f = String(c.getCriteriaValues()[0] || "");
  return f.indexOf("\"scl:") >= 0 || f.indexOf("\"ki:") >= 0;
}

/**
 * Regla de formato condicional de la revisión.
 * @param {string} etiqueta
 * @param {string|null} expresion
 * @param {GoogleAppsScript.Spreadsheet.Range[]} rangos
 * @param {string|null} fondo
 * @param {string|null} texto
 * @param {boolean=} negrita
 * @returns {GoogleAppsScript.Spreadsheet.ConditionalFormatRule}
 */
function reglaRevision_(etiqueta, expresion, rangos, fondo, texto, negrita) {
  const r = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formulaRevision_(etiqueta, expresion)).setRanges(rangos);
  if (fondo) r.setBackground(fondo);
  if (texto) r.setFontColor(texto);
  if (negrita) r.setBold(true);
  return r.build();
}

/**
 * La fila de cabeceras se resalta hasta la última columna con datos; el resto conserva su
 * formato.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {number} filaCabecera Desde 1.
 * @returns {GoogleAppsScript.Spreadsheet.ConditionalFormatRule[]}
 */
function reglasCabecera_(hoja, filaCabecera) {
  const cab = Math.max(1, filaCabecera || 1);
  return [reglaRevision_("cabecera", null, [hoja.getRange(cab, 1, 1, Math.max(1, hoja.getLastColumn()))], ESTILO_HOJA_.cabecera, ESTILO_HOJA_.cabeceraTexto, true)];
}

/**
 * Celdas con advertencia (el color de su nivel más grave) y su fila (un tono claro del
 * mismo color).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {AvisoCelda[]} avisos
 * @returns {GoogleAppsScript.Spreadsheet.ConditionalFormatRule[]}
 */
function reglasAvisos_(hoja, avisos) {
  const celdas = { error: {}, advertencia: {}, observacion: {} }, filas = { error: {}, advertencia: {}, observacion: {} };
  const nivelCelda = {}, nivelFila = {};
  const peor = function (a, b) { return !a || NIVELES_HOJA_.indexOf(b) < NIVELES_HOJA_.indexOf(a) ? b : a; };
  avisos.forEach(function (a) {
    const k = a.fila + ":" + a.col;
    nivelCelda[k] = peor(nivelCelda[k], a.nivel);
    nivelFila[a.fila] = peor(nivelFila[a.fila], a.nivel);
  });
  Object.keys(nivelCelda).forEach(function (k) { celdas[nivelCelda[k]][k] = true; });
  Object.keys(nivelFila).forEach(function (f) { filas[nivelFila[f]][f] = true; });
  const ancho = Math.max(1, hoja.getLastColumn());
  const reglas = [];
  NIVELES_HOJA_.forEach(function (n) {
    const lista = Object.keys(celdas[n]).map(function (k) { const p = k.split(":"); return hoja.getRange(+p[0], +p[1]); });
    if (lista.length) reglas.push(reglaRevision_("celda-" + n, null, lista, ESTILO_HOJA_.nivel[n].celda, ESTILO_HOJA_.nivel[n].texto, true));
  });
  NIVELES_HOJA_.forEach(function (n) {
    const lista = Object.keys(filas[n]).map(function (f) { return hoja.getRange(+f, 1, 1, ancho); });
    if (lista.length) reglas.push(reglaRevision_("fila-" + n, null, lista, ESTILO_HOJA_.nivel[n].fila, null));
  });
  return reglas;
}

/**
 * Firma de lo que se pinta en una pestaña: si no cambia, no se vuelve a pintar. Se calcula
 * sin llamar a Google, para que una edición solo toque las pestañas que cambian.
 * @param {AvisoCelda[]} avisos
 * @param {number} filaCabecera
 * @returns {string}
 */
function firmaAvisos_(avisos, filaCabecera) {
  const partes = avisos.map(function (a) { return a.fila + ":" + a.col + ":" + a.nivel + ":" + a.mensaje; }).sort();
  return Dominio.hash("v5|" + filaCabecera + "#" + partes.join("\n"));
}

/**
 * Clave de caché de la firma pintada en una pestaña.
 * @param {string} nombreHoja
 * @returns {string}
 */
function claveFirmaPestana_(nombreHoja) { return "scl:firma:" + nombreHoja; }

/**
 * Pinta la pestaña con sus advertencias si cambiaron (o con forzar). firmas: las guardadas,
 * leídas de una vez para no consultar la caché por cada pestaña. Devuelve la firma nueva si
 * tuvo que repintar, o null.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {AvisoCelda[]} avisos
 * @param {number} filaCabecera
 * @param {boolean} forzar
 * @param {Object<string, string>} firmas
 * @returns {string|null}
 */
function pintarRevision_(hoja, avisos, filaCabecera, forzar, firmas) {
  const firma = firmaAvisos_(avisos, filaCabecera);
  if (!forzar && firmas[claveFirmaPestana_(hoja.getName())] === firma) return null;
  const ajenas = hoja.getConditionalFormatRules().filter(function (r) { return !esReglaRevision_(r); });
  hoja.setConditionalFormatRules(reglasAvisos_(hoja, avisos).concat(reglasCabecera_(hoja, filaCabecera), ajenas));
  notasRevision_(hoja, avisos);
  return firma;
}

/* ---------- notas «Revisión:» ---------- */

/**
 * La nota propia de la celda, sin lo que añadió la revisión.
 * @param {string} nota
 * @returns {string}
 */
function sinNotaRevision_(nota) {
  const t = String(nota || "");
  if (t.indexOf(ESTILO_HOJA_.NOTA) === 0) return "";
  const k = t.indexOf(ESTILO_HOJA_.SEPARADOR_NOTA);
  return k >= 0 ? t.slice(0, k) : t;
}

/**
 * Texto de la nota de una celda con sus advertencias.
 * @param {AvisoCelda[]} lista
 * @returns {string}
 */
function textoNotaRevision_(lista) {
  return lista.map(function (a) { return ESTILO_HOJA_.NOTA + ESTILO_HOJA_.nivel[a.nivel].nombre + ". " + a.mensaje; }).join("\n");
}

/**
 * Escribe en la nota de cada celda sus advertencias y quita las que ya no tiene, sin tocar
 * la nota propia de la celda.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {AvisoCelda[]} avisos
 * @returns {void}
 */
function notasRevision_(hoja, avisos) {
  let filas = Math.max(1, hoja.getLastRow()), cols = Math.max(1, hoja.getLastColumn());
  avisos.forEach(function (a) { filas = Math.max(filas, a.fila); cols = Math.max(cols, a.col); });
  const rango = hoja.getRange(1, 1, filas, cols);
  const antes = rango.getNotes();
  const porCelda = {};
  avisos.forEach(function (a) { const k = (a.fila - 1) + ":" + (a.col - 1); (porCelda[k] = porCelda[k] || []).push(a); });
  let cambio = false;
  const despues = antes.map(function (fila, i) {
    return fila.map(function (nota, j) {
      const propia = sinNotaRevision_(nota), lista = porCelda[i + ":" + j];
      const nueva = lista ? (propia ? propia + "\n\n" + textoNotaRevision_(lista) : textoNotaRevision_(lista)) : propia;
      if (nueva !== nota) cambio = true;
      return nueva;
    });
  });
  if (cambio) rango.setNotes(despues);
}

/* ---------- reacción a la edición ---------- */

/**
 * Destaca un instante las filas editadas con el color de su nivel: una regla temporal al
 * frente que se quita al terminar.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {number[]} filas
 * @param {string} tono Un nivel o «corregida».
 * @returns {void}
 */
function destacarFilas_(hoja, filas, tono) {
  const colores = ESTILO_HOJA_.destacado[tono] || ESTILO_HOJA_.destacado.error;
  const base = hoja.getConditionalFormatRules();
  const ancho = Math.max(1, hoja.getLastColumn());
  const rangos = filas.slice(0, 5).map(function (f) { return hoja.getRange(f, 1, 1, ancho); });
  if (!rangos.length) return;
  try {
    colores.forEach(function (color) {
      hoja.setConditionalFormatRules([reglaRevision_("destacado", null, rangos, color, null)].concat(base));
      SpreadsheetApp.flush();
      Utilities.sleep(150);
    });
  } finally {
    hoja.setConditionalFormatRules(base);
    SpreadsheetApp.flush();
  }
}

/**
 * Compara las advertencias de las filas editadas antes y después de la edición: si aparece
 * una nueva, la destaca y la explica en un aviso; si se corrigieron, lo indica.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @param {number[]} filas
 * @param {AvisoCelda[]} antes
 * @param {AvisoCelda[]} despues
 * @returns {void}
 */
function reaccionarEdicion_(libro, hoja, filas, antes, despues) {
  const nombre = hoja.getName();
  const enFilas = function (l) { return l.filter(function (a) { return a.hoja === nombre && filas.indexOf(a.fila) >= 0; }); };
  const clave = function (a) { return a.fila + ":" + a.col + ":" + a.codigo + ":" + a.mensaje; };
  const previas = {};
  enFilas(antes).forEach(function (a) { previas[clave(a)] = true; });
  const ahora = ordenarAvisosHoja_(enFilas(despues));
  const nuevas = ahora.filter(function (a) { return !previas[clave(a)]; });
  if (nuevas.length) {
    const a = nuevas[0];
    libro.toast(a.mensaje + (nuevas.length > 1 ? " (" + (nuevas.length - 1) + " más en el panel de advertencias)" : ""),
      ESTILO_HOJA_.nivel[a.nivel].nombre + " en la fila " + a.fila, 6);
    destacarFilas_(hoja, filas, a.nivel);
  } else if (!ahora.length && Object.keys(previas).length) {
    libro.toast(filas.length > 1 ? "Las filas editadas ya no tienen advertencias." : "La fila " + filas[0] + " ya no tiene advertencias.", "Advertencia corregida", 4);
    destacarFilas_(hoja, filas, "corregida");
  }
}
