// @ts-check
/* Entradas del panel de advertencias de la hoja (hoja/Panel.html, la barra lateral). */

/**
 * Las advertencias de la última revisión (de la caché que deja cada edición) o, si no hay,
 * las que da una revisión nueva.
 * @returns {Respuesta<DatosPanel>}
 */
function panelObtener() {
  return responder_(function () {
    exigirHoja_();
    let avisos = avisosGuardadosHoja_();
    if (!avisos) avisos = revisarHoja_(SpreadsheetApp.getActiveSpreadsheet(), TIPOS_REVISADOS_, null, false).avisos;
    return datosPanel_(avisos);
  });
}

/**
 * Botón «Actualizar»: revisa y repinta todas las pestañas de datos.
 * @returns {Respuesta<DatosPanel>}
 */
function panelActualizar() {
  return responder_(function () {
    exigirHoja_();
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    const r = revisarHoja_(libro, TIPOS_REVISADOS_, null, true);
    actualizarInicio_(libro, r);
    return datosPanel_(r.avisos);
  });
}

/**
 * Lleva a la celda de una advertencia.
 * @param {string} hoja Nombre de una pestaña de datos.
 * @param {string} a1 Celda, como «C12».
 * @returns {Respuesta<boolean>}
 */
function panelIrA(hoja, a1) {
  return responder_(function () {
    exigirHoja_();
    if (!tipoDePestana_(String(hoja)) || !/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(String(a1)))
      fallo_("DATO_INVALIDO", "La celda pedida no es de una pestaña de datos.");
    const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(String(hoja));
    if (!h) return false;
    h.activate();
    h.getRange(String(a1)).activate();
    return true;
  });
}

/**
 * Lo que muestra el panel: cuentas por nivel y hasta 500 advertencias ordenadas.
 * @param {AvisoCelda[]} avisos
 * @returns {DatosPanel}
 */
function datosPanel_(avisos) {
  const cuentas = { error: 0, advertencia: 0, observacion: 0 };
  avisos.forEach(function (a) { cuentas[a.nivel]++; });
  return {
    generado: Utilities.formatDate(new Date(), "America/Lima", "HH:mm:ss"),
    total: avisos.length, cuentas: cuentas,
    items: ordenarAvisosHoja_(avisos.slice()).slice(0, 500).map(function (a) {
      return { hoja: a.hoja, a1: columnaA1_(a.col) + a.fila, nivel: a.nivel, codigo: a.codigo, mensaje: a.mensaje };
    })
  };
}

/**
 * Letra de una columna: 1 → A, 27 → AA.
 * @param {number} c
 * @returns {string}
 */
function columnaA1_(c) {
  let s = "";
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
