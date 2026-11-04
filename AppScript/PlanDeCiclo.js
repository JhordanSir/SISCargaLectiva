/* Backend de PlanDeCicloVista.html: CU-001 «Registrar plan de ciclo».
   Botones de la vista: Ciclo; Editar / Ver; Interpretar y archivo .csv; por grupo + Grupo, Quitar, Desdoblar…,
   Fusionar… (Buscar en otras carreras) y Deshacer fusión; Guardar, Salir e Historial (Ver, Restaurar).
   Funciones públicas: planInicio, planAbrir, planInterpretar, planCandidatosFusion, planGuardar, planMantener,
   planSalir, planHistorial, planVersion y planRestaurar; devuelven { ok: true, datos } o { ok: false, error } y
   nunca lanzan. Las operaciones sobre grupos se hacen en el navegador: aquí se interpreta lo pegado, se sanea, se
   guarda cada versión y se lleva el bloqueo. No usa nada de otros archivos: todo empieza por «plan». */

const PLAN_DOMINIO_ = "@ulasalle.edu.pe";
const PLAN_MAX_CELDA_ = 50000;
const PLAN_LIMITES_ = { asignaturas: 400, grupos: 30, nombre: 200, obs: 300, codigo: 40, texto: 20, avisos: 10 };
const PLAN_SIN_BLOQUEO_ = "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.";
/* Cabecera normalizada → campo, al interpretar. La segunda «HT» se trata aparte (es el total). */
const PLAN_COLUMNAS_ = {
  CARRERA: "carrera", MALLA: "malla", SEMESTRE: "semestre", CODIGO: "codigo", ASIGNATURA: "asignatura", HT: "ht", HP: "hp",
  "TOTAL HORAS": "th", TH: "th", "TOTAL DE HORAS": "th", DPTO: "dpto", OBSERVACIONES: "obs", OBSERVACION: "obs"
};
/** @typedef {{ok: boolean, datos?: *, error?: string}} PlanRespuesta Lo que devuelve cada función pública. */

/* ===================== Funciones públicas ===================== */

/** Tabla de carreras del ciclo: plan vigente, quién lo edita y si el usuario puede editarlo.
 *  @param {string} ciclo Vacío = el último. @returns {PlanRespuesta} datos: { ciclos, ciclo, carreras }. */
function planInicio(ciclo) {
  return planResponder_(() => {
    const usuario = planUsuario_(), planes = planFilas_("Planes"), bloqueos = planFilas_("Bloqueos");
    ciclo = planCiclo_(ciclo);
    const carreras = planCarreras_().map(c => {
      const v = planVersiones_(planes, ciclo, c.sigla)[0], plan = planContenido_(v), b = planBloqueo_(bloqueos, ciclo, c.sigla);
      return Object.assign({ sigla: c.sigla, nombre: c.nombre, departamento: c.departamento }, planDatosVersion_(v), {
        asignaturas: plan.asignaturas.length, grupos: planContarGrupos_(plan),
        editor: b && b.vigente ? b.correo : "", puedeEditar: planPuedeEditar_(usuario, c.sigla)
      });
    });
    return { ciclos: planFilas_("Ciclos").map(f => f[0]).filter(String), ciclo, carreras };
  });
}

/** Abre el plan en «edicion» (toma el bloqueo) si el usuario puede editarlo y nadie más lo tiene; si no, en «lectura» con
 *  el motivo. Los grupos que otra carrera fusionó llevan fusionExterna. @param {string} ciclo @param {string} carrera
 *  @returns {PlanRespuesta} datos: { ciclo, carrera, nombre, modo, motivo, editor, vence, version, usuario, fecha, plan }. */
function planAbrir(ciclo, carrera) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), sigla = x.c.sigla;
    const acceso = planConCandado_(() => {
      const b = planBloqueo_(planFilas_("Bloqueos"), x.ciclo, sigla), vigente = b && b.vigente ? b : null;
      if (x.puede && (!vigente || vigente.correo === x.usuario.correo))
        return { modo: "edicion", motivo: "", editor: x.usuario.correo, vence: planEscribirBloqueo_(b, x.ciclo, sigla, x.usuario.correo) };
      return {
        modo: "lectura", motivo: x.puede ? "En edición por " + vigente.correo : "Solo lectura: no es una de tus carreras",
        editor: vigente ? vigente.correo : "", vence: vigente ? vigente.vence : ""
      };
    });
    const planes = planFilas_("Planes"), v = planVersiones_(planes, x.ciclo, sigla)[0], plan = planContenido_(v);
    const fusionDe = planOtros_(planes, x.ciclo, sigla).fusionDe;
    plan.asignaturas.forEach(a => a.grupos.forEach(g => { const f = fusionDe[sigla + "|" + a.codigo + "|" + g.n]; if (f) g.fusionExterna = f; }));
    return Object.assign({ ciclo: x.ciclo, carrera: sigla, nombre: x.c.nombre }, acceso, planDatosVersion_(v), { plan });
  });
}

