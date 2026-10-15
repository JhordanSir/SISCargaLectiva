/* Punto de entrada de la aplicación web. */

function doGet() {
  const t = HtmlService.createTemplateFromFile("Index");
  t.inicial = JSON.stringify(datosIniciales_()).replace(/</g, "\\u003c");
  t.dominio = "(" + crearDominio_.toString() + ")()";
  return t.evaluate()
    .setTitle("SISCargaLectiva · Universidad La Salle")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function include_(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

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
    const u = usuarioActual_();
    if (u.denegado) return { estado: "denegado", motivo: u.denegado, config: config };
    /* La página llega con el tablero ya leído. No se mira Drive aquí para no retrasarla:
       si hace falta revisar los xlsx, el navegador lo pide en segundo plano (pendiente). */
    const revisado = xlsxRevisadoHacePoco_();
    return {
      estado: "ok", usuario: u, config: config,
      tablero: { ciclo: config.ciclo, filas: leerTablero_(config.ciclo), avisos: revisado ? revisado.avisos.map(Dominio.comoAviso) : [], pendiente: !revisado }
    };
  } catch (e) {
    return { estado: "error", motivo: e.message, config: config };
  }
}
