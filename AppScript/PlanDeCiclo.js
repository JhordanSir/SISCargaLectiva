/* =====================================================================
   PlanDeCiclo.js · servidor del CU-001 «Registrar plan de ciclo»
   ---------------------------------------------------------------------
   CÓMO LEER ESTE ARCHIVO
   • Hay UNA función por acción de la vista (PlanDeCicloVista.html). Cada una se lee de arriba
     abajo, como un texto: PASO 1, PASO 2… Todo lo que hace está escrito dentro de ella, aunque
     se repita en otras funciones, para no tener que saltar de un lado a otro.
   • Al principio de cada función hay unas «herramientas» de una línea que solo usa esa función:
       fallo("mensaje")  corta la acción y el mensaje llega al navegador tal cual.
       pestana("X")      la pestaña X del Sheet (si no existe: «Falta la pestaña «X» en la hoja»).
       leer("X")         📥 todas las filas de la pestaña X como texto, sin la fila de cabeceras.
   • Marcas en los comentarios:
       📥 SHEET · LEE       aquí se traen datos del Google Sheet
       📤 SHEET · ESCRIBE   aquí se agrega o se reescribe una fila
       🗑 SHEET · BORRA     aquí se borra una fila
       🔒 CANDADO          solo una escritura a la vez en todo el script (LockService)
       ↩ RESPUESTA         lo que vuelve al navegador
       ⬅ VIENE DE / ➡ SIGUE EN   de dónde llega la llamada y dónde continúa la historia
   • Todas devuelven { ok: true, datos } o { ok: false, error } y nunca lanzan: cada una termina
     con un catch. Un error previsto (fallo) llega con su mensaje; uno inesperado llega como
     «Error interno: …» y queda en el registro de Apps Script («Ejecuciones»).
   • Las operaciones sobre grupos (+ Grupo, Quitar, Desdoblar, Fusionar) NO están aquí: se hacen
     en el navegador sobre this.plan y solo llegan al Sheet al pulsar «Guardar» (planGuardar).

   QUÉ BOTÓN LLAMA A QUÉ FUNCIÓN   (botón → método de PlanDeCicloVista.html → función de aquí)
     Abrir la vista / selector «Ciclo» ... inicio()            → planInicio
     Editar / Ver ........................ abrir(sigla)        → planAbrir
     Interpretar / subir CSV ............. interpretar()       → planInterpretar
     Buscar en otras carreras ............ candidatosFusion()  → planCandidatosFusion
     Guardar ............................. guardar()           → planGuardar
     (solo, cada 5 min si hubo actividad)  mantener()          → planMantener
     Salir / cerrar la pestaña ........... salir()             → planSalir
     Historial ........................... historial()         → planHistorial
     Ver (una versión del historial) ..... version(n)          → planVersion
     Restaurar ........................... restaurar(n)        → planRestaurar

   PESTAÑAS DEL SHEET QUE USA (todas como texto; la fila 1 son cabeceras)
     Usuarios (correo, rol, carreras, departamento) · Ciclos (ciclo) · Carreras (sigla, nombre,
     departamento) · Planes (ciclo, carrera, version, usuario, fecha, contenido) ·
     Bloqueos (cu, ciclo, carrera, correo, vence)
   Planes es «de solo agregar»: cada Guardar o Restaurar añade una fila (una versión) y ninguna
   se modifica ni se borra. La versión vigente de un plan es la de número más alto.
   No usa nada de los otros archivos: todo lo de aquí empieza por «plan».
   ===================================================================== */

/** Dominio de las cuentas que pueden entrar. */
const PLAN_DOMINIO_ = "@ulasalle.edu.pe";
/** Caracteres que caben en una celda del Sheet: el JSON de cada versión va entero en una sola celda. */
const PLAN_MAX_CELDA_ = 50000;
/** Topes al guardar un plan (planGuardar, PASO 3): asignaturas, grupos por asignatura y largo de los textos. */
const PLAN_LIMITES_ = { asignaturas: 400, grupos: 30, nombre: 200, obs: 300, codigo: 40, texto: 20, avisos: 10 };
/** Mensaje cuando tu bloqueo ya no es tuyo (planGuardar y planMantener). La vista lo reconoce por «Tu bloqueo». */
const PLAN_SIN_BLOQUEO_ = "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.";
/* Cabecera del Excel (sin tildes, en mayúsculas) → campo del plan. La segunda «HT» se trata aparte: es el total
   (planInterpretar, PASO 4). */
const PLAN_COLUMNAS_ = {
  CARRERA: "carrera", MALLA: "malla", SEMESTRE: "semestre", CODIGO: "codigo", ASIGNATURA: "asignatura", HT: "ht", HP: "hp",
  "TOTAL HORAS": "th", TH: "th", "TOTAL DE HORAS": "th", DPTO: "dpto", OBSERVACIONES: "obs", OBSERVACION: "obs"
};

/* =====================================================================
   ACCIÓN · Abrir «Registrar plan de ciclo» o cambiar el selector «Ciclo»
   ===================================================================== */