/** Interpreta el rango pegado de Excel o Sheets, o un CSV con «;» o «,»; no toca la hoja. @param {string} texto
 *  @param {string} carrera Las filas de otra carrera se descartan. @returns {PlanRespuesta} datos: { asignaturas, filas, descartadas, avisos }. */
function planInterpretar(texto, carrera) {
  return planResponder_(() => {
    planUsuario_();
    const c = planCarrera_(carrera);
    if (!String(texto == null ? "" : texto).trim()) planFallo_("Pega el rango o sube un CSV.");
    return planInterpretarFilas_(planLeerTexto_(texto), c);
  });
}

/** Grupos de los planes vigentes de las otras carreras del ciclo; fusionadoEn: carrera del plan donde ya está en una fusión.
 *  @param {string} ciclo @param {string} carrera La que fusiona. @returns {PlanRespuesta} datos: { candidatos }. */
function planCandidatosFusion(ciclo, carrera) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), o = planOtros_(planFilas_("Planes"), x.ciclo, x.c.sigla), candidatos = [];
    Object.keys(o.otros).forEach(s => o.otros[s].asignaturas.forEach(a => {
      if (a.codigo) a.grupos.forEach(g => {
        const f = o.fusionDe[s + "|" + a.codigo + "|" + g.n];
        candidatos.push({ carrera: s, codigo: a.codigo, nombre: a.nombre, semestre: a.semestre, grupo: g.n, ht: g.ht, hp: g.hp, th: g.th, fusionadoEn: f ? f.carrera : "" });
      });
    }));
    return { candidatos };
  });
}

/** Guarda el plan saneado como versión nueva y libera el bloqueo. Exige permiso, bloqueo vigente propio y que versionBase
 *  sea la vigente. @param {string} ciclo @param {string} carrera @param {Object} contenido { asignaturas } del navegador.
 *  @param {number} versionBase La de la apertura (0 si no había). @returns {PlanRespuesta} datos: { version, fecha, avisos }. */
function planGuardar(ciclo, carrera, contenido, versionBase) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), sigla = x.c.sigla;
    if (!x.puede) planFallo_("No puedes editar el plan de " + sigla + ": no es una de tus carreras.");
    const plan = planSanear_(contenido, sigla, planCarreras_().map(c => c.sigla)), json = planJson_(plan);
    return planConCandado_(() => {
      const b = planExigirBloqueo_(x.ciclo, sigla, x.usuario.correo);
      const planes = planFilas_("Planes"), v = planVersiones_(planes, x.ciclo, sigla)[0], actual = v ? v.version : 0;
      if (Number(versionBase) !== actual)
        planFallo_(v ? "Hay una versión más nueva (v" + actual + ", guardada por " + v.usuario + " el " +
          v.fecha.slice(0, 16).replace("T", " ") + "). Sal y vuelve a abrir para ver los cambios." : "La versión base no es válida.");
      const avisos = planAvisosFusion_(plan, planes, x.ciclo, sigla), fecha = planFecha_();
      planEscribir_("Planes", [x.ciclo, sigla, actual + 1, x.usuario.correo, fecha, json]);
      planBorrarBloqueo_(b.fila);
      return { version: actual + 1, fecha, avisos };
    });
  });
}

/** Renueva por 30 minutos el bloqueo vigente del usuario. @param {string} ciclo @param {string} carrera
 *  @returns {PlanRespuesta} datos: { vence }. */
function planMantener(ciclo, carrera) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), correo = x.usuario.correo;
    return planConCandado_(() => ({ vence: planEscribirBloqueo_(planExigirBloqueo_(x.ciclo, x.c.sigla, correo), x.ciclo, x.c.sigla, correo) }));
  });
}

/** Suelta el bloqueo si es del usuario (si no, no hace nada). @param {string} ciclo @param {string} carrera
 *  @returns {PlanRespuesta} datos: {}. */
function planSalir(ciclo, carrera) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera);
    planConCandado_(() => {
      const b = planBloqueo_(planFilas_("Bloqueos"), x.ciclo, x.c.sigla);
      if (b && b.correo === x.usuario.correo) planBorrarBloqueo_(b.fila);
    });
    return {};
  });
}

/** Versiones del plan, de la más nueva a la más vieja, con su resumen. @param {string} ciclo @param {string} carrera
 *  @returns {PlanRespuesta} datos: { versiones: [{ version, usuario, fecha, resumen }] }. */
function planHistorial(ciclo, carrera) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera);
    const versiones = planVersiones_(planFilas_("Planes"), x.ciclo, x.c.sigla).map(v => {
      const p = JSON.parse(v.contenido), restaura = p.restauradaDe ? " · restaura v" + p.restauradaDe : "";
      return { version: v.version, usuario: v.usuario, fecha: v.fecha, resumen: p.asignaturas.length + " asignaturas, " + planContarGrupos_(p) + " grupos" + restaura };
    });
    return { versiones };
  });
}

