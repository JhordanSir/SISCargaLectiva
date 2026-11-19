/* =====================================================================
   Parametros.js · servidor de la vista "Parámetros" (ParametrosVista.html)
   ---------------------------------------------------------------------
   CÓMO LEER ESTE ARCHIVO
   • Esta vista NO guarda nada en el Google Sheet: sus datos vienen de un servicio REST hecho con Spring Boot
     (carpeta backend/ del repositorio), desplegado en PARAM_API_URL. Cada función de aquí hace UNA llamada a
     ese servicio con UrlFetchApp.fetch, como en el ejemplo del docente (execGet / execPost).
   • Hay UNA función por acción de la vista y se lee de arriba abajo: PASO 1, PASO 2…
   • Al principio de cada función hay unas "herramientas" de una línea que solo usa esa función:
       fallo("mensaje")  corta la acción y el mensaje llega al navegador tal cual.
       leer("X")         📥 todas las filas de la pestaña X, sin la fila de cabeceras.
       texto(v)          v como texto ("" si es null o undefined).
       json(t)           el objeto de un texto JSON, o null si no es JSON (por ejemplo, una página de error).
   • Marcas en los comentarios:
       🌐 REST · GET / PUT  aquí se llama al servicio Spring Boot (UrlFetchApp)
       📥 SHEET · LEE       aquí se traen datos del Google Sheet (solo la pestaña Usuarios, para saber tu rol)
       ↩ RESPUESTA         lo que vuelve al navegador
       ⬅ VIENE DE / ➡ SIGUE EN   de dónde llega la llamada y dónde continúa la historia
   • Todas devuelven { ok: true, datos } o { ok: false, error } y nunca lanzan.
   • Necesita el permiso "Conectarse a un servicio externo" (scope script.external_request en appsscript.json).

   QUÉ BOTÓN LLAMA A QUÉ FUNCIÓN   (botón → método de ParametrosVista.html → función de aquí → servicio REST)
     Abrir la vista / "Recargar" ........ inicio()      → paramConsultar  → GET /api/parametros
                                                       → paramCatalogos  → GET /api/catalogos
     "Guardar" de un parámetro .......... actualizar(p) → paramActualizar → PUT /api/parametros/{clave}  (solo director)
     Selector "Catálogo" ................ catalogo()    → paramCatalogo   → GET /api/catalogos/{tipo}

   QUÉ PESTAÑAS TOCA CADA FUNCIÓN   (📥 lee · 📤 escribe · 🗑 borra · 🔒 candado)
     paramConsultar ......... 📥 Usuarios
     paramActualizar ........ 📥 Usuarios
     paramCatalogos ......... 📥 Usuarios
     paramCatalogo .......... 📥 Usuarios
     Sale del código: una prueba de pruebas/logica.test.mjs avisa si este cuadro y el código no coinciden.

   No usa nada de los otros archivos: todo lo de aquí empieza por "param".
   ===================================================================== */

/** @typedef {{ok: boolean, datos?: *, error?: string}} ParamRespuesta Lo que devuelve cada función pública. */

/** Dirección del servicio REST de Spring Boot (sin "/" final). Si se cambia el despliegue, se cambia aquí. */
var PARAM_API_URL = "https://bcp.wayrasimi.tech";
var PARAM_DOMINIO_ = "@ulasalle.edu.pe";

/* =====================================================================
   ACCIÓN · Abrir la vista "Parámetros" (o "Recargar"): los parámetros del sistema
   ===================================================================== */

/**
 * Los parámetros del sistema (horas docentes, ciclo y plazos, sistema) y si puedes cambiarlos.
 * ⬅ VIENE DE: ParametrosVista.html → inicio().
 * ↩ RESPUESTA: { servidor, puedeEditar, parametros: [{ clave, valor, tipo, unidad, grupo, descripcion, editable,
 *   actualizadoPor, fechaActualizacion }] }.
 * @returns {ParamRespuesta}
 */