/**
 * La tabla de carreras del ciclo: versión vigente de cada plan, quién la guardó, si alguien la edita ahora y si
 * tú puedes editarla.
 * ⬅ VIENE DE: PlanDeCicloVista.html → inicio().
 * ↩ RESPUESTA: { ciclos, ciclo, carreras: [{ sigla, nombre, departamento, version, usuario, fecha, asignaturas,
 *   grupos, editor, puedeEditar }] }.
 * @param {string} ciclo Vacío = el último de la pestaña Ciclos.
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planInicio(ciclo) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  try {
    /* PASO 1 · ¿Quién eres? Google da el correo de la sesión; tiene que ser de la universidad. */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    /* 📥 SHEET · LEE «Usuarios»: tu fila dice tu rol (columna B) y tus carreras (columna C, separadas por coma). */
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const misCarreras = String(filaUsuario[2] || "").split(",").map(s => s.trim().toUpperCase()).filter(String);

    /* PASO 2 · 📥 SHEET · LEE «Planes» y «Bloqueos» enteras, una sola vez. Lo demás se cruza en memoria. */
    const planes = leer("Planes"), bloqueos = leer("Bloqueos");

    /* PASO 3 · 📥 SHEET · LEE «Ciclos». Sin ciclo elegido (la primera vez) se usa el último de la lista. */
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 4 · 📥 SHEET · LEE «Carreras» y arma una fila de la tabla por carrera. */
    const carreras = leer("Carreras").filter(f => f[0]).map(f => {
      const sigla = f[0].toUpperCase();
      /* 4a · Versión vigente = la de número más alto de esa carrera en ese ciclo (Planes es de solo agregar). */
      const v = planes.filter(p => p[0] === ciclo && p[1] === sigla)
        .map(p => ({ version: Number(p[2]), usuario: p[3], fecha: p[4], contenido: p[5] })).sort((a, b) => b.version - a.version)[0];
      /* 4b · El contenido (columna F) es el JSON del plan: aquí solo se usa para contar asignaturas y grupos. */
      const plan = v ? JSON.parse(v.contenido) : { asignaturas: [] };
      /* 4c · ¿Alguien la edita? Su fila de «Bloqueos» cuenta solo si la hora «vence» todavía no pasó. */
      const b = bloqueos.find(x => x[0] === "plan" && x[1] === ciclo && x[2] === sigla);
      return {
        sigla, nombre: f[1], departamento: f[2].toUpperCase(),
        version: v ? v.version : 0, usuario: v ? v.usuario : "", fecha: v ? v.fecha : "",
        asignaturas: plan.asignaturas.length, grupos: plan.asignaturas.reduce((n, a) => n + a.grupos.length, 0),
        editor: b && Date.parse(b[4]) > Date.now() ? b[3].toLowerCase() : "",
        /* 4d · Solo el coordinador edita, y solo sus carreras: en la tabla el botón dirá «Editar» (azul) o «Ver». */
        puedeEditar: rol === "coordinador" && misCarreras.indexOf(sigla) >= 0
      };
    });

    /* PASO 5 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → inicio(): la guarda en this.carreras y x-for pinta la tabla. */
    return { ok: true, datos: { ciclos, ciclo, carreras } };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Editar» o «Ver» de una carrera
   ===================================================================== */

/**
 * Abre el plan de una carrera. Si es tuya y nadie más la edita, en «edicion» y toma el bloqueo (fila en Bloqueos);
 * si no, en «lectura» con el motivo. Los grupos que otra carrera fusionó llevan fusionExterna (solo para mostrar).
 * ⬅ VIENE DE: PlanDeCicloVista.html → abrir(sigla). También restaurar(n), que vuelve a abrir al terminar.
 * ↩ RESPUESTA: { ciclo, carrera, nombre, modo, motivo, editor, vence, version, usuario, fecha, plan }.
 * @param {string} ciclo
 * @param {string} carrera Sigla de la pestaña Carreras.
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planAbrir(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  /* Al escribir, lo que empieza por = + - @ lleva apóstrofo para que el Sheet no lo tome como fórmula. */
  const comoTexto = v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  /* Fecha y hora de Perú en ISO 8601: «2026-10-15T11:01:11-05:00». */
  const fechaPeru = ms => new Date(ms - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const misCarreras = String(filaUsuario[2] || "").split(",").map(s => s.trim().toUpperCase()).filter(String);

    /* PASO 2 · ¿Qué carrera? 📥 SHEET · LEE «Carreras» y busca la sigla. */
    const carrerasLibro = leer("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }));
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    const c = carrerasLibro.filter(x => x.sigla === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");

    /* PASO 3 · ¿Qué ciclo? 📥 SHEET · LEE «Ciclos» (vacío = el último). */
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 4 · ¿Puedes editarla? Solo el coordinador, y solo sus carreras. */
    const puede = rol === "coordinador" && misCarreras.indexOf(sigla) >= 0;

    /* PASO 5 · 🔒 CANDADO: decide edición o lectura y, si es edición, escribe el bloqueo sin que otro se cruce. */
    const candado = LockService.getScriptLock();
    try { candado.waitLock(10000); } catch (e) { fallo("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
    let acceso;
    try {
      /* 5a · 📥 SHEET · LEE «Bloqueos»: la fila de este plan (cu = plan, ciclo, carrera), si existe. fila = número real
         en el Sheet (+1 por la cabecera, +1 porque las filas empiezan en 1). */
      const filasBloqueo = leer("Bloqueos");
      const i = filasBloqueo.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
      const b = i < 0 ? null : { fila: i + 2, correo: filasBloqueo[i][3].toLowerCase(), vence: filasBloqueo[i][4], vigente: Date.parse(filasBloqueo[i][4]) > Date.now() };
      const vigente = b && b.vigente ? b : null;
      if (puede && (!vigente || vigente.correo === correo)) {
        /* 5b · EDICIÓN. 📤 SHEET · ESCRIBE en «Bloqueos» [plan, ciclo, carrera, tu correo, ahora + 30 min]. Si ya
           había una fila de este plan (aunque fuera de otra persona y estuviera vencida) se reescribe esa; si no, se agrega. */
        const vence = fechaPeru(Date.now() + 30 * 60000);
        const celdas = ["plan", ciclo, sigla, correo, vence].map(comoTexto);
        if (b) pestana("Bloqueos").getRange(b.fila, 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);
        else pestana("Bloqueos").appendRow(celdas);
        acceso = { modo: "edicion", motivo: "", editor: correo, vence };
      } else {
        /* 5c · LECTURA: no es tu carrera, u otra cuenta tiene el bloqueo vigente. No se escribe nada. */
        acceso = {
          modo: "lectura", motivo: puede ? "En edición por " + vigente.correo : "Solo lectura: no es una de tus carreras",
          editor: vigente ? vigente.correo : "", vence: vigente ? vigente.vence : ""
        };
      }
    } finally { candado.releaseLock(); }

    /* PASO 6 · 📥 SHEET · LEE «Planes»: la versión vigente de esta carrera (la de número más alto) y su JSON. */
    const planes = leer("Planes");
    const versiones = sig => planes.filter(f => f[0] === ciclo && f[1] === sig)
      .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version);
    const v = versiones(sigla)[0];
    const plan = v ? JSON.parse(v.contenido) : { asignaturas: [] };

    /* PASO 7 · Fusiones que OTRAS carreras hicieron con grupos de esta. Una fusión se guarda solo en el plan que la
       creó, así que se recorren los planes vigentes de las demás carreras. Si un grupo aparece en dos, gana la de su
       propia carrera. El grupo recibe fusionExterna, que la vista muestra como «FUS – fusionado con …». */
    const fusionDe = {};
    carrerasLibro.filter(x => x.sigla !== sigla).forEach(otra => {
      const vo = versiones(otra.sigla)[0], planOtra = vo ? JSON.parse(vo.contenido) : { asignaturas: [] }, vistas = Object.create(null);
      planOtra.asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion && !vistas[g.fusion.id]) vistas[g.fusion.id] = g.fusion; }));
      Object.keys(vistas).map(k => vistas[k]).forEach(f => f.miembros.forEach(m => {
        const k = m.carrera + "|" + m.codigo + "|" + m.grupo;
        if (!fusionDe[k] || m.carrera === otra.sigla) fusionDe[k] = { carrera: otra.sigla, id: f.id, principal: f.principal, miembros: f.miembros };
      }));
    });
    plan.asignaturas.forEach(a => a.grupos.forEach(g => { const f = fusionDe[sigla + "|" + a.codigo + "|" + g.n]; if (f) g.fusionExterna = f; }));

    /* PASO 8 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → abrir(): guarda doc y plan, muestra la pantalla del plan
       y, si es edición, programa el latido de 5 minutos (mantener → planMantener). */
    return { ok: true, datos: Object.assign({ ciclo, carrera: sigla, nombre: c.nombre }, acceso,
      { version: v ? v.version : 0, usuario: v ? v.usuario : "", fecha: v ? v.fecha : "" }, { plan }) };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Interpretar» (o elegir un .csv, que termina en lo mismo)
   ===================================================================== */

