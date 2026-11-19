/* =====================================================================
   Index.js · servidor de la carcasa (IndexVista.html: barra, "Acceso denegado" e Inicio)
   ---------------------------------------------------------------------
   CÓMO LEER ESTE ARCHIVO
   Cada función es una acción completa y se lee de arriba abajo (PASO 1, PASO 2…).
   Marcas que verás en los comentarios:
     📥 SHEET · LEE      aquí se traen datos del Google Sheet
     ↩ RESPUESTA        lo que vuelve al navegador
     ⬅ VIENE DE / ➡ SIGUE EN   de dónde llega la llamada y dónde continúa la historia

   QUÉ ACCIÓN LLAMA A QUÉ FUNCIÓN
     Abrir la URL de la app ..................... doGet
       └ pega las tres vistas en la página ........ include (lo usa IndexVista.html al armarse)
     Al cargar la página, "¿quién soy?" ........... indexUsuario
       ⬅ VIENE DE IndexVista.html → Alpine.store("usuario").cargar()

   QUÉ PESTAÑAS TOCA CADA FUNCIÓN   (📥 lee · 📤 escribe · 🗑 borra · 🔒 candado)
     indexUsuario ........... 📥 Usuarios
     Sale del código: una prueba de pruebas/logica.test.mjs avisa si este cuadro y el código no coinciden.

   Apps Script no admite un .js y un .html con el mismo nombre: por eso cada vista se llama
   <Nombre>Vista.html y su servidor <Nombre>.js. Este archivo no usa nada de PlanDeCiclo.js ni de
   CargaDocente.js, y ellos tampoco lo usan.
   ===================================================================== */

/** Dominio de las cuentas que pueden entrar. */
var INDEX_DOMINIO = "@ulasalle.edu.pe";

/**
 * ACCIÓN: alguien abre la URL de la aplicación (/exec o /dev).
 * Google llama a esta función y lo que devuelve es la página completa.
 * ➡ SIGUE EN: el navegador recibe IndexVista.html, arranca Alpine y llama a indexUsuario (abajo).
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet() {
  /* PASO 1 · Se toma IndexVista.html como plantilla: sus marcas <?!= include("…") ?> se ejecutan aquí, en el
     servidor, y pegan InicioVista, PlanDeCicloVista, CargaDocenteVista y ParametrosVista dentro (ver include, abajo). */
  return HtmlService.createTemplateFromFile("IndexVista").evaluate()
    /* PASO 2 · Título de la pestaña del navegador y ajuste para móviles. ↩ RESPUESTA: un solo HTML con todo. */
    .setTitle("SISCargaLectiva · Universidad La Salle")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * Contenido de otro .html del proyecto, para pegarlo dentro de IndexVista.html.
 * ⬅ VIENE DE: las marcas <?!= include("InicioVista") ?> (y las otras tres) de IndexVista.html, durante doGet.
 * @param {string} nombre "InicioVista", "PlanDeCicloVista", "CargaDocenteVista" o "ParametrosVista".
 * @returns {string}
 */
function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}

/**
 * ACCIÓN: la página acaba de cargar y pregunta "¿quién soy y qué rol tengo?".
 * ⬅ VIENE DE: IndexVista.html → Alpine.store("usuario").cargar() (google.script.run.indexUsuario).
 * ↩ RESPUESTA: { ok: true, datos: { acceso, correo, rol, carreras, departamento, motivo? } } o { ok: false, error }.
 * Nunca lanza. Si la cuenta no puede entrar, ok sigue siendo true pero acceso es false y motivo dice por qué.
 * @returns {{ok: boolean, datos?: Object, error?: string}}
 */
function indexUsuario() {
  /* Respuesta de "no puedes entrar": ok es true (no es un error del servidor), pero acceso es false. */
  const denegar = (correo, motivo) =>
    ({ ok: true, datos: { acceso: false, correo: correo, rol: "", carreras: [], departamento: "", motivo: motivo } });
  try {
    /* PASO 1 · ¿Quién eres? Google entrega el correo de la cuenta que abrió la página. */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) return denegar("", "Cuenta no identificada: Google no informó tu correo. Entra con tu cuenta @ulasalle.edu.pe.");

    /* PASO 2 · ¿Es una cuenta de la universidad? Los últimos caracteres tienen que ser "@ulasalle.edu.pe". */
    if (correo.slice(-INDEX_DOMINIO.length) !== INDEX_DOMINIO)
      return denegar(correo, "Cuenta fuera del dominio: solo pueden entrar cuentas " + INDEX_DOMINIO + ".");

    /* PASO 3 · 📥 SHEET · LEE la pestaña "Usuarios" entera (columnas: correo, rol, carreras, departamento)
       y busca la fila de este correo. slice(1) quita la fila de cabeceras. */
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Usuarios");
    const filas = hoja ? hoja.getDataRange().getDisplayValues().slice(1) : [];
    const fila = filas.filter(function (f) { return String(f[0]).trim().toLowerCase() === correo; })[0];

    /* PASO 4 · Solo valen dos roles: coordinador (CU-001) y director (CU-002). */
    const rol = fila ? String(fila[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      return denegar(correo, "Cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 5 · ↩ RESPUESTA con el rol. Las carreras vienen como "ING, ICO" y se vuelven ["ING", "ICO"].
       ➡ SIGUE EN IndexVista.html: el .then de cargar() copia estos datos en $store.usuario. */
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
    /* Error inesperado (por ejemplo, el Sheet no responde): queda en el registro de Apps Script ("Ejecuciones"). */
    console.error(e);
    return { ok: false, error: "No se pudo leer la pestaña Usuarios: " + (e && e.message ? e.message : e) };
  }
}