/** Una versión del plan en solo lectura (mismo formato que planAbrir). @param {string} ciclo @param {string} carrera
 *  @param {number} n Número de versión. @returns {PlanRespuesta} */
function planVersion(ciclo, carrera, n) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), v = planBuscarVersion_(planFilas_("Planes"), x.ciclo, x.c.sigla, n);
    return Object.assign({ ciclo: x.ciclo, carrera: x.c.sigla, nombre: x.c.nombre, modo: "lectura", motivo: "Versión " + v.version + " · solo lectura",
      editor: "", vence: "" }, planDatosVersion_(v), { plan: JSON.parse(v.contenido) });
  });
}

/** Copia la versión n como versión nueva (restauradaDe: n). Exige permiso y que ninguna otra cuenta tenga el bloqueo; si
 *  el usuario lo tenía, lo conserva. @param {string} ciclo @param {string} carrera @param {number} n
 *  @returns {PlanRespuesta} datos: { version }. */
function planRestaurar(ciclo, carrera, n) {
  return planResponder_(() => {
    const x = planContexto_(ciclo, carrera), sigla = x.c.sigla;
    if (!x.puede) planFallo_("No puedes restaurar el plan de " + sigla + ": no es una de tus carreras.");
    return planConCandado_(() => {
      const b = planBloqueo_(planFilas_("Bloqueos"), x.ciclo, sigla);
      if (b && b.vigente && b.correo !== x.usuario.correo) planFallo_("No se puede restaurar: " + b.correo + " está editando este plan.");
      const planes = planFilas_("Planes"), v = planBuscarVersion_(planes, x.ciclo, sigla, n), plan = JSON.parse(v.contenido);
      plan.restauradaDe = v.version;
      const version = planVersiones_(planes, x.ciclo, sigla)[0].version + 1;
      planEscribir_("Planes", [x.ciclo, sigla, version, x.usuario.correo, planFecha_(), planJson_(plan)]);
      return { version };
    });
  });
}

/* ===================== Respuesta, usuario y hoja ===================== */

