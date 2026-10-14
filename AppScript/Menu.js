/* Menú «🎓 SISCargaLectiva» y panel lateral del libro (RF-084, RF-101; P138, P141). Lo
   que se ejecuta desde aquí corre con la cuenta de quien hace clic, que no puede escribir
   en las celdas protegidas ni en las hojas del sistema. Por eso las acciones se envían a la
   aplicación web publicada (doPost, en Principal.js), que corre como la cuenta propietaria
   y comprueba la identidad y los permisos de quien llama (RNF-13). El menú necesita esa
   aplicación publicada; su dirección se guarda sola en SIS_URL_WEB la primera vez que
   alguien la abre. */

var TITULO_MENU_ = "🎓 SISCargaLectiva";

var MENSAJE_SIN_WEB_ = "El menú necesita la aplicación web publicada. En el editor del proyecto, elige " +
  "Implementar → Nueva implementación → Aplicación web (ejecutar como tú, acceso para el dominio), " +
  "ábrela una vez con su dirección y vuelve a intentarlo.";

/* Acciones que el panel puede pedir a la aplicación web. */
var ACCIONES_PANEL_ = ["datosPanel", "consolidarHoja", "terminarEdicionHoja", "restaurarVersion", "datosReemplazo", "registrarReemplazo"];

function onOpen() {
  SpreadsheetApp.getUi().createMenu(TITULO_MENU_)
    .addItem("Abrir el panel de la carrera", "menuAbrirPanel")
    .addSeparator()
    .addItem("Sincronizar y versionar hoja actual", "menuSincronizar")
    .addItem("Terminar edición", "menuTerminar")
    .addSeparator()
    .addItem("Ver alertas de carga", "menuAlertas")
    .addItem("Registrar reemplazo docente", "menuReemplazo")
    .addItem("Restaurar versión", "menuRestaurar")
    .addSeparator()
    .addItem("Abrir la aplicación web", "menuAbrirWeb")
    .addToUi();
}

function menuAbrirPanel() { abrirPanel_("resumen"); }
function menuAlertas() { abrirPanel_("alertas"); }
function menuReemplazo() { abrirPanel_("reemplazo"); }
function menuRestaurar() { abrirPanel_("restaurar"); }

function abrirPanel_(vista) {
  const t = HtmlService.createTemplateFromFile("Panel");
  t.vista = vista;
  SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle("SISCargaLectiva"));
}

function menuSincronizar() { return accionDeMenu_("consolidarHoja"); }
function menuTerminar() { return accionDeMenu_("terminarEdicionHoja"); }

function accionDeMenu_(accion) {
  const ui = SpreadsheetApp.getUi();
  const c = contextoHoja_();
  if (!c.sig) {
    ui.alert(TITULO_MENU_, "Abre la hoja de una carrera, por ejemplo «" + nombreHojaCarrera("ING", config_().cicloActual) +
             "», y vuelve a elegir la opción.", ui.ButtonSet.OK);
    return null;
  }
  let r = null, texto;
  try {
    r = llamarWeb_(accion, [c.ciclo, c.sig, ""]);
    texto = textoConsolidacion_(accion, c, r);
  } catch (err) {
    texto = err.message;
  }
  ui.alert(TITULO_MENU_, texto, ui.ButtonSet.OK);
  return r;
}

/* Resumen de una sincronización para la ventana de aviso. */
function textoConsolidacion_(accion, c, r) {
  const lineas = [r.nueva ? "Se creó la versión v" + r.version + " de " + c.sig + "."
                          : "La hoja no tenía cambios que versionar: " + c.sig + " sigue en la v" + r.version + "."];
  const n = function (x) { return (x && x.length) || 0; };
  if (n(r.rechazados))
    lineas.push((n(r.rechazados) === 1 ? "No se aceptó 1 asignación" : "No se aceptaron " + n(r.rechazados) + " asignaciones") +
                " (A07, A08 o A11); cada celda tiene una nota con el motivo.");
  if (r.esperas && r.esperas.length)
    lineas.push("Fusiones que siguen esperando: " + r.esperas.map(function (x) { return x.codigo + " (" + x.nota + ")"; }).join("; "));
  if (r.fusiones) lineas.push("Fusiones nuevas: " + r.fusiones + ".");
  if (n(r.eliminados))
    lineas.push(n(r.eliminados) === 1 ? "Quedó fuera del plan 1 grupo eliminado en la hoja." : "Quedaron fuera del plan " + n(r.eliminados) + " grupos eliminados en la hoja.");
  if (accion === "terminarEdicionHoja")
    lineas.push(r.liberado ? "Se soltó el bloqueo: la hoja vuelve a sus Coordinadores y a los Directores." : "No tenías el bloqueo de esta hoja.");
  else if (r.conBloqueo)
    lineas.push("Sigues con el bloqueo de la hoja. Elige «Terminar edición» cuando acabes.");
  return lineas.join("\n");
}

