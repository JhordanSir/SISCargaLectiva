/* Backend de la carcasa: IndexVista.html (barra de navegación, «Acceso denegado» e Inicio).
   Apps Script no admite un .js y un .html con el mismo nombre, por eso cada vista se llama
   <Nombre>Vista.html y su backend <Nombre>.js.
   Funciones públicas: doGet (sirve la página), include (pega InicioVista, PlanDeCicloVista y
   CargaDocenteVista dentro de IndexVista.html) e indexUsuario (quién usa la página y su rol).
   Este archivo no usa nada de PlanDeCiclo.js ni de CargaDocente.js, y ellos tampoco lo usan. */

/** Dominio de las cuentas que pueden entrar. */
var INDEX_DOMINIO = "@ulasalle.edu.pe";

/**
 * Sirve la página: IndexVista.html con InicioVista, PlanDeCicloVista y CargaDocenteVista.
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  return HtmlService.createTemplateFromFile("IndexVista").evaluate()
    .setTitle("SISCargaLectiva · Universidad La Salle")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Contenido de otro .html del proyecto, para pegarlo dentro de IndexVista.html.
 * @param {string} nombre «InicioVista», «PlanDeCicloVista» o «CargaDocenteVista».
 * @returns {string}
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * Quién usa la página. Nunca lanza: devuelve { ok, datos } o { ok: false, error }.
 * datos.acceso es false (con datos.motivo) si la cuenta no está identificada, es de otro
 * dominio o no tiene rol en la pestaña Usuarios.
 * @returns {{ok: boolean, datos?: Object, error?: string}}
 */
function indexUsuario() {
  try {
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) return indexDenegar_("", "Cuenta no identificada: Google no informó tu correo. Entra con tu cuenta @ulasalle.edu.pe.");
    if (correo.slice(-INDEX_DOMINIO.length) !== INDEX_DOMINIO)
      return indexDenegar_(correo, "Cuenta fuera del dominio: solo pueden entrar cuentas " + INDEX_DOMINIO + ".");

    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Usuarios");
    const filas = hoja ? hoja.getDataRange().getDisplayValues().slice(1) : [];
    const fila = filas.filter(function (f) { return String(f[0]).trim().toLowerCase() === correo; })[0];
    const rol = fila ? String(fila[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      return indexDenegar_(correo, "Cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    return {
      ok: true,
      datos: {
        acceso: true,
        correo: correo,
        rol: rol,
        carreras: String(fila[2] || "").split(",").map(function (s) { return s.trim().toUpperCase(); }).filter(String),
        departamento: String(fila[3] || "").trim().toUpperCase()
      }
    };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "No se pudo leer la pestaña Usuarios: " + (e && e.message ? e.message : e) };
  }
}

/**
 * Respuesta de acceso denegado.
 * @param {string} correo
 * @param {string} motivo
 * @returns {{ok: boolean, datos: Object}}
 */
function indexDenegar_(correo, motivo) {
  return { ok: true, datos: { acceso: false, correo: correo, rol: "", carreras: [], departamento: "", motivo: motivo } };
}