/** Ejecuta fn y devuelve { ok: true, datos } o { ok: false, error }; nunca lanza. @param {function(): *} fn @returns {PlanRespuesta} */
function planResponder_(fn) {
  try { return { ok: true, datos: fn() }; } catch (e) {
    if (e && e.planPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/** Lanza un error previsto, que llega al navegador tal cual. @param {string} mensaje @returns {never} */
function planFallo_(mensaje) { throw Object.assign(new Error(mensaje), { planPrevisto: true }); }

/** Cuenta activa y su rol (pestaña Usuarios); si no vale, «Acceso denegado: …».
 *  @returns {{correo: string, rol: string, carreras: string[], departamento: string}} */
function planUsuario_() {
  const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!correo) planFallo_("Acceso denegado: cuenta no identificada; entra con tu cuenta " + PLAN_DOMINIO_ + ".");
  if (correo.slice(-PLAN_DOMINIO_.length) !== PLAN_DOMINIO_) planFallo_("Acceso denegado: cuenta fuera del dominio " + PLAN_DOMINIO_ + ".");
  const f = planFilas_("Usuarios").filter(u => u[0].toLowerCase() === correo)[0], rol = f ? f[1].toLowerCase() : "";
  if (rol !== "coordinador" && rol !== "director")
    planFallo_("Acceso denegado: cuenta sin rol; " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
  return { correo, rol, carreras: String(f[2] || "").split(",").map(s => s.trim().toUpperCase()).filter(String), departamento: String(f[3] || "").toUpperCase() };
}

/** Usuario, ciclo y carrera validados, y si el usuario edita ese plan. @param {*} ciclo Vacío = el último. @param {*} carrera
 *  @returns {{usuario: Object, ciclo: string, c: {sigla: string, nombre: string, departamento: string}, puede: boolean}} */
function planContexto_(ciclo, carrera) {
  const usuario = planUsuario_(), c = planCarrera_(carrera);
  return { usuario, ciclo: planCiclo_(ciclo), c, puede: planPuedeEditar_(usuario, c.sigla) };
}

/** Solo el coordinador edita, y solo sus carreras. @param {{rol: string, carreras: string[]}} usuario @param {string} sigla @returns {boolean} */
function planPuedeEditar_(usuario, sigla) { return usuario.rol === "coordinador" && usuario.carreras.indexOf(sigla) >= 0; }

/** Pestaña del libro vinculado; falla si no existe. @param {string} nombre @returns {GoogleAppsScript.Spreadsheet.Sheet} */
function planHoja_(nombre) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre) || planFallo_("Falta la pestaña «" + nombre + "» en la hoja.");
}

/** Filas de una pestaña sin la de cabeceras, como texto recortado. @param {string} nombre @returns {string[][]} */
function planFilas_(nombre) {
  return planHoja_(nombre).getDataRange().getDisplayValues().slice(1).map(f => f.map(c => String(c).trim()));
}

/** Escribe una fila como texto (con apóstrofo lo que empieza por = + - @): al final, o en la fila «fila» si se indica.
 *  @param {string} nombre Pestaña. @param {Array<*>} valores @param {number=} fila @returns {void} */
function planEscribir_(nombre, valores, fila) {
  const celdas = valores.map(v => { const s = v == null ? "" : String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; });
  if (fila) planHoja_(nombre).getRange(fila, 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);
  else planHoja_(nombre).appendRow(celdas);
}

/** Valida el ciclo; vacío = el último de la pestaña Ciclos. @param {*} ciclo @returns {string} */
function planCiclo_(ciclo) {
  const ciclos = planFilas_("Ciclos").map(f => f[0]).filter(String), c = String(ciclo == null ? "" : ciclo).trim();
  if (!c) return ciclos[ciclos.length - 1] || planFallo_("La pestaña Ciclos está vacía.");
  return ciclos.indexOf(c) >= 0 ? c : planFallo_("Ciclo desconocido: «" + c + "».");
}

/** Carreras de la pestaña Carreras. @returns {Array<{sigla: string, nombre: string, departamento: string}>} */
function planCarreras_() {
  return planFilas_("Carreras").filter(f => f[0]).map(f => ({ sigla: f[0].toUpperCase(), nombre: f[1], departamento: f[2].toUpperCase() }));
}

/** Carrera de esa sigla; falla si no está en Carreras. @param {*} sigla @returns {{sigla: string, nombre: string, departamento: string}} */
function planCarrera_(sigla) {
  const s = String(sigla == null ? "" : sigla).trim().toUpperCase();
  return planCarreras_().filter(c => c.sigla === s)[0] || planFallo_("Carrera desconocida: «" + s + "».");
}

/** Ejecuta fn con el candado del script, para que dos escrituras no se pisen. @param {function(): *} fn @returns {*} */
function planConCandado_(fn) {
  const candado = LockService.getScriptLock();
  try { candado.waitLock(10000); } catch (e) { planFallo_("La hoja está ocupada con otro guardado; vuelve a intentarlo en unos segundos."); }
  try { return fn(); } finally { candado.releaseLock(); }
}

/** Fecha y hora de Perú en ISO 8601: «2026-10-15T11:01:11-05:00». @param {number=} ms Sin valor, ahora. @returns {string} */
function planFecha_(ms) { return new Date((ms === undefined ? Date.now() : ms) - 5 * 3600000).toISOString().slice(0, 19) + "-05:00"; }

/* ===================== Bloqueo ===================== */

/** Bloqueo del plan de la carrera en el ciclo, o null. @param {string[][]} filas Pestaña Bloqueos. @param {string} ciclo
 *  @param {string} sigla @returns {{fila: number, correo: string, vence: string, vigente: boolean}|null} */
function planBloqueo_(filas, ciclo, sigla) {
  const i = filas.findIndex(f => f[0] === "plan" && f[1] === ciclo && f[2] === sigla);
  return i < 0 ? null : { fila: i + 2, correo: filas[i][3].toLowerCase(), vence: filas[i][4], vigente: Date.parse(filas[i][4]) > Date.now() };
}

/** Escribe o renueva el bloqueo del usuario por 30 minutos. @param {{fila: number}|null} b Fila que ya tenía, o null.
 *  @param {string} ciclo @param {string} sigla @param {string} correo @returns {string} El nuevo vence. */
function planEscribirBloqueo_(b, ciclo, sigla, correo) {
  const vence = planFecha_(Date.now() + 30 * 60000);
  planEscribir_("Bloqueos", ["plan", ciclo, sigla, correo, vence], b ? b.fila : 0);
  return vence;
}

/** El bloqueo vigente del usuario; si no lo tiene, falla con PLAN_SIN_BLOQUEO_. @param {string} ciclo @param {string} sigla
 *  @param {string} correo @returns {{fila: number, correo: string, vence: string, vigente: boolean}} */
function planExigirBloqueo_(ciclo, sigla, correo) {
  const b = planBloqueo_(planFilas_("Bloqueos"), ciclo, sigla);
  return b && b.vigente && b.correo === correo ? b : planFallo_(PLAN_SIN_BLOQUEO_);
}

/** Borra la fila de un bloqueo; si la hoja no deja (es su última fila), la vacía. @param {number} fila @returns {void} */
function planBorrarBloqueo_(fila) {
  try { planHoja_("Bloqueos").deleteRow(fila); } catch (e) { planEscribir_("Bloqueos", ["", "", "", "", ""], fila); }
}

/* ===================== Versiones y fusiones entre planes ===================== */

/** Versiones de un plan, de la más nueva a la más vieja (la primera es la vigente). @param {string[][]} planes Pestaña Planes.
 *  @param {string} ciclo @param {string} sigla @returns {Array<{version: number, usuario: string, fecha: string, contenido: string}>} */
function planVersiones_(planes, ciclo, sigla) {
  return planes.filter(f => f[0] === ciclo && f[1] === sigla)
    .map(f => ({ version: Number(f[2]), usuario: f[3], fecha: f[4], contenido: f[5] })).sort((a, b) => b.version - a.version);
}

/** La versión n de un plan; falla si no existe. @param {string[][]} planes @param {string} ciclo @param {string} sigla @param {*} n
 *  @returns {{version: number, usuario: string, fecha: string, contenido: string}} */
function planBuscarVersion_(planes, ciclo, sigla, n) {
  return planVersiones_(planes, ciclo, sigla).filter(v => v.version === Number(n))[0] ||
    planFallo_("No existe la versión " + n + " del plan de " + sigla + " en " + ciclo + ".");
}

/** Versión, autor y fecha (0 y "" sin versión). @param {{version: number, usuario: string, fecha: string}=} v @returns {Object} */
function planDatosVersion_(v) { return { version: v ? v.version : 0, usuario: v ? v.usuario : "", fecha: v ? v.fecha : "" }; }

/** Contenido de una versión, o un plan vacío si no hay. @param {{contenido: string}=} v @returns {{asignaturas: Object[]}} */
function planContenido_(v) { return v ? JSON.parse(v.contenido) : { asignaturas: [] }; }

/** Total de grupos de un plan. @param {{asignaturas: Object[]}} plan @returns {number} */
function planContarGrupos_(plan) { return plan.asignaturas.reduce((n, a) => n + a.grupos.length, 0); }

/** Fusiones distintas de un plan (una por id). @param {{asignaturas: Object[]}} plan @returns {Object[]} */
function planFusiones_(plan) {
  const r = Object.create(null);
  plan.asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion && !r[g.fusion.id]) r[g.fusion.id] = g.fusion; }));
  return Object.keys(r).map(k => r[k]);
}