function menuAbrirWeb() {
  const ui = SpreadsheetApp.getUi();
  const url = urlWeb_();
  if (!url) { ui.alert(TITULO_MENU_, MENSAJE_SIN_WEB_, ui.ButtonSet.OK); return; }
  const seguro = String(url).replace(/[&<>"']/g, function (x) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]; });
  const html = HtmlService.createHtmlOutput(
    '<p style="font:14px system-ui,sans-serif;margin:8px 0">Se abre en una pestaña nueva. Si el navegador la bloquea, ' +
    '<a href="' + seguro + '" target="_blank" rel="noopener">abre SISCargaLectiva aquí</a>.</p>' +
    "<script>window.open(" + JSON.stringify(url) + ", '_blank');</script>").setWidth(380).setHeight(110);
  ui.showModalDialog(html, "Aplicación web");
}

/* ============================================================
   Funciones del panel lateral (google.script.run desde Panel.html)
   ============================================================ */

/* La hoja y la fila activas de quien tiene abierto el panel. */
function panelContexto() {
  return contextoHoja_();
}

function panelLlamar(accion, args) {
  if (ACCIONES_PANEL_.indexOf(accion) < 0) throw new Error("Acción desconocida: " + accion);
  return llamarWeb_(accion, Array.isArray(args) ? args : []);
}

/* Lleva a la fila de una alerta. */
function panelIrA(hoja, fila) {
  const libro = SpreadsheetApp.getActive();
  const h = libro.getSheetByName(String(hoja || ""));
  if (!h) return false;
  libro.setActiveSheet(h);
  h.getRange(Math.max(PRIMERA_FILA_, parseInt(fila, 10) || PRIMERA_FILA_), col_("DOCENTE") + 1).activate();
  return true;
}

function contextoHoja_() {
  const libro = SpreadsheetApp.getActive();
  const h = libro.getActiveSheet();
  const id = h ? hojaDeCarrera_(h.getName()) : null;
  const r = libro.getActiveRange();
  return { hoja: h ? h.getName() : "", ciclo: id ? id.ciclo : null, sig: id ? id.sig : null, fila: r ? r.getRow() : null };
}

/* ============================================================
   Envío a la aplicación web (RNF-13)
   ============================================================ */

function urlWeb_() {
  const guardada = PropertiesService.getScriptProperties().getProperty("SIS_URL_WEB");
  if (guardada) return guardada;
  try {
    const u = ScriptApp.getService().getUrl();
    return u && /\/exec$/.test(u) ? u : null;
  } catch (e) {
    return null;
  }
}

/* Pide la acción a la aplicación web con el token de quien hace clic: la web sabe así quién
   llama y le aplica sus permisos. */
function llamarWeb_(accion, args) {
  const url = urlWeb_();
  if (!url) throw new Error(MENSAJE_SIN_WEB_);
  const r = UrlFetchApp.fetch(url, {
    method: "post", contentType: "application/json", payload: JSON.stringify({ accion: accion, args: args || [] }),
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: true
  });
  let res = null;
  try { res = JSON.parse(r.getContentText()); } catch (e) { res = null; }
  if (!res || typeof res.ok !== "boolean")
    throw new Error("La aplicación web no respondió como se esperaba (HTTP " + r.getResponseCode() + "). Comprueba que esté " +
                    "publicada con acceso para el dominio y que su implementación tenga el código actual.");
  if (!res.ok) throw new Error(res.error || "La aplicación web no pudo hacerlo.");
  return res.r;
}