function paramConsultar() {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { paramPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña \"" + nombre + "\" en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const json = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 SHEET · LEE "Usuarios"). Basta con tener rol para ver. */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + PARAM_DOMINIO_ + ".");
    if (correo.slice(-PARAM_DOMINIO_.length) !== PARAM_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + PARAM_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => texto(x[0]).trim().toLowerCase() === correo)[0], rol = filaUsuario ? texto(filaUsuario[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · 🌐 REST · GET /api/parametros. muteHttpExceptions: un 400/404 no lanza, se revisa en el PASO 3.
       Si el servidor no responde (apagado, DNS, certificado), fetch lanza y se avisa con la dirección. */
    let respuesta;
    try {
      respuesta = UrlFetchApp.fetch(PARAM_API_URL + "/api/parametros", { method: "get", muteHttpExceptions: true });
    } catch (e) { fallo("No se pudo conectar con el servicio de parámetros (" + PARAM_API_URL + "): " + (e && e.message ? e.message : e)); }

    /* PASO 3 · ¿Respondió bien? 200 = la lista de parámetros; otro código trae { error } (o una página de error). */
    const codigo = respuesta.getResponseCode(), cuerpo = json(respuesta.getContentText());
    /* El mensaje propio del servicio ({ error: "…" }) se muestra tal cual. Una página de error, o el error genérico de
       Spring ({ status, error: "Not Found", … }), se avisa con el código. */
    const mensaje = cuerpo && typeof cuerpo.error === "string" && cuerpo.status === undefined ? cuerpo.error : "";
    if (codigo !== 200) fallo(mensaje || "El servicio de parámetros respondió con el código " + codigo + ".");
    if (!Array.isArray(cuerpo)) fallo("El servicio de parámetros no devolvió una lista.");

    /* PASO 4 · ↩ RESPUESTA. Solo el director puede cambiar parámetros (el coordinador los ve en solo lectura).
       ➡ SIGUE EN ParametrosVista.html → inicio(): la tabla de parámetros por grupo. */
    return { ok: true, datos: { servidor: PARAM_API_URL, puedeEditar: rol === "director", parametros: cuerpo } };
  } catch (e) {
    if (e && e.paramPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón "Guardar" de un parámetro
   ===================================================================== */

/**
 * Cambia el valor de un parámetro en el servicio REST. Solo el director.
 * El servicio valida el valor (entero, fecha AAAA-MM-DD, ciclo AAAA-1/2…) y responde 400 con el motivo si no sirve.
 * ⬅ VIENE DE: ParametrosVista.html → actualizar(p).
 * ↩ RESPUESTA: el parámetro ya cambiado { clave, valor, …, actualizadoPor, fechaActualizacion }.
 * @param {string} clave Por ejemplo "MAX_HORAS_DOCENTE".
 * @param {string} valor El valor nuevo, como texto.
 * @returns {ParamRespuesta}
 */
function paramActualizar(clave, valor) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { paramPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña \"" + nombre + "\" en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const json = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 SHEET · LEE "Usuarios"). Para cambiar hay que ser director. */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + PARAM_DOMINIO_ + ".");
    if (correo.slice(-PARAM_DOMINIO_.length) !== PARAM_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + PARAM_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => texto(x[0]).trim().toLowerCase() === correo)[0], rol = filaUsuario ? texto(filaUsuario[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    if (rol !== "director") fallo("Solo el director de departamento puede actualizar parámetros.");

    /* PASO 2 · ¿Qué se cambia? La clave son mayúsculas y "_" (así no se puede armar otra ruta); el valor, sin espacios en los extremos. */
    clave = texto(clave).trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(clave)) fallo("Clave de parámetro inválida: \"" + clave + "\".");
    valor = texto(valor).trim();
    if (!valor) fallo("Escribe un valor para " + clave + ".");
    if (valor.length > 200) fallo("El valor de " + clave + " es demasiado largo (máximo 200 caracteres).");

    /* PASO 3 · 🌐 REST · PUT /api/parametros/{clave} con el cuerpo JSON { valor, usuario }, como execPost del ejemplo.
       "usuario" es tu correo: el servicio lo guarda en actualizadoPor. */
    let respuesta;
    try {
      respuesta = UrlFetchApp.fetch(PARAM_API_URL + "/api/parametros/" + encodeURIComponent(clave), {
        method: "put",
        contentType: "application/json",
        payload: JSON.stringify({ valor: valor, usuario: correo }),
        muteHttpExceptions: true
      });
    } catch (e) { fallo("No se pudo conectar con el servicio de parámetros (" + PARAM_API_URL + "): " + (e && e.message ? e.message : e)); }

    /* PASO 4 · ¿Lo aceptó? 200 = el parámetro cambiado; 400 = valor inválido o solo lectura; 404 = no existe. */
    const codigo = respuesta.getResponseCode(), cuerpo = json(respuesta.getContentText());
    /* El mensaje propio del servicio ({ error: "…" }) se muestra tal cual. Una página de error, o el error genérico de
       Spring ({ status, error: "Not Found", … }), se avisa con el código. */
    const mensaje = cuerpo && typeof cuerpo.error === "string" && cuerpo.status === undefined ? cuerpo.error : "";
    if (codigo !== 200) fallo(mensaje || "El servicio de parámetros respondió con el código " + codigo + ".");
    if (!cuerpo || cuerpo.clave !== clave) fallo("El servicio de parámetros devolvió una respuesta inesperada.");

    /* PASO 5 · ↩ RESPUESTA. ➡ SIGUE EN ParametrosVista.html → actualizar(p): reemplaza la fila y avisa en verde. */
    return { ok: true, datos: cuerpo };
  } catch (e) {
    if (e && e.paramPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Abrir la vista "Parámetros" (o "Recargar"): todos los catálogos
   ===================================================================== */

/**
 * Los cuatro catálogos de la aplicación: carreras, facultades, planes de estudio y líneas de investigación.
 * ⬅ VIENE DE: ParametrosVista.html → inicio() (después de paramConsultar).
 * ↩ RESPUESTA: { carreras: [...], facultades: [...], planesEstudio: [...], lineasInvestigacion: [...] }.
 * @returns {ParamRespuesta}
 */
function paramCatalogos() {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { paramPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña \"" + nombre + "\" en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const json = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 SHEET · LEE "Usuarios"). Basta con tener rol. */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + PARAM_DOMINIO_ + ".");
    if (correo.slice(-PARAM_DOMINIO_.length) !== PARAM_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + PARAM_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => texto(x[0]).trim().toLowerCase() === correo)[0], rol = filaUsuario ? texto(filaUsuario[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · 🌐 REST · GET /api/catalogos, como execGet del ejemplo. */
    let respuesta;
    try {
      respuesta = UrlFetchApp.fetch(PARAM_API_URL + "/api/catalogos", { method: "get", muteHttpExceptions: true });
    } catch (e) { fallo("No se pudo conectar con el servicio de parámetros (" + PARAM_API_URL + "): " + (e && e.message ? e.message : e)); }

    /* PASO 3 · ¿Respondió bien? 200 = un objeto con las cuatro listas. */
    const codigo = respuesta.getResponseCode(), cuerpo = json(respuesta.getContentText());
    /* El mensaje propio del servicio ({ error: "…" }) se muestra tal cual. Una página de error, o el error genérico de
       Spring ({ status, error: "Not Found", … }), se avisa con el código. */
    const mensaje = cuerpo && typeof cuerpo.error === "string" && cuerpo.status === undefined ? cuerpo.error : "";
    if (codigo !== 200) fallo(mensaje || "El servicio de parámetros respondió con el código " + codigo + ".");
    if (!cuerpo || !Array.isArray(cuerpo.carreras)) fallo("El servicio de parámetros no devolvió los catálogos.");

    /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN ParametrosVista.html → inicio(): la tabla del catálogo elegido. */
    return { ok: true, datos: cuerpo };
  } catch (e) {
    if (e && e.paramPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Selector "Catálogo": un catálogo por su tipo
   ===================================================================== */

/**
 * Un solo catálogo, pedido por su tipo al servicio REST.
 * ⬅ VIENE DE: ParametrosVista.html → catalogo() (al cambiar el selector).
 * ↩ RESPUESTA: { tipo, elementos: [...] }. Un tipo que el servicio no conoce llega como error (404).
 * @param {string} tipo "carreras", "facultades", "planesEstudio" o "lineasInvestigacion".
 * @returns {ParamRespuesta}
 */
function paramCatalogo(tipo) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { paramPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña \"" + nombre + "\" en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const json = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 SHEET · LEE "Usuarios"). Basta con tener rol. */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + PARAM_DOMINIO_ + ".");
    if (correo.slice(-PARAM_DOMINIO_.length) !== PARAM_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + PARAM_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => texto(x[0]).trim().toLowerCase() === correo)[0], rol = filaUsuario ? texto(filaUsuario[1]).trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué catálogo? Solo letras (así no se puede armar otra ruta). */
    tipo = texto(tipo).trim();
    if (!/^[A-Za-z]+$/.test(tipo)) fallo("Elige un catálogo.");

    /* PASO 3 · 🌐 REST · GET /api/catalogos/{tipo}. */
    let respuesta;
    try {
      respuesta = UrlFetchApp.fetch(PARAM_API_URL + "/api/catalogos/" + encodeURIComponent(tipo), { method: "get", muteHttpExceptions: true });
    } catch (e) { fallo("No se pudo conectar con el servicio de parámetros (" + PARAM_API_URL + "): " + (e && e.message ? e.message : e)); }

    /* PASO 4 · ¿Respondió bien? 200 = la lista; 404 = el servicio no conoce ese catálogo. */
    const codigo = respuesta.getResponseCode(), cuerpo = json(respuesta.getContentText());
    /* El mensaje propio del servicio ({ error: "…" }) se muestra tal cual. Una página de error, o el error genérico de
       Spring ({ status, error: "Not Found", … }), se avisa con el código. */
    const mensaje = cuerpo && typeof cuerpo.error === "string" && cuerpo.status === undefined ? cuerpo.error : "";
    if (codigo !== 200) fallo(mensaje || "El servicio de parámetros respondió con el código " + codigo + ".");
    if (!Array.isArray(cuerpo)) fallo("El servicio de parámetros no devolvió una lista.");

    /* PASO 5 · ↩ RESPUESTA. ➡ SIGUE EN ParametrosVista.html → catalogo(): repinta la tabla del catálogo. */
    return { ok: true, datos: { tipo: tipo, elementos: cuerpo } };
  } catch (e) {
    if (e && e.paramPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}
