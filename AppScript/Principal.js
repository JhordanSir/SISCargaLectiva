// @ts-check
/* Punto de entrada de la aplicación web. */

/**
 * Página de la aplicación, con los datos iniciales y Dominio ya incluidos.
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

/* Archivos generados que no tienen scriptlets: se incluyen tal cual, sin evaluarlos. */
var SIN_PLANTILLA_ = ["Estilos", "Iconos"];

/**
 * Contenido de un archivo HTML del proyecto, para incluirlo en Index.html. Las pantallas
 * son plantillas (usan icono_); Estilos e Iconos se copian tal cual.
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
 * Lo que la página necesita al cargar: configuración, usuario y tablero del ciclo (sin mirar Drive).
 * @returns {{estado: string, config: Object, usuario?: Usuario, motivo?: string, tablero?: {ciclo: string, filas: FilaTablero[], avisos: Aviso[], pendiente: boolean}}}
 */
function datosIniciales_() {
  const cfg = config_();
  const config = {
    dominio: cfg.dominio,
    ciclos: cfg.ciclos,
    ciclo: cfg.cicloXlsx,
    minutosBloqueo: cfg.minutosBloqueo,
    maxSubgrupos: cfg.maxSubgrupos
  };
  if (!cfg.carpetaId || !cfg.bdId) return { estado: "sin-instalar", config: config };
  try {
    const usuario = usuarioActual_();
    if (usuario.denegado) return { estado: "denegado", motivo: usuario.denegado, config: config };
    /* La página llega con el tablero ya leído. No se mira Drive aquí para no retrasarla:
       si hace falta revisar los xlsx, el navegador lo pide en segundo plano (pendiente). */
    const revisado = xlsxRevisadoHacePoco_();
    return {
      estado: "ok", usuario: usuario, config: config,
      tablero: { ciclo: config.ciclo, filas: leerTablero_(config.ciclo), avisos: revisado ? revisado.avisos.map(Dominio.comoAviso) : [], pendiente: !revisado }
    };
  } catch (e) {
    return { estado: "error", motivo: e.message, config: config };
  }
}