/**
 * Convierte el rango pegado de Excel o Sheets (o un CSV con «;» o «,») en asignaturas y grupos. NO toca el Sheet:
 * el resultado vuelve al navegador y reemplaza this.plan; se guarda recién con «Guardar».
 * ⬅ VIENE DE: PlanDeCicloVista.html → interpretar() (y leerArchivo, que lee el .csv y llama a interpretar()).
 * ↩ RESPUESTA: { asignaturas, filas, descartadas, avisos }.
 * @param {string} texto Lo pegado o el contenido del CSV.
 * @param {string} carrera Las filas de otra carrera se descartan.
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planInterpretar(texto, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  /* Texto para comparar: mayúsculas, sin tildes ni diéresis, espacios y saltos de línea reducidos a uno. */
  const N = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). Basta con tener rol. */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera? 📥 SHEET · LEE «Carreras». Se usan su sigla y su nombre para reconocer sus filas. */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    const c = leer("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }))
      .filter(x => x.sigla === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    if (!String(texto == null ? "" : texto).trim()) fallo("Pega el rango o sube un CSV.");

    /* PASO 3 · Partir el texto en filas y celdas. Separador: tabulación si la primera línea la tiene (así copian Excel y
       Sheets); si no, «,» o «;», el que más aparezca en las 5 primeras líneas. Comillas al estilo Excel: un campo entre
       comillas puede tener separadores y saltos de línea, y "" es una comilla. Una comilla que abre y nunca cierra se
       vuelve a leer como un carácter más (por eso el bucle «for (;;)» puede repetir la lectura). */
    texto = String(texto).replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const lineas = texto.split("\n").filter(l => l.trim() !== ""), muestra = lineas.slice(0, 5).join("\n");
    const sep = lineas.length && lineas[0].indexOf("\t") >= 0 ? "\t" : muestra.split(",").length > muestra.split(";").length ? "," : ";";
    const literales = [];
    let filas;
    for (;;) {
      const terminadas = [];   /* filas ya cerradas; abierta: posición de la comilla que abrió el campo, o -1 */
      let fila = [], campo = "", abierta = -1;
      for (let i = 0; i < texto.length; i++) {
        const ch = texto[i];
        if (abierta >= 0) {
          if (ch !== '"') campo += ch;
          else if (texto[i + 1] === '"') { campo += '"'; i++; }
          else abierta = -1;
        } else if (ch === '"' && campo === "" && literales.indexOf(i) < 0) abierta = i;
        else if (ch === sep) { fila.push(campo); campo = ""; }
        else if (ch === "\n") { fila.push(campo); terminadas.push(fila); fila = []; campo = ""; }
        else campo += ch;
      }
      if (abierta < 0) { filas = terminadas.concat([fila.concat(campo)]); break; }
      literales.push(abierta);
    }

    /* PASO 4 · Buscar la fila de cabeceras (la primera con CODIGO y ASIGNATURA, aunque haya títulos encima) y decidir
       qué columna es cada campo. La primera «HT» es teoría; la segunda, si no hay TOTAL HORAS, es el total. */
    const col = {};
    const iCab = filas.findIndex(f => { const n = f.map(N); return n.indexOf("CODIGO") >= 0 && n.indexOf("ASIGNATURA") >= 0; });
    if (iCab < 0) fallo("No encontré la fila de cabeceras (CODIGO, ASIGNATURA…).");
    let segundaHt;
    filas[iCab].forEach((celda, j) => {
      const campo = PLAN_COLUMNAS_[N(celda)];
      if (campo === "ht" && col.ht !== undefined) { if (segundaHt === undefined) segundaHt = j; }
      else if (campo && col[campo] === undefined) col[campo] = j;
    });
    if (col.th === undefined) col.th = segundaHt;
    /* Herramientas de los pasos 5 y 6. leer(): texto de la celda de ese campo, en una línea. codigoDe(): código sin
       espacios ni tildes (la clave de una asignatura). hora(): número con punto o coma, vacío = 0; si no, el texto con
       un aviso en la fila. */
    const celda = (f, campo) => (col[campo] === undefined || f[col[campo]] == null ? "" : String(f[col[campo]])).replace(/\s+/g, " ").trim();
    const codigoDe = v => N(v).replace(/ /g, "").slice(0, PLAN_LIMITES_.codigo);
    const hora = (t, nombre, avisos) => {
      if (t === "") return 0;
      if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
      avisos.push(nombre + " no reconocido: «" + t + "»");
      return t;
    };

    /* PASO 5 · Fila por fila: las de otra carrera se descartan; las demás se agrupan por código (cada fila es un grupo).
       Nunca se rechaza una fila por su contenido: lo que no se entiende se conserva con un aviso en ese grupo. */
    const porClave = Object.create(null), asignaturas = [];
    let leidas = 0, descartadas = 0, conAvisos = 0;
    filas.slice(iCab + 1).forEach(f => {
      const codigo = codigoDe(celda(f, "codigo")), nombre = celda(f, "asignatura"), otra = N(celda(f, "carrera"));
      if (!codigo && !nombre) return;
      leidas++;
      if (otra && otra !== c.sigla && otra !== N(c.nombre)) { descartadas++; return; }
      /* SEMESTRE «4» = semestre 4, grupo 1; «1-2» = semestre 1, grupo 2. */
      const avisos = [], textoSem = celda(f, "semestre"), sem = /^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/.exec(textoSem);
      if (!sem) avisos.push(textoSem ? "Semestre no reconocido: «" + textoSem + "»" : "Sin semestre");
      const ht = hora(celda(f, "ht"), "HT", avisos), hp = hora(celda(f, "hp"), "HP", avisos);
      const numeros = typeof ht === "number" && typeof hp === "number";
      const th = celda(f, "th") ? hora(celda(f, "th"), "TOTAL", avisos) : numeros ? ht + hp : "";
      if (numeros && typeof th === "number" && Math.abs(th - ht - hp) > 1e-9) avisos.push("TOTAL (" + th + ") no es HT + HP (" + (ht + hp) + ")");
      if (!codigo) avisos.push("Sin código");
      const clave = codigo || "NOMBRE " + N(nombre);
      let a = porClave[clave];
      if (!a) asignaturas.push(a = porClave[clave] = { codigo, nombre, malla: celda(f, "malla"), semestre: sem ? Number(sem[1]) : null, dpto: celda(f, "dpto"), grupos: [] });
      else if (N(nombre) !== N(a.nombre)) avisos.push("Nombre distinto al de la primera fila: «" + nombre + "»");
      /* Grupo repetido (o 0): se le da el siguiente libre, con aviso. */
      const libre = Math.max(0, ...a.grupos.map(g => g.n)) + 1;
      let n = sem ? Number(sem[2] || 1) : libre;
      if (!n || a.grupos.some(g => g.n === n)) {
        avisos.push((n ? "Grupo " + n + " repetido" : "Grupo 0 no válido") + ": se numeró como " + libre);
        n = libre;
      }
      a.grupos.push({ n, ht, hp, th, obs: celda(f, "obs"), avisos, desdoble: null, fusion: null });
      if (avisos.length) conAvisos++;
    });

    /* PASO 6 · Ordenar: grupos por número; asignaturas por semestre (sin semestre al final) y por código en orden
       natural (3.1.2.24 antes que 3.1.10.24). Avisos generales para mostrar arriba de la tabla. */
    asignaturas.forEach(a => a.grupos.sort((x, y) => x.n - y.n));
    asignaturas.sort((a, b) => (a.semestre === null) - (b.semestre === null) || a.semestre - b.semestre ||
      a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || a.nombre.localeCompare(b.nombre, "es"));
    const avisos = [];
    if (descartadas) avisos.push(descartadas === 1 ? "Se descartó 1 fila de otra carrera." : "Se descartaron " + descartadas + " filas de otra carrera.");
    if (conAvisos) avisos.push(conAvisos === 1 ? "1 fila tiene avisos: revísala en la previsualización." : conAvisos + " filas tienen avisos: revísalas en la previsualización.");
    if (!asignaturas.length) avisos.push("No hay ninguna asignatura de " + c.sigla + " en lo pegado.");

    /* PASO 7 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → interpretar(): reemplaza this.plan (previsualización).
       Nada se guardó todavía. */
    return { ok: true, datos: { asignaturas, filas: leidas, descartadas, avisos } };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Buscar en otras carreras» del diálogo de fusión
   ===================================================================== */

/**
 * Los grupos de los planes vigentes de las OTRAS carreras del ciclo, para poder fusionarlos con uno de este plan.
 * fusionadoEn dice si ese grupo ya está en una fusión de otro plan (la vista no deja elegirlo). No escribe nada.
 * ⬅ VIENE DE: PlanDeCicloVista.html → candidatosFusion().
 * ↩ RESPUESTA: { candidatos: [{ carrera, codigo, nombre, semestre, grupo, ht, hp, th, fusionadoEn }] }.
 * @param {string} ciclo
 * @param {string} carrera La que fusiona (se deja fuera de la lista).
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planCandidatosFusion(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera? 📥 SHEET · LEE «Carreras». */
    const carrerasLibro = leer("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }));
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    carrerasLibro.filter(x => x.sigla === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");

    /* PASO 3 · ¿Qué ciclo? 📥 SHEET · LEE «Ciclos» (vacío = el último). */
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 4 · 📥 SHEET · LEE «Planes»: el plan vigente de cada una de las otras carreras (la versión más alta). */
    const planes = leer("Planes"), otros = {};
    carrerasLibro.forEach(c => {
      if (c.sigla === sigla) return;
      const v = planes.filter(f => f[0] === ciclo && f[1] === c.sigla)
        .map(f => ({ version: Number(f[2]), contenido: f[5] })).sort((a, b) => b.version - a.version)[0];
      otros[c.sigla] = v ? JSON.parse(v.contenido) : { asignaturas: [] };
    });

    /* PASO 5 · ¿Qué grupos ya están en una fusión de otro plan? Se mira cada fusión (una por id) de esos planes. Si un
       grupo aparece en dos, gana la fusión del plan de su propia carrera. */
    const fusionDe = {};
    Object.keys(otros).forEach(s => {
      const vistas = Object.create(null);
      otros[s].asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion && !vistas[g.fusion.id]) vistas[g.fusion.id] = g.fusion; }));
      Object.keys(vistas).map(k => vistas[k]).forEach(f => f.miembros.forEach(m => {
        const k = m.carrera + "|" + m.codigo + "|" + m.grupo;
        if (!fusionDe[k] || m.carrera === s) fusionDe[k] = { carrera: s, id: f.id, principal: f.principal, miembros: f.miembros };
      }));
    });

    /* PASO 6 · Un candidato por grupo con código (los que no tienen código no se pueden fusionar). */
    const candidatos = [];
    Object.keys(otros).forEach(s => otros[s].asignaturas.forEach(a => {
      if (a.codigo) a.grupos.forEach(g => {
        const f = fusionDe[s + "|" + a.codigo + "|" + g.n];
        candidatos.push({ carrera: s, codigo: a.codigo, nombre: a.nombre, semestre: a.semestre, grupo: g.n, ht: g.ht, hp: g.hp, th: g.th, fusionadoEn: f ? f.carrera : "" });
      });
    }));

    /* PASO 7 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → candidatosFusion(): los pone en fusionDe.externos y la
       tabla del diálogo los muestra. */
    return { ok: true, datos: { candidatos } };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Guardar»
   ===================================================================== */

