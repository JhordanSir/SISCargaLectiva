/* Punto de entrada de la aplicación web. La página recibe el texto de crearDominio() y de
   crearDominioCarga() y los ejecuta tal cual. */

function doGet() {
  const t = HtmlService.createTemplateFromFile("Index");
  t.inicial = JSON.stringify(datosIniciales_()).replace(/</g, "\\u003c");
  t.dominio = "(" + crearDominio.toString() + ")()";
  t.dominioCarga = "(" + crearDominioCarga.toString() + ")(Dominio)";
  return t.evaluate()
    .setTitle("SISCargaLectiva · Planes de Ciclo")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/* La página llega con el tablero del ciclo actual ya leído de las hojas del libro. */
function datosIniciales_() {
  const cfg = config_();
  const config = {
    dominio: cfg.dominio,
    ciclos: cfg.ciclos,
    ciclo: cfg.cicloActual,
    minutosBloqueo: cfg.minutosBloqueo,
    maxSubgrupos: cfg.maxSubgrupos
  };
  if (!cfg.libroId) return { estado: "sin-instalar", config: config };
  try {
    const u = usuarioActual_();
    if (u.denegado) return { estado: "denegado", motivo: u.denegado, config: config };
    const lectura = leerPlanesCiclo_(config.ciclo);
    return {
      estado: "ok", usuario: u, config: config,
      tablero: { ciclo: config.ciclo, filas: filasTablero_(config.ciclo, lectura), avisos: avisosDeLectura_(config.ciclo, lectura), pendiente: false }
    };
  } catch (e) {
    return { estado: "error", motivo: e.message, config: config };
  }
}