/** Planes vigentes de las otras carreras y, por grupo («carrera|código|n»), la fusión de otro plan que lo incluye, con la
 *  carrera de ese plan (si hay dos, gana la de su propia carrera; si no, la primera). @param {string[][]} planes
 *  @param {string} ciclo @param {string} sigla La que se deja fuera. @returns {{otros: Object, fusionDe: Object}} */
function planOtros_(planes, ciclo, sigla) {
  const otros = {}, fusionDe = {};
  planCarreras_().forEach(c => { if (c.sigla !== sigla) otros[c.sigla] = planContenido_(planVersiones_(planes, ciclo, c.sigla)[0]); });
  Object.keys(otros).forEach(s => planFusiones_(otros[s]).forEach(f => f.miembros.forEach(m => {
    const k = m.carrera + "|" + m.codigo + "|" + m.grupo;
    if (!fusionDe[k] || m.carrera === s) fusionDe[k] = { carrera: s, id: f.id, principal: f.principal, miembros: f.miembros };
  })));
  return { otros, fusionDe };
}

/** Avisos al guardar (no bloquean): miembros de otras carreras que ya no existen en su plan vigente o que ya están en una
 *  fusión de otro plan. @param {{asignaturas: Object[]}} plan @param {string[][]} planes @param {string} ciclo
 *  @param {string} sigla @returns {string[]} */
function planAvisosFusion_(plan, planes, ciclo, sigla) {
  const o = planOtros_(planes, ciclo, sigla), avisos = [];
  planFusiones_(plan).forEach(f => f.miembros.forEach(m => {
    if (m.carrera === sigla) return;
    const nombre = m.carrera + " " + m.codigo + "-" + m.grupo, en = o.fusionDe[m.carrera + "|" + m.codigo + "|" + m.grupo];
    if (!(o.otros[m.carrera] || { asignaturas: [] }).asignaturas.some(a => a.codigo === m.codigo && a.grupos.some(g => g.n === m.grupo)))
      avisos.push(nombre + " ya no existe en el plan vigente de " + m.carrera + ".");
    else if (en) avisos.push(nombre + " ya está en una fusión de " + en.carrera + ".");
  }));
  return avisos;
}

/** JSON de un plan; falla si no cabe en una celda. @param {Object} plan @returns {string} */
function planJson_(plan) {
  const json = JSON.stringify(plan);
  if (json.length > PLAN_MAX_CELDA_)
    planFallo_("El plan ocupa " + json.length + " caracteres y una celda admite " + PLAN_MAX_CELDA_ + ": quita grupos o acorta las observaciones.");
  return json;
}

