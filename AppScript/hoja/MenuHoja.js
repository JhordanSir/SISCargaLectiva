// @ts-check
/* Menú «SISCargaLectiva» de la hoja del sistema y reacción a cada edición. Las funciones
   de la hoja solo responden a quien trabaja en ella (exigirHoja_): la app web se ejecuta
   como la cuenta que la implementó, y desde ella cualquiera podría llamarlas. Las de
   instalación, además, solo a la cuenta propietaria de la hoja. */

/**
 * Corta la llamada si no viene de alguien que trabaja en la hoja: en la app web la cuenta
 * que llama no es la que ejecuta el script.
 * @returns {string} Correo de la cuenta, en minúsculas.
 */
function exigirHoja_() {
  const activo = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (!activo || activo !== efectivo) fallo_("SIN_PERMISO", "Esta función solo se usa desde la hoja del sistema.");
  return activo;
}

/**
 * Como exigirHoja_, y además la cuenta tiene que ser la propietaria de la hoja: traer la BD
 * anterior reemplaza tablas y limpiar la carpeta manda archivos a la papelera.
 * @returns {string}
 */
function exigirPropietarioHoja_() {
  const correo = exigirHoja_();
  const propietario = libroBd_().getOwner();
  const dueno = propietario ? String(propietario.getEmail() || "").toLowerCase() : "";
  if (dueno && dueno !== correo) fallo_("SIN_PERMISO", "Solo la cuenta propietaria de la hoja (" + dueno + ") puede hacerlo.");
  return correo;
}

/**
 * Disparador simple: añade el menú al abrir la hoja.
 * @param {Object=} e
 * @returns {void}
 */
function onOpen(e) {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("SISCargaLectiva")
    .addItem("Panel de advertencias", "menuAbrirPanel")
    .addItem("Actualizar la revisión", "menuActualizarRevision")
    .addSeparator()
    .addSubMenu(ui.createMenu("Instalación")
      .addItem("Instalar o reparar", "menuInstalar")
      .addItem("Traer los datos de la BD anterior…", "menuTraerBdAnterior")
      .addItem("Limpiar la carpeta…", "menuLimpiarCarpeta"))
    .addToUi();
}

/**
 * Disparador simple: al editar una pestaña de datos recalcula sus advertencias, repinta lo
 * que cambió y destaca la fila si aparece o se corrige una advertencia. Un disparador simple
 * no puede abrir otras hojas por su id: todo sale del libro editado.
 * @param {{range: GoogleAppsScript.Spreadsheet.Range}=} e
 * @returns {void}
 */
function onEdit(e) {
  if (!e || !e.range || typeof e.range.getSheet !== "function") return;
  const hoja = e.range.getSheet();
  const tipo = tipoDePestana_(hoja.getName());
  if (!tipo) return;
  const libro = hoja.getParent();
  const antes = avisosGuardadosHoja_();
  const r = revisarHoja_(libro, tipo === "usuarios" ? ["usuarios"] : TIPOS_FUENTE_, antes, false, hoja.getName());
  const filas = [];
  for (let f = e.range.getRow(); f <= e.range.getLastRow() && filas.length < 5; f++) filas.push(f);
  reaccionarEdicion_(libro, hoja, filas, antes || [], r.avisos);
  try { actualizarInicio_(libro, r); } catch (err) { /* Inicio se rehace con «Instalar o reparar» */ }
}

/**
 * Menú → Panel de advertencias: la barra lateral con las advertencias de todas las pestañas.
 * @returns {void}
 */
function menuAbrirPanel() {
  exigirHoja_();
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile("hoja/Panel").setTitle("Panel de advertencias"));
}

/**
 * Menú → Actualizar la revisión: revisa y repinta todas las pestañas de datos.
 * @returns {void}
 */
function menuActualizarRevision() {
  exigirHoja_();
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const r = revisarHoja_(libro, TIPOS_REVISADOS_, null, true);
  actualizarInicio_(libro, r);
  libro.toast(r.avisos.length ? r.avisos.length + " advertencias en total." : "Los datos no tienen advertencias.", "Revisión actualizada", 4);
}

/**
 * Menú → Instalación → Instalar o reparar.
 * @returns {void}
 */
function menuInstalar() {
  exigirHoja_();
  const ui = SpreadsheetApp.getUi();
  ui.alert("SISCargaLectiva", instalar(), ui.ButtonSet.OK);
}

/**
 * Menú → Instalación → Traer los datos de la BD anterior…
 * @returns {void}
 */
function menuTraerBdAnterior() {
  exigirPropietarioHoja_();
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile("hoja/Migracion").setWidth(620).setHeight(560),
    "Traer los datos de la BD anterior");
}

/**
 * Menú → Instalación → Limpiar la carpeta…
 * @returns {void}
 */
function menuLimpiarCarpeta() {
  exigirPropietarioHoja_();
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile("hoja/Limpieza").setWidth(720).setHeight(600),
    "Limpiar la carpeta");
}
