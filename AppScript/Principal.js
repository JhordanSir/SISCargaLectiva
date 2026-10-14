/* Punto de entrada de la aplicación web. La página recibe el texto de crearDominio() y de
   crearDominioCarga() y los ejecuta tal cual. doPost atiende al menú y al panel lateral del
   libro (Menu.js), que no pueden escribir lo protegido (RNF-13). */

function doGet() {
  registrarUrlWeb_();
  const t = HtmlService.createTemplateFromFile("Index");
  t.inicial = JSON.stringify(datosIniciales_()).replace(/</g, "\\u003c");
  t.dominio = "(" + crearDominio.toString() + ")()";
  t.dominioCarga = "(" + crearDominioCarga.toString() + ")(Dominio)";
  return t.evaluate()
    .setTitle("SISCargaLectiva · Planes de Ciclo")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/* Acciones que el menú y el panel lateral piden a la aplicación web. Cada una comprueba la
   cuenta que llama y sus permisos, como cuando la llama la página. */
var ACCIONES_WEB_ = ["datosPanel", "consolidarHoja", "terminarEdicionHoja", "obtenerHistorial", "restaurarVersion",
                     "datosReemplazo", "registrarReemplazo"];

function accionWeb_(nombre) {
  return {
    datosPanel: datosPanel, consolidarHoja: consolidarHoja, terminarEdicionHoja: terminarEdicionHoja,
    obtenerHistorial: obtenerHistorial, restaurarVersion: restaurarVersion, datosReemplazo: datosReemplazo,
    registrarReemplazo: registrarReemplazo
  }[nombre];
}

function doPost(e) {
  let res;
  try {
    const d = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : "{}");
    if (ACCIONES_WEB_.indexOf(d.accion) < 0) throw new Error("Acción desconocida: " + d.accion);
    res = { ok: true, r: accionWeb_(d.accion).apply(null, Array.isArray(d.args) ? d.args : []) };
  } catch (err) {
    res = { ok: false, error: err && err.message ? err.message : String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/* La dirección publicada de la aplicación web, para el menú del libro. */
function registrarUrlWeb_() {
  try {
    const url = ScriptApp.getService().getUrl();
    if (!url || !/\/exec$/.test(url)) return;
    const p = PropertiesService.getScriptProperties();
    if (p.getProperty("SIS_URL_WEB") !== url) p.setProperty("SIS_URL_WEB", url);
  } catch (e) {
    /* Sin dirección, el menú pedirá publicar la aplicación. */
  }
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
