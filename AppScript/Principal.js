/* Punto de entrada de la aplicación web. */

function doGet() {
  const t = HtmlService.createTemplateFromFile("Index");
  t.inicial = JSON.stringify(datosIniciales_()).replace(/</g, "\\u003c");
  t.dominio = "(" + crearDominio.toString() + ")()";
  return t.evaluate()
    .setTitle("SISCargaLectiva · Planes de Ciclo")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function include(nombre) {
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
    return { estado: "ok", usuario: u, config: config };
  } catch (e) {
    return { estado: "error", motivo: e.message, config: config };
  }
}