/* ===================== Saneamiento de lo que manda el navegador ===================== */

/** El plan solo con los campos del modelo, tipos correctos y textos recortados; sin fusionExterna ni restauradaDe. Falla si
 *  un desdoble o una fusión no son válidos. @param {*} contenido @param {string} sigla Carrera del plan.
 *  @param {string[]} siglas Carreras válidas. @returns {{asignaturas: Object[]}} */
function planSanear_(contenido, sigla, siglas) {
  const L = PLAN_LIMITES_, lista = planObjeto_(contenido).asignaturas, codigos = Object.create(null);
  if (!Array.isArray(lista)) planFallo_("El plan no tiene el formato esperado.");
  if (lista.length > L.asignaturas) planFallo_("El plan tiene " + lista.length + " asignaturas; el máximo es " + L.asignaturas + ".");
  const asignaturas = lista.map(planObjeto_).map(a => {
    const codigo = planCodigo_(a.codigo), nombre = planTexto_(a.nombre, L.nombre), grupos = Array.isArray(a.grupos) ? a.grupos : [], vistos = {};
    if (codigo && codigos[codigo]) planFallo_("Código repetido en el plan: " + codigo + ".");
    codigos[codigo] = true;
    if (!grupos.length || grupos.length > L.grupos) planFallo_("«" + (codigo || nombre) + "» debe tener entre 1 y " + L.grupos + " grupos.");
    return {
      codigo, nombre, malla: planTexto_(a.malla, L.texto), semestre: planEntero_(a.semestre, 0, 99), dpto: planTexto_(a.dpto, L.texto),
      grupos: grupos.map(planObjeto_).map(g => {
        const n = planEntero_(g.n, 1, Infinity), d = planObjeto_(g.desdoble);
        if (n === null || vistos[n]) planFallo_("Número de grupo no válido o repetido en " + (codigo || nombre) + ": " + g.n + ".");
        vistos[n] = true;
        const r = {
          n, ht: planHora_(g.ht), hp: planHora_(g.hp), th: planHora_(g.th), obs: planTexto_(g.obs, L.obs),
          avisos: (Array.isArray(g.avisos) ? g.avisos : []).slice(0, L.avisos).map(t => planTexto_(t, L.nombre)), desdoble: null, fusion: null
        };
        if (g.desdoble) {
          const horas = d.componente === "P" ? r.hp : d.componente === "T" ? r.ht : 0, k = planEntero_(d.n, 2, 9);
          if (typeof horas !== "number" || horas <= 0 || k === null)
            planFallo_("Desdoble no válido en " + codigo + " grupo " + n + ": P exige HP > 0, T exige HT > 0 y van de 2 a 9 subgrupos.");
          r.desdoble = { componente: d.componente, n: k };
        }
        if (g.fusion) r.fusion = planSanearFusion_(g.fusion, siglas, codigo + " grupo " + n);
        return r;
      })
    };
  });
  planRevisarFusiones_(asignaturas, sigla);
  return { asignaturas };
}

/** Fusión { id, principal, miembros }: al menos 2 miembros distintos y el principal entre ellos. El id es «F<n>» porque la
 *  vista numera las fusiones nuevas a partir de él. @param {*} f @param {string[]} siglas Carreras válidas.
 *  @param {string} donde Grupo que la lleva, para los mensajes. @returns {{id: string, principal: Object, miembros: Object[]}} */
function planSanearFusion_(f, siglas, donde) {
  f = planObjeto_(f);
  const id = String(f.id || ""), lista = Array.isArray(f.miembros) ? f.miembros : [], claves = {};
  const fallo = texto => planFallo_("Fusión " + id + " (" + donde + "): " + texto);
  if (!/^F\d+$/.test(id)) fallo("el identificador no es válido.");
  if (lista.length < 2) fallo("necesita al menos 2 grupos.");
  const ref = m => {
    const r = { carrera: String(m.carrera || ""), codigo: planCodigo_(m.codigo), grupo: planEntero_(m.grupo, 1, Infinity) };
    if (siglas.indexOf(r.carrera) < 0 || !r.codigo || r.grupo === null) fallo("cada grupo necesita carrera, código y número válidos.");
    return r;
  };
  const miembros = lista.map(planObjeto_).map(m => {
    const r = Object.assign(ref(m), { nombre: planTexto_(m.nombre, PLAN_LIMITES_.nombre), ht: planHora_(m.ht), hp: planHora_(m.hp), th: planHora_(m.th) });
    const k = r.carrera + " " + r.codigo + "-" + r.grupo;
    if (claves[k]) fallo(k + " está repetido.");
    claves[k] = true;
    return r;
  });
  const principal = ref(planObjeto_(f.principal));
  if (!claves[principal.carrera + " " + principal.codigo + "-" + principal.grupo]) fallo("el grupo principal no está entre sus miembros.");
  return { id, principal, miembros };
}