/**
 * Guarda el plan como versión nueva (una fila más en Planes) y suelta el bloqueo. Antes: exige que sea tu carrera,
 * limpia lo que manda el navegador, comprueba que el bloqueo siga siendo tuyo y que nadie haya guardado otra
 * versión desde que abriste (versionBase).
 * ⬅ VIENE DE: PlanDeCicloVista.html → guardar().
 * ↩ RESPUESTA: { version, fecha, avisos } (avisos: problemas con grupos de otras carreras en tus fusiones; no impiden guardar).
 * @param {string} ciclo
 * @param {string} carrera
 * @param {Object} contenido { asignaturas } tal como lo tiene el navegador (this.plan).
 * @param {number} versionBase La versión con la que se abrió (0 si no había plan).
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planGuardar(ciclo, carrera, contenido, versionBase) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  const comoTexto = v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const fechaPeru = ms => new Date(ms - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
  /* Herramientas para limpiar lo que manda el navegador (PASO 5):
     objeto(v): v si es un objeto (no una lista), si no {}.   texto(v, max): una línea, recortada, de largo máximo max.
     codigoDe(v): código sin tildes ni espacios.   entero(v, min, max): v si es un entero en el rango, si no null.
     hora(v): número no negativo, o el texto original recortado si no se entendió. */
  const L = PLAN_LIMITES_;
  const objeto = v => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const texto = (v, max) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max);
  const codigoDe = v => String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()
    .replace(/ /g, "").slice(0, L.codigo);
  const entero = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
  const hora = v => (typeof v === "number" && isFinite(v) && v >= 0 ? v : texto(v, L.texto));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const misCarreras = String(filaUsuario[2] || "").split(",").map(s => s.trim().toUpperCase()).filter(String);

    /* PASO 2 · ¿Qué carrera? 📥 SHEET · LEE «Carreras». */
    const carrerasLibro = leer("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }));
    const siglas = carrerasLibro.map(x => x.sigla);
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    carrerasLibro.filter(x => x.sigla === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");

    /* PASO 3 · ¿Qué ciclo? 📥 SHEET · LEE «Ciclos» (vacío = el último). */
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 4 · Solo el coordinador de esta carrera puede guardar (aunque el navegador lo haya permitido). */
    if (!(rol === "coordinador" && misCarreras.indexOf(sigla) >= 0)) fallo("No puedes editar el plan de " + sigla + ": no es una de tus carreras.");

    /* PASO 5 · LIMPIAR lo que manda el navegador: se reconstruye el plan campo por campo, con tipos correctos, textos
       recortados y los topes de PLAN_LIMITES_. No pasan fusionExterna ni restauradaDe (solo sirven para mostrar). */
    const lista = objeto(contenido).asignaturas, codigos = Object.create(null);
    if (!Array.isArray(lista)) fallo("El plan no tiene el formato esperado.");
    if (lista.length > L.asignaturas) fallo("El plan tiene " + lista.length + " asignaturas; el máximo es " + L.asignaturas + ".");
    const asignaturas = lista.map(objeto).map(a => {
      /* 5a · Asignatura: código sin repetir y entre 1 y 30 grupos. */
      const codigo = codigoDe(a.codigo), nombre = texto(a.nombre, L.nombre), grupos = Array.isArray(a.grupos) ? a.grupos : [], vistos = {};
      if (codigo && codigos[codigo]) fallo("Código repetido en el plan: " + codigo + ".");
      codigos[codigo] = true;
      if (!grupos.length || grupos.length > L.grupos) fallo("«" + (codigo || nombre) + "» debe tener entre 1 y " + L.grupos + " grupos.");
      return {
        codigo, nombre, malla: texto(a.malla, L.texto), semestre: entero(a.semestre, 0, 99), dpto: texto(a.dpto, L.texto),
        grupos: grupos.map(objeto).map(g => {
          /* 5b · Grupo: número entero sin repetir, horas, observaciones y avisos recortados. */
          const n = entero(g.n, 1, Infinity), d = objeto(g.desdoble);
          if (n === null || vistos[n]) fallo("Número de grupo no válido o repetido en " + (codigo || nombre) + ": " + g.n + ".");
          vistos[n] = true;
          const r = {
            n, ht: hora(g.ht), hp: hora(g.hp), th: hora(g.th), obs: texto(g.obs, L.obs),
            avisos: (Array.isArray(g.avisos) ? g.avisos : []).slice(0, L.avisos).map(t => texto(t, L.nombre)), desdoble: null, fusion: null
          };
          /* 5c · Desdoble: P exige HP > 0, T exige HT > 0, de 2 a 9 subgrupos (las mismas reglas que la vista). */
          if (g.desdoble) {
            const horas = d.componente === "P" ? r.hp : d.componente === "T" ? r.ht : 0, k = entero(d.n, 2, 9);
            if (typeof horas !== "number" || horas <= 0 || k === null)
              fallo("Desdoble no válido en " + codigo + " grupo " + n + ": P exige HP > 0, T exige HT > 0 y van de 2 a 9 subgrupos.");
            r.desdoble = { componente: d.componente, n: k };
          }
          /* 5d · Fusión { id, principal, miembros }: id «F<n>», al menos 2 miembros distintos de carreras que existen, y el
             principal entre ellos. */
          if (g.fusion) {
            const f = objeto(g.fusion), id = String(f.id || ""), miembrosEnviados = Array.isArray(f.miembros) ? f.miembros : [], claves = {};
            const falloFusion = t => fallo("Fusión " + id + " (" + codigo + " grupo " + n + "): " + t);
            if (!/^F\d+$/.test(id)) falloFusion("el identificador no es válido.");
            if (miembrosEnviados.length < 2) falloFusion("necesita al menos 2 grupos.");
            const ref = m => {
              const x = { carrera: String(m.carrera || ""), codigo: codigoDe(m.codigo), grupo: entero(m.grupo, 1, Infinity) };
              if (siglas.indexOf(x.carrera) < 0 || !x.codigo || x.grupo === null) falloFusion("cada grupo necesita carrera, código y número válidos.");
              return x;
            };
            const miembros = miembrosEnviados.map(objeto).map(m => {
              const x = Object.assign(ref(m), { nombre: texto(m.nombre, L.nombre), ht: hora(m.ht), hp: hora(m.hp), th: hora(m.th) });
              const k = x.carrera + " " + x.codigo + "-" + x.grupo;
              if (claves[k]) falloFusion(k + " está repetido.");
              claves[k] = true;
              return x;
            });
            const principal = ref(objeto(f.principal));
            if (!claves[principal.carrera + " " + principal.codigo + "-" + principal.grupo]) falloFusion("el grupo principal no está entre sus miembros.");
            r.fusion = { id, principal, miembros };
          }
          return r;
        })
      };
    });

    /* PASO 6 · Coherencia de las fusiones del plan: cada fusión es igual en todos sus grupos, cada grupo fusionado está
       entre sus miembros, cada miembro de esta carrera existe y la lleva, y ningún grupo está en dos fusiones. */
    const fusiones = {}, gruposPorClave = {}, enFusion = {};
    asignaturas.forEach(a => a.grupos.forEach(g => {
      gruposPorClave[a.codigo + "|" + g.n] = g;
      if (!g.fusion) return;
      const json = JSON.stringify(g.fusion);
      if (fusiones[g.fusion.id] && fusiones[g.fusion.id] !== json) fallo("La fusión " + g.fusion.id + " no es igual en todos sus grupos.");
      fusiones[g.fusion.id] = json;
      if (!g.fusion.miembros.some(m => m.carrera === sigla && m.codigo === a.codigo && m.grupo === g.n))
        fallo("El grupo " + g.n + " de " + (a.codigo || a.nombre) + " lleva la fusión " + g.fusion.id + " pero no está entre sus miembros.");
    }));
    Object.keys(fusiones).forEach(id => JSON.parse(fusiones[id]).miembros.forEach(m => {
      const g = gruposPorClave[m.codigo + "|" + m.grupo], k = m.carrera + " " + m.codigo + "-" + m.grupo;
      if (m.carrera === sigla && (!g || !g.fusion || g.fusion.id !== id))
        fallo("La fusión " + id + " incluye " + m.codigo + " grupo " + m.grupo + ", que no está en el plan o no lleva esa fusión.");
      if (enFusion[k]) fallo(k + " está en dos fusiones: " + enFusion[k] + " y " + id + ".");
      enFusion[k] = id;
    }));
    const plan = { asignaturas };

    /* PASO 7 · El plan se guarda como texto JSON en UNA celda: tiene que caber (máximo 50 000 caracteres). */
    const json = JSON.stringify(plan);
    if (json.length > PLAN_MAX_CELDA_)
      fallo("El plan ocupa " + json.length + " caracteres y una celda admite " + PLAN_MAX_CELDA_ + ": quita grupos o acorta las observaciones.");

    /* PASO 8 · 🔒 CANDADO: desde aquí hasta escribir, nadie más puede escribir en el Sheet. Si otro está guardando, se
       espera hasta 10 segundos. finally lo suelta siempre, aunque haya error. */
    const candado = LockService.getScriptLock();
    try { candado.waitLock(10000); } catch (e) { fallo("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
    try {
      /* 8a · 📥 SHEET · LEE «Bloqueos»: tu bloqueo tiene que existir, ser tuyo y no haber vencido. */
      const filasBloqueo = leer("Bloqueos");
      const i = filasBloqueo.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
      const b = i < 0 ? null : { fila: i + 2, correo: filasBloqueo[i][3].toLowerCase(), vigente: Date.parse(filasBloqueo[i][4]) > Date.now() };
      if (!(b && b.vigente && b.correo === correo)) fallo(PLAN_SIN_BLOQUEO_);

      /* 8b · 📥 SHEET · LEE «Planes»: ¿la versión con la que abriste (versionBase) sigue siendo la vigente? Si alguien
         guardó entre medio (otra persona, o tú en otra pestaña), se rechaza sin escribir. */
      const planes = leer("Planes");
      const versiones = sig => planes.filter(f => f[0] === ciclo && f[1] === sig)
        .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version);
      const v = versiones(sigla)[0], actual = v ? v.version : 0;
      if (Number(versionBase) !== actual)
        fallo(v ? "Hay una versión más nueva (v" + actual + ", guardada por " + v.usuario + " el " +
          v.fecha.slice(0, 16).replace("T", " ") + "). Sal y vuelve a abrir para ver los cambios." : "La versión base no es válida.");

      /* 8c · Avisos (no impiden guardar): miembros de OTRAS carreras de tus fusiones que ya no existen en su plan vigente,
         o que ya están en una fusión de otro plan. */
      const otros = {}, fusionDe = {}, avisos = [];
      carrerasLibro.forEach(c => { if (c.sigla !== sigla) { const vo = versiones(c.sigla)[0]; otros[c.sigla] = vo ? JSON.parse(vo.contenido) : { asignaturas: [] }; } });
      const fusionesDe = p => { const r = Object.create(null); p.asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion && !r[g.fusion.id]) r[g.fusion.id] = g.fusion; })); return Object.keys(r).map(k => r[k]); };
      Object.keys(otros).forEach(s => fusionesDe(otros[s]).forEach(f => f.miembros.forEach(m => {
        const k = m.carrera + "|" + m.codigo + "|" + m.grupo;
        if (!fusionDe[k] || m.carrera === s) fusionDe[k] = { carrera: s, id: f.id, principal: f.principal, miembros: f.miembros };
      })));
      fusionesDe(plan).forEach(f => f.miembros.forEach(m => {
        if (m.carrera === sigla) return;
        const nombre = m.carrera + " " + m.codigo + "-" + m.grupo, en = fusionDe[m.carrera + "|" + m.codigo + "|" + m.grupo];
        if (!(otros[m.carrera] || { asignaturas: [] }).asignaturas.some(a => a.codigo === m.codigo && a.grupos.some(g => g.n === m.grupo)))
          avisos.push(nombre + " ya no existe en el plan vigente de " + m.carrera + ".");
        else if (en) avisos.push(nombre + " ya está en una fusión de " + en.carrera + ".");
      }));

      /* 8d · 📤 SHEET · ESCRIBE una fila NUEVA al final de «Planes»: [ciclo, carrera, versión + 1, tu correo, fecha de
         Perú, JSON del plan]. Las versiones anteriores no se tocan nunca. */
      const fecha = fechaPeru(Date.now());
      pestana("Planes").appendRow([ciclo, sigla, actual + 1, correo, fecha, json].map(comoTexto));

      /* 8e · 🗑 SHEET · BORRA tu fila de «Bloqueos»: guardar termina la edición. Si es la última fila de la pestaña, el
         Sheet no deja borrarla y se vacía en su lugar. */
      try { pestana("Bloqueos").deleteRow(b.fila); }
      catch (e) { const vacias = ["", "", "", "", ""].map(comoTexto); pestana("Bloqueos").getRange(b.fila, 1, 1, vacias.length).setNumberFormat("@").setValues([vacias]); }

      /* PASO 9 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → guardar(): cierra el plan, vuelve a pedir la tabla
         (inicio → planInicio) y muestra «Guardado como vN.». */
      return { ok: true, datos: { version: actual + 1, fecha, avisos } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Latido cada 5 minutos (no tiene botón)
   ===================================================================== */

/**
 * Renueva por 30 minutos más tu bloqueo del plan. Si el bloqueo ya no es tuyo, falla con PLAN_SIN_BLOQUEO_ y la vista
 * vuelve a la tabla.
 * ⬅ VIENE DE: PlanDeCicloVista.html → latido() → mantener(), cada 5 minutos si hubo actividad.
 * ↩ RESPUESTA: { vence }.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planMantener(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  const comoTexto = v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const fechaPeru = ms => new Date(ms - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera y qué ciclo? 📥 SHEET · LEE «Carreras» y «Ciclos». */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    leer("Carreras").filter(f => f[0]).map(f => f[0].toUpperCase()).filter(s => s === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 3 · 🔒 CANDADO para leer y reescribir el bloqueo sin que otro se cruce. */
    const candado = LockService.getScriptLock();
    try { candado.waitLock(10000); } catch (e) { fallo("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
    try {
      /* 3a · 📥 SHEET · LEE «Bloqueos»: tu bloqueo tiene que existir, ser tuyo y no haber vencido. */
      const filasBloqueo = leer("Bloqueos");
      const i = filasBloqueo.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
      const b = i < 0 ? null : { fila: i + 2, correo: filasBloqueo[i][3].toLowerCase(), vigente: Date.parse(filasBloqueo[i][4]) > Date.now() };
      if (!(b && b.vigente && b.correo === correo)) fallo(PLAN_SIN_BLOQUEO_);

      /* 3b · 📤 SHEET · ESCRIBE (reescribe la MISMA fila de «Bloqueos») con vence = ahora + 30 minutos. */
      const vence = fechaPeru(Date.now() + 30 * 60000);
      const celdas = ["plan", ciclo, sigla, correo, vence].map(comoTexto);
      pestana("Bloqueos").getRange(b.fila, 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);

      /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → mantener(): actualiza «Bloqueo hasta HH:MM». */
      return { ok: true, datos: { vence } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Salir» (y cerrar la pestaña con un plan abierto)
   ===================================================================== */

/**
 * Suelta tu bloqueo del plan: borra su fila de Bloqueos si es tuya (si es de otra cuenta, no hace nada).
 * ⬅ VIENE DE: PlanDeCicloVista.html → salir(), y el evento «pagehide» de su init() al cerrar la pestaña.
 * ↩ RESPUESTA: {}.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planSalir(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  const comoTexto = v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera y qué ciclo? 📥 SHEET · LEE «Carreras» y «Ciclos». */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    leer("Carreras").filter(f => f[0]).map(f => f[0].toUpperCase()).filter(s => s === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 3 · 🔒 CANDADO. */
    const candado = LockService.getScriptLock();
    try { candado.waitLock(10000); } catch (e) { fallo("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
    try {
      /* 3a · 📥 SHEET · LEE «Bloqueos»: la fila de este plan. */
      const filasBloqueo = leer("Bloqueos");
      const i = filasBloqueo.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
      /* 3b · 🗑 SHEET · BORRA esa fila, solo si es tuya (vencida o no). Si es la última de la pestaña, se vacía. */
      if (i >= 0 && filasBloqueo[i][3].toLowerCase() === correo) {
        try { pestana("Bloqueos").deleteRow(i + 2); }
        catch (e) { const vacias = ["", "", "", "", ""].map(comoTexto); pestana("Bloqueos").getRange(i + 2, 1, 1, vacias.length).setNumberFormat("@").setValues([vacias]); }
      }
    } finally { candado.releaseLock(); }

    /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → salir(): cierra el plan y vuelve a pedir la tabla. */
    return { ok: true, datos: {} };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Historial»
   ===================================================================== */

/**
 * Todas las versiones del plan de una carrera, de la más nueva a la más vieja, con un resumen. No escribe nada.
 * ⬅ VIENE DE: PlanDeCicloVista.html → historial().
 * ↩ RESPUESTA: { versiones: [{ version, usuario, fecha, resumen }] }.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planHistorial(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera y qué ciclo? 📥 SHEET · LEE «Carreras» y «Ciclos». */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    leer("Carreras").filter(f => f[0]).map(f => f[0].toUpperCase()).filter(s => s === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 3 · 📥 SHEET · LEE «Planes»: todas las filas de esta carrera y ciclo, de mayor a menor versión. Se abre el
       JSON de cada una solo para el resumen («80 asignaturas, 87 grupos · restaura v1»). */
    const versiones = leer("Planes").filter(f => f[0] === ciclo && f[1] === sigla)
      .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version)
      .map(v => {
        const p = JSON.parse(v.contenido), restaura = p.restauradaDe ? " · restaura v" + p.restauradaDe : "";
        const grupos = p.asignaturas.reduce((n, a) => n + a.grupos.length, 0);
        return { version: v.version, usuario: v.usuario, fecha: v.fecha, resumen: p.asignaturas.length + " asignaturas, " + grupos + " grupos" + restaura };
      });

    /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → historial(): la guarda en this.versiones y abre el panel. */
    return { ok: true, datos: { versiones } };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Ver» de una versión del historial
   ===================================================================== */

/**
 * Una versión del plan en solo lectura (mismo formato que planAbrir). No escribe nada ni toca el bloqueo.
 * ⬅ VIENE DE: PlanDeCicloVista.html → version(n).
 * ↩ RESPUESTA: { ciclo, carrera, nombre, modo: "lectura", motivo, editor, vence, version, usuario, fecha, plan }.
 * @param {string} ciclo
 * @param {string} carrera
 * @param {number} n Número de versión.
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planVersion(ciclo, carrera, n) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué carrera y qué ciclo? 📥 SHEET · LEE «Carreras» y «Ciclos». */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    const c = leer("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }))
      .filter(x => x.sigla === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 3 · 📥 SHEET · LEE «Planes» y busca la fila de la versión n. */
    const v = leer("Planes").filter(f => f[0] === ciclo && f[1] === sigla)
      .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version)
      .filter(x => x.version === Number(n))[0] || fallo("No existe la versión " + n + " del plan de " + sigla + " en " + ciclo + ".");

    /* PASO 4 · ↩ RESPUESTA en modo lectura. ➡ SIGUE EN PlanDeCicloVista.html → version(n): la guarda en vistaVersion
       (aparte de tu edición, que no se toca) y la muestra con el aviso «Versión n · solo lectura». */
    return { ok: true, datos: Object.assign({ ciclo, carrera: sigla, nombre: c.nombre, modo: "lectura", motivo: "Versión " + v.version + " · solo lectura",
      editor: "", vence: "" }, { version: v.version, usuario: v.usuario, fecha: v.fecha }, { plan: JSON.parse(v.contenido) }) };
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Restaurar» de una versión del historial
   ===================================================================== */

/**
 * Copia la versión n como versión NUEVA (con restauradaDe: n). No borra nada del historial. Exige que sea tu
 * carrera y que ninguna otra cuenta tenga el bloqueo; si el bloqueo era tuyo, lo conserva.
 * ⬅ VIENE DE: PlanDeCicloVista.html → restaurar(n).
 * ↩ RESPUESTA: { version }.
 * @param {string} ciclo
 * @param {string} carrera
 * @param {number} n Número de la versión que se copia.
 * @returns {{ok: boolean, datos?: *, error?: string}}
 */
function planRestaurar(ciclo, carrera, n) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { planPrevisto: true }); };
  const pestana = nombre => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || fallo("Falta la pestaña «" + nombre + "» en la hoja.");
  const leer = nombre => pestana(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
  const comoTexto = v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; };
  const fechaPeru = ms => new Date(ms - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
    if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(u => u[0].toLowerCase() === correo)[0];
    const rol = filaUsuario ? filaUsuario[1].toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director")
      fallo("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const misCarreras = String(filaUsuario[2] || "").split(",").map(s => s.trim().toUpperCase()).filter(String);

    /* PASO 2 · ¿Qué carrera y qué ciclo? 📥 SHEET · LEE «Carreras» y «Ciclos». */
    const sigla = String(carrera == null ? "" : carrera).trim().toUpperCase();
    leer("Carreras").filter(f => f[0]).map(f => f[0].toUpperCase()).filter(s => s === sigla)[0] || fallo("Carrera desconocida: «" + sigla + "».");
    const ciclos = leer("Ciclos").map(f => f[0]).filter(String), pedido = String(ciclo == null ? "" : ciclo).trim();
    if (!pedido) ciclo = ciclos[ciclos.length - 1] || fallo("La pestaña Ciclos está vacía.");
    else ciclo = ciclos.indexOf(pedido) >= 0 ? pedido : fallo("Ciclo desconocido: «" + pedido + "».");

    /* PASO 3 · Solo el coordinador de esta carrera puede restaurar. */
    if (!(rol === "coordinador" && misCarreras.indexOf(sigla) >= 0)) fallo("No puedes restaurar el plan de " + sigla + ": no es una de tus carreras.");

    /* PASO 4 · 🔒 CANDADO. */
    const candado = LockService.getScriptLock();
    try { candado.waitLock(10000); } catch (e) { fallo("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
    try {
      /* 4a · 📥 SHEET · LEE «Bloqueos»: si otra cuenta está editando este plan (bloqueo vigente), no se restaura. */
      const filasBloqueo = leer("Bloqueos");
      const i = filasBloqueo.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
      if (i >= 0 && Date.parse(filasBloqueo[i][4]) > Date.now() && filasBloqueo[i][3].toLowerCase() !== correo)
        fallo("No se puede restaurar: " + filasBloqueo[i][3].toLowerCase() + " está editando este plan.");

      /* 4b · 📥 SHEET · LEE «Planes»: la versión n (su JSON) y la vigente (para el número de la nueva). */
      const versiones = leer("Planes").filter(f => f[0] === ciclo && f[1] === sigla)
        .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version);
      const v = versiones.filter(x => x.version === Number(n))[0] || fallo("No existe la versión " + n + " del plan de " + sigla + " en " + ciclo + ".");
      const plan = JSON.parse(v.contenido);
      plan.restauradaDe = v.version;
      const version = versiones[0].version + 1;

      /* 4c · El JSON tiene que caber en una celda (máximo 50 000 caracteres). */
      const json = JSON.stringify(plan);
      if (json.length > PLAN_MAX_CELDA_)
        fallo("El plan ocupa " + json.length + " caracteres y una celda admite " + PLAN_MAX_CELDA_ + ": quita grupos o acorta las observaciones.");

      /* 4d · 📤 SHEET · ESCRIBE una fila NUEVA al final de «Planes» con el contenido de la versión n. Las demás se quedan. */
      pestana("Planes").appendRow([ciclo, sigla, version, correo, fechaPeru(Date.now()), json].map(comoTexto));

      /* PASO 5 · ↩ RESPUESTA. ➡ SIGUE EN PlanDeCicloVista.html → restaurar(n): vuelve a abrir el plan (abrir → planAbrir)
         y muestra «Restaurada la vn como vM.». */
      return { ok: true, datos: { version } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}
