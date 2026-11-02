// @ts-check
/* Punto de entrada de la aplicación web: arma Index.html con los datos iniciales y el texto
   de Dominio. Cada pantalla vive en su carpeta de cu001/vistas/ o cu002/vistas/; las funciones del servidor que
   llama cada vista están en el .js de su nombre con «Servidor» (Tablero.html ↔
   TableroServidor.js: Apps Script no deja que un .gs y un .html se llamen igual) y se llaman
   «vista + acción» (tableroObtener, edicionPlanGuardar, asignacionEdicionGuardar…). */

/**
 * CU-001 y CU-002, pasos 1 a 6: la página de la aplicación, con los datos iniciales y
 * Dominio ya incluidos.
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  const t = HtmlService.createTemplateFromFile("Index");
  t.inicial = JSON.stringify(datosIniciales_()).replace(/</g, "\\u003c");
  t.dominio = fuenteDominio_();
  return t.evaluate()
    .setTitle("SISCargaLectiva · Universidad La Salle")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* Archivos generados (estilos/) que no tienen scriptlets: se incluyen tal cual, sin evaluarlos. */
var SIN_PLANTILLA_ = ["base/Estilos", "base/Iconos", "base/Alpine"];

/**
 * Contenido de un archivo HTML del proyecto («cu001/vistas/tablero/Tablero»), para incluirlo en
 * Index.html. Las vistas son plantillas (usan icono_); Estilos, Iconos y Alpine se copian tal cual.
 * @param {string} nombre
 * @returns {string}
 */
function include_(nombre) {
  if (SIN_PLANTILLA_.indexOf(nombre) >= 0) return HtmlService.createHtmlOutputFromFile(nombre).getContent();
  return HtmlService.createTemplateFromFile(nombre).evaluate().getContent();
}

/**
 * Ícono del sprite para las plantillas: <?!= icono_("pencil-simple") ?>.
 * @param {string} nombre
 * @param {string=} clase
 * @returns {string}
 */
function icono_(nombre, clase) {
  return Dominio.htmlIcono(nombre, clase);
}

/**
 * Lo que la página necesita al cargar: configuración, usuario y tablero del ciclo (sin
 * leer las pestañas de datos). Con la cuenta denegada, CU-001 FA-001 a FA-003 y CU-002 FA-003 a FA-005.
 * @returns {{estado: string, config: Object, usuario?: Usuario, motivo?: string, tablero?: {ciclo: string, filas: FilaTablero[], avisos: Aviso[], pendiente: boolean}}}
 */
function datosIniciales_() {
  const cfg = config_();
  const config = {
    dominio: cfg.dominio,
    ciclos: cfg.ciclos,
    ciclo: cfg.cicloHoja,
    minutosBloqueo: cfg.minutosBloqueo,
    maxSubgrupos: cfg.maxSubgrupos
  };
  if (!cfg.bdId) return { estado: "sin-instalar", config: config };
  try {
    const usuario = usuarioActual_();
    if (usuario.denegado) return { estado: "denegado", motivo: usuario.denegado, config: config };
    /* La página llega con el tablero ya leído. Las pestañas de datos no se leen aquí para no
       retrasarla: si hace falta revisarlas, el navegador lo pide en segundo plano (pendiente). */
    const revisado = fuentesRevisadasHacePoco_();
    return {
      estado: "ok", usuario: usuario, config: config,
      tablero: { ciclo: config.ciclo, filas: leerTablero_(config.ciclo), avisos: revisado ? revisado.avisos.map(Dominio.comoAviso) : [], pendiente: !revisado }
    };
  } catch (e) {
    return { estado: "error", motivo: e.message, config: config };
  }
}