/** Coherencia de las fusiones: todos sus grupos llevan el mismo objeto, cada grupo fusionado está entre sus miembros, cada
 *  miembro de la carrera existe y la lleva, y ningún grupo (tampoco de otra carrera) está en dos fusiones.
 *  @param {Object[]} asignaturas Ya saneadas. @param {string} sigla @returns {void} */
function planRevisarFusiones_(asignaturas, sigla) {
  const fusiones = {}, grupos = {}, enFusion = {};
  asignaturas.forEach(a => a.grupos.forEach(g => {
    grupos[a.codigo + "|" + g.n] = g;
    if (!g.fusion) return;
    const json = JSON.stringify(g.fusion);
    if (fusiones[g.fusion.id] && fusiones[g.fusion.id] !== json) planFallo_("La fusión " + g.fusion.id + " no es igual en todos sus grupos.");
    fusiones[g.fusion.id] = json;
    if (!g.fusion.miembros.some(m => m.carrera === sigla && m.codigo === a.codigo && m.grupo === g.n))
      planFallo_("El grupo " + g.n + " de " + (a.codigo || a.nombre) + " lleva la fusión " + g.fusion.id + " pero no está entre sus miembros.");
  }));
  Object.keys(fusiones).forEach(id => JSON.parse(fusiones[id]).miembros.forEach(m => {
    const g = grupos[m.codigo + "|" + m.grupo], k = m.carrera + " " + m.codigo + "-" + m.grupo;
    if (m.carrera === sigla && (!g || !g.fusion || g.fusion.id !== id))
      planFallo_("La fusión " + id + " incluye " + m.codigo + " grupo " + m.grupo + ", que no está en el plan o no lleva esa fusión.");
    if (enFusion[k]) planFallo_(k + " está en dos fusiones: " + enFusion[k] + " y " + id + ".");
    enFusion[k] = id;
  }));
}

/** v si es un objeto (no una lista); si no, {}. @param {*} v @returns {Object} */
function planObjeto_(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

/** Texto en una línea, recortado y de largo máximo max. @param {*} v @param {number} max @returns {string} */
function planTexto_(v, max) { return (v == null ? "" : String(v)).replace(/\s+/g, " ").trim().slice(0, max); }

/** Código normalizado y sin espacios: la clave de una asignatura. @param {*} v @returns {string} */
function planCodigo_(v) { return planNormalizar_(v).replace(/ /g, "").slice(0, PLAN_LIMITES_.codigo); }

/** v si es un entero entre min y max; si no, null. @param {*} v @param {number} min @param {number} max @returns {number|null} */
function planEntero_(v, min, max) { return Number.isInteger(v) && v >= min && v <= max ? v : null; }

/** Horas: un número no negativo, o el texto original (recortado) si no se entendió. @param {*} v @returns {number|string} */
function planHora_(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? v : planTexto_(v, PLAN_LIMITES_.texto); }

/* ===================== Interpretación de lo pegado ===================== */

/** Mayúsculas, sin tildes ni diéresis, con espacios y saltos de línea reducidos a uno. @param {*} s @returns {string} */
function planNormalizar_(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Filas de un texto pegado (tabulaciones) o de un CSV («;» o «,»), con comillas al estilo Excel. Una comilla de apertura
 *  que no se cierra se vuelve a leer como un carácter más. @param {string} texto @returns {string[][]} */
function planLeerTexto_(texto) {
  texto = String(texto).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lineas = texto.split("\n").filter(l => l.trim() !== ""), muestra = lineas.slice(0, 5).join("\n");
  const sep = lineas.length && lineas[0].indexOf("\t") >= 0 ? "\t" : muestra.split(",").length > muestra.split(";").length ? "," : ";";
  const literales = [];
  for (;;) {
    const filas = [];   /* filas terminadas; abierta: posición de la comilla que abrió el campo, o -1 */
    let fila = [], campo = "", abierta = -1;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (abierta >= 0) {
        if (ch !== '"') campo += ch;
        else if (texto[i + 1] === '"') { campo += '"'; i++; }
        else abierta = -1;
      } else if (ch === '"' && campo === "" && literales.indexOf(i) < 0) abierta = i;
      else if (ch === sep) { fila.push(campo); campo = ""; }
      else if (ch === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      else campo += ch;
    }
    if (abierta < 0) return filas.concat([fila.concat(campo)]);
    literales.push(abierta);
  }
}

/** Plan a partir de las filas: busca la cabecera, agrupa por código y ordena. Nunca rechaza una fila por su contenido: lo
 *  que no entiende lo conserva con un aviso en el grupo. @param {string[][]} filas @param {{sigla: string, nombre: string}} carrera
 *  @returns {{asignaturas: Object[], filas: number, descartadas: number, avisos: string[]}} */
function planInterpretarFilas_(filas, carrera) {
  const N = planNormalizar_, col = {};
  const iCab = filas.findIndex(f => { const n = f.map(N); return n.indexOf("CODIGO") >= 0 && n.indexOf("ASIGNATURA") >= 0; });
  if (iCab < 0) planFallo_("No encontré la fila de cabeceras (CODIGO, ASIGNATURA…).");
  let segundaHt;
  filas[iCab].forEach((celda, j) => {
    const campo = PLAN_COLUMNAS_[N(celda)];
    if (campo === "ht" && col.ht !== undefined) { if (segundaHt === undefined) segundaHt = j; }
    else if (campo && col[campo] === undefined) col[campo] = j;
  });
  if (col.th === undefined) col.th = segundaHt;
  const leer = (f, campo) => planTexto_(col[campo] === undefined ? "" : f[col[campo]], Infinity);
  const porClave = Object.create(null), asignaturas = [];
  let leidas = 0, descartadas = 0, conAvisos = 0;

  filas.slice(iCab + 1).forEach(f => {
    const codigo = planCodigo_(leer(f, "codigo")), nombre = leer(f, "asignatura"), otra = N(leer(f, "carrera"));
    if (!codigo && !nombre) return;
    leidas++;
    if (otra && otra !== carrera.sigla && otra !== N(carrera.nombre)) { descartadas++; return; }
    const avisos = [], textoSem = leer(f, "semestre"), sem = /^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/.exec(textoSem);
    if (!sem) avisos.push(textoSem ? "Semestre no reconocido: «" + textoSem + "»" : "Sin semestre");
    const ht = planHoraLeida_(leer(f, "ht"), "HT", avisos), hp = planHoraLeida_(leer(f, "hp"), "HP", avisos);
    const numeros = typeof ht === "number" && typeof hp === "number";
    const th = leer(f, "th") ? planHoraLeida_(leer(f, "th"), "TOTAL", avisos) : numeros ? ht + hp : "";
    if (numeros && typeof th === "number" && Math.abs(th - ht - hp) > 1e-9) avisos.push("TOTAL (" + th + ") no es HT + HP (" + (ht + hp) + ")");
    if (!codigo) avisos.push("Sin código");
    const clave = codigo || "NOMBRE " + N(nombre);
    let a = porClave[clave];
    if (!a) asignaturas.push(a = porClave[clave] = { codigo, nombre, malla: leer(f, "malla"), semestre: sem ? Number(sem[1]) : null, dpto: leer(f, "dpto"), grupos: [] });
    else if (N(nombre) !== N(a.nombre)) avisos.push("Nombre distinto al de la primera fila: «" + nombre + "»");
    const libre = Math.max(0, ...a.grupos.map(g => g.n)) + 1;
    let n = sem ? Number(sem[2] || 1) : libre;
    if (!n || a.grupos.some(g => g.n === n)) {
      avisos.push((n ? "Grupo " + n + " repetido" : "Grupo 0 no válido") + ": se numeró como " + libre);
      n = libre;
    }
    a.grupos.push({ n, ht, hp, th, obs: leer(f, "obs"), avisos, desdoble: null, fusion: null });
    if (avisos.length) conAvisos++;
  });

  asignaturas.forEach(a => a.grupos.sort((x, y) => x.n - y.n));
  /* Por semestre (sin semestre al final) y por código en orden natural: 3.1.2.24 antes que 3.1.10.24. */
  asignaturas.sort((a, b) => (a.semestre === null) - (b.semestre === null) || a.semestre - b.semestre ||
    a.codigo.localeCompare(b.codigo, "es", { numeric: true }) || a.nombre.localeCompare(b.nombre, "es"));
  const avisos = [];
  if (descartadas) avisos.push(descartadas === 1 ? "Se descartó 1 fila de otra carrera." : "Se descartaron " + descartadas + " filas de otra carrera.");
  if (conAvisos) avisos.push(conAvisos === 1 ? "1 fila tiene avisos: revísala en la previsualización." : conAvisos + " filas tienen avisos: revísalas en la previsualización.");
  if (!asignaturas.length) avisos.push("No hay ninguna asignatura de " + carrera.sigla + " en lo pegado.");
  return { asignaturas, filas: leidas, descartadas, avisos };
}

/** Horas de una celda: vacía = 0; número con punto o coma decimal; si no, el texto con aviso. @param {string} texto
 *  @param {string} nombre «HT», «HP» o «TOTAL», para el aviso. @param {string[]} avisos @returns {number|string} */
function planHoraLeida_(texto, nombre, avisos) {
  if (texto === "") return 0;
  if (/^\d+([.,]\d+)?$/.test(texto)) return Number(texto.replace(",", "."));
  avisos.push(nombre + " no reconocido: «" + texto + "»");
  return texto;
}
