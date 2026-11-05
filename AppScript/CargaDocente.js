/* Backend de CargaDocenteVista.html: CU-002 «Carga docente».
   Botones de la vista: Ciclo; Editar / Ver por carrera; en la carga: Interpretar y archivo .csv, Aplicar a la tabla,
   Descartar, Buscar, Usar, Guardar, Salir, Historial (Ver, Restaurar) y Volver.
   Funciones públicas: cargaInicio, cargaAbrir, cargaInterpretar, cargaBuscarDocentes, cargaGuardar, cargaMantener,
   cargaSalir, cargaHistorial, cargaVersion y cargaRestaurar; devuelven { ok: true, datos } o { ok: false, error } y
   nunca lanzan. Las secciones salen de los planes vigentes (pestaña Planes); cada carga se guarda por versiones en
   Cargas y la edita una sola cuenta a la vez (Bloqueos). No usa nada de otros archivos: todo empieza por «carga». */

/** @typedef {{ok: boolean, datos?: *, error?: string}} CargaRespuesta Lo que devuelve cada función pública. */

var CARGA_DOMINIO_ = "@ulasalle.edu.pe";
var CARGA_BLOQUEO_MS_ = 30 * 60000; /* el bloqueo vence a los 30 min sin actividad */
var CARGA_MAX_CELDA_ = 50000;       /* caracteres por celda de la hoja */
var CARGA_SIN_BLOQUEO_ = "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.";

/* ===================== Funciones públicas ===================== */

/** Tabla de carreras: versión del plan y de la carga, componentes con docente y quién edita.
 * @param {string} ciclo Vacío = el último de la pestaña Ciclos. @returns {CargaRespuesta} */
function cargaInicio(ciclo) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo), planes = cargaPlanes_(ctx.ciclo), vigentes = cargaVersiones_(ctx.ciclo).vigentes;
    const bloqueos = cargaBloqueos_(ctx.ciclo, "").filter(b => b.vigente);
    const carreras = ctx.carreras.map(c => {
      const v = vigentes[c.sigla], b = bloqueos.filter(x => x.carrera === c.sigla)[0];
      let componentes = 0, asignados = 0;
      if (planes[c.sigla]) {
        const secciones = cargaSecciones_(c.sigla, planes, ctx).secciones;
        cargaLlenar_(secciones, cargaAsignacionesDe_(v));
        secciones.forEach(s => s.componentes.forEach(k => { componentes++; if (k.docente) asignados++; }));
      }
      return { sigla: c.sigla, nombre: c.nombre, departamento: c.departamento, versionPlan: planes[c.sigla] ? planes[c.sigla].version : 0,
        version: v ? v.version : 0, usuario: v ? v.usuario : "", fecha: v ? v.fecha : "", asignados, componentes,
        editor: b ? b.correo : "", puedeEditar: cargaPuede_(ctx.u, c) };
    });
    return { ciclos: ctx.ciclos, ciclo: ctx.ciclo, carreras };
  });
}

/** Abre la carga en «edicion» (toma o renueva el bloqueo) si puede editarla y ninguna otra cuenta la edita; si no, en
 * «lectura» con el motivo. @param {string} ciclo @param {string} carrera Sigla de la pestaña Carreras. @returns {CargaRespuesta} */
function cargaAbrir(ciclo, carrera) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera), est = cargaEstado_(ctx), sigla = ctx.car.sigla, puede = cargaPuede_(ctx.u, ctx.car);
    const modo = cargaConCandado_(() => {
      const todos = cargaBloqueos_(ctx.ciclo, sigla), otro = todos.filter(b => b.vigente && b.correo !== ctx.u.correo)[0];
      if (!puede || otro) return { modo: "lectura", editor: otro ? otro.correo : "", vence: "",
        motivo: puede ? "En edición por " + otro.correo : "Solo lectura: no es una carrera de tu departamento" };
      const vence = cargaFecha_(Date.now() + CARGA_BLOQUEO_MS_), mio = todos.filter(b => b.correo === ctx.u.correo)[0] || todos[0];
      cargaEscribir_("Bloqueos", mio ? mio.fila : 0, ["carga", ctx.ciclo, sigla, ctx.u.correo, vence]);
      return { modo: "edicion", motivo: "", editor: ctx.u.correo, vence };
    });
    return cargaDocumento_(ctx, est, est.vigente, modo);
  });
}

/** Interpreta el rango pegado o el CSV con el formato CargaXDepartamento; no escribe nada.
 * @param {string} texto Filas separadas por tabulación, «;» o «,». @param {string} ciclo @param {string} carrera @returns {CargaRespuesta} */
function cargaInterpretar(texto, ciclo, carrera) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera);
    if (!cargaTexto_(texto).trim()) cargaFallo_("Pega el rango o sube un CSV");
    const planes = cargaPlanes_(ctx.ciclo);
    if (!planes[ctx.car.sigla]) cargaFallo_(ctx.car.sigla + " no tiene plan registrado en " + ctx.ciclo);
    return cargaLeerMasivo_(cargaTexto_(texto), ctx.car.sigla, cargaSecciones_(ctx.car.sigla, planes, ctx), cargaCatalogo_());
  });
}

/** Busca docentes del catálogo y de las cargas vigentes del ciclo que tengan todas las palabras del texto (máximo 30).
 * @param {string} ciclo @param {string} texto Sin distinguir tildes ni mayúsculas. @returns {CargaRespuesta} datos: { resultados, total } */
function cargaBuscarDocentes(ciclo, texto) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo), buscado = cargaClaveDocente_(cargaTexto_(texto).slice(0, 100));
    if ((buscado.match(/[A-Z]/g) || []).length < 2) cargaFallo_("Escribe al menos 2 letras");
    const fichas = {}, vigentes = cargaVersiones_(ctx.ciclo).vigentes;
    cargaCatalogo_().lista.forEach(d => {
      fichas[cargaClaveDocente_(d.docente)] = { docente: d.docente, departamento: d.departamento, horas: 0, carreras: [] };
    });
    ctx.carreras.forEach(c => cargaAsignacionesDe_(vigentes[c.sigla]).forEach(a => {
      const k = cargaClaveDocente_(a.docente), f = fichas[k] = fichas[k] || { docente: a.docente, departamento: "", horas: 0, carreras: [] };
      f.horas = Math.round((f.horas + (Number(a.horas) || 0)) * 100) / 100;
      if (f.carreras.indexOf(c.sigla) < 0) f.carreras.push(c.sigla);
    }));
    const palabras = buscado.split(" "), claves = Object.keys(fichas).filter(k => palabras.every(p => k.indexOf(p) >= 0)).sort();
    return { resultados: claves.slice(0, 30).map(k => fichas[k]), total: claves.length };
  });
}

/** Guarda la carga como versión nueva y suelta el bloqueo, salvo que un docente pase de 40 h (A07) o falte el motivo de A12.
 * @param {string} ciclo @param {string} carrera @param {Array<{clave: string, comp: string, docente: string}>} asignaciones
 * @param {number} versionBase La de cargaAbrir (0 si no había). @param {string} motivo Obligatorio con A12 > 24 h. @returns {CargaRespuesta} */
function cargaGuardar(ciclo, carrera, asignaciones, versionBase, motivo) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera, true), base = cargaEntero_(versionBase, "Versión base inválida.");
    const mot = typeof motivo === "string" ? motivo.trim().slice(0, 500) : "", catalogo = cargaCatalogo_();
    if (!Array.isArray(asignaciones) || asignaciones.length > 5000) cargaFallo_("Las asignaciones no tienen el formato esperado.");
    return cargaConCandado_(() => {
      cargaExigirBloqueo_(ctx.u, ctx.ciclo, ctx.car.sigla);
      const est = cargaEstado_(ctx), v = est.vigente, actual = v ? v.version : 0;
      if (base > actual) cargaFallo_("La versión base (v" + base + ") no existe: sal y vuelve a abrir la carga.");
      if (base < actual) cargaFallo_("Hay una versión más nueva (v" + actual + ", guardada por " + v.usuario + " el " +
        v.fecha.slice(0, 10) + " " + v.fecha.slice(11, 16) + "). Sal y vuelve a abrir para ver los cambios.");
      const r = cargaEvaluar_(ctx.car.sigla, est, asignaciones, catalogo, mot);
      if (r.bloquea || r.requiereMotivo)
        return { guardado: false, version: actual, fecha: "", advertencias: r.advertencias, requiereMotivo: r.requiereMotivo };
      const fecha = cargaEscribirVersion_(ctx, actual + 1, mot, { asignaciones: r.asignaciones });
      cargaSoltar_(ctx.u, ctx.ciclo, ctx.car.sigla);
      return { guardado: true, version: actual + 1, fecha, advertencias: r.advertencias, requiereMotivo: false };
    });
  });
}

/** Renueva el bloqueo de quien edita (la vista lo llama cada 5 min si hubo actividad).
 * @param {string} ciclo @param {string} carrera @returns {CargaRespuesta} datos: { vence } */
function cargaMantener(ciclo, carrera) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera);
    return cargaConCandado_(() => {
      const b = cargaExigirBloqueo_(ctx.u, ctx.ciclo, ctx.car.sigla), vence = cargaFecha_(Date.now() + CARGA_BLOQUEO_MS_);
      cargaEscribir_("Bloqueos", b.fila, ["carga", ctx.ciclo, ctx.car.sigla, ctx.u.correo, vence]);
      return { vence };
    });
  });
}

/** Suelta el bloqueo si es de quien llama (si no, no hace nada). @param {string} ciclo @param {string} carrera @returns {CargaRespuesta} datos: {} */
function cargaSalir(ciclo, carrera) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera);
    cargaConCandado_(() => cargaSoltar_(ctx.u, ctx.ciclo, ctx.car.sigla));
    return {};
  });
}

/** Versiones de la carga, de la más nueva a la más vieja, con un resumen de cada una.
 * @param {string} ciclo @param {string} carrera @returns {CargaRespuesta} datos: { versiones: [{ version, usuario, fecha, resumen }] } */
function cargaHistorial(ciclo, carrera) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera), planes = cargaPlanes_(ctx.ciclo), sigla = ctx.car.sigla;
    const total = planes[sigla] ? cargaSecciones_(sigla, planes, ctx).secciones.reduce((n, s) => n + s.componentes.length, 0) : 0;
    const versiones = cargaVersiones_(ctx.ciclo).todas.filter(v => v.carrera === sigla).sort((a, b) => b.version - a.version).map(v => {
      const de = cargaJson_(v.contenido).restauradaDe;
      return { version: v.version, usuario: v.usuario, fecha: v.fecha, resumen: cargaAsignacionesDe_(v).length + " de " + total +
        " componentes con docente" + (v.motivo ? " · motivo: " + v.motivo : "") + (de ? " · restaura v" + de : "") };
    });
    return { versiones };
  });
}

/** La versión n sobre las secciones del plan vigente, en solo lectura (como cargaAbrir).
 * @param {string} ciclo @param {string} carrera @param {number} n Número de versión. @returns {CargaRespuesta} */
function cargaVersion(ciclo, carrera, n) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera), num = cargaEntero_(n, "Versión inválida."), est = cargaEstado_(ctx);
    const v = est.versiones.filter(x => x.version === num)[0] || cargaFallo_("No existe la versión " + num + " de esta carga.");
    return cargaDocumento_(ctx, est, v, { modo: "lectura", motivo: "Versión " + num + " · solo lectura", editor: "", vence: "" });
  });
}

/** Copia la versión n como versión nueva si ninguna otra cuenta edita la carga; A07 lo impide y A12 usa el motivo de la
 * versión n (si no tenía, falla). @param {string} ciclo @param {string} carrera @param {number} n @returns {CargaRespuesta} */
function cargaRestaurar(ciclo, carrera, n) {
  return cargaResponder_(() => {
    const ctx = cargaContexto_(ciclo, carrera, true), num = cargaEntero_(n, "Versión inválida."), catalogo = cargaCatalogo_();
    return cargaConCandado_(() => {
      const otro = cargaBloqueos_(ctx.ciclo, ctx.car.sigla).filter(b => b.vigente && b.correo !== ctx.u.correo)[0];
      if (otro) cargaFallo_("No se puede restaurar: la carga está en edición por " + otro.correo + ".");
      const est = cargaEstado_(ctx);
      const v = est.versiones.filter(x => x.version === num)[0] || cargaFallo_("No existe la versión " + num + " de esta carga.");
      const r = cargaEvaluar_(ctx.car.sigla, est, cargaAsignacionesDe_(v), catalogo, v.motivo);
      if (r.bloquea) cargaFallo_("No se puede restaurar la v" + num + ": " +
        r.advertencias.filter(a => a.nivel === "bloqueo").map(a => a.docente + ". " + a.texto).join(" "));
      if (r.requiereMotivo)
        cargaFallo_("La v" + num + " necesita un motivo (A12) y no lo tiene: abre la carga, revísala y guárdala con un motivo.");
      const version = est.vigente.version + 1;
      const fecha = cargaEscribirVersion_(ctx, version, v.motivo, { asignaciones: r.asignaciones, restauradaDe: num });
      return { version, fecha, advertencias: r.advertencias };
    });
  });
}

/* ===================== Respuesta, usuario y contexto ===================== */

/** Ejecuta fn y la envuelve en { ok: true, datos } o { ok: false, error }. @param {function(): *} fn @returns {CargaRespuesta} */
function cargaResponder_(fn) {
  try { return { ok: true, datos: fn() }; } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/** Lanza un error previsto, que llega al navegador con este mensaje. @param {string} mensaje @returns {never} */
function cargaFallo_(mensaje) {
  throw Object.assign(new Error(mensaje), { cargaPrevisto: true });
}

/** Usuario (dominio y rol de la pestaña Usuarios), ciclos, carreras, ciclo validado y, si se pide, la carrera y el permiso.
 * @param {string} ciclo Vacío = el último. @param {string} [carrera] Sigla. @param {boolean} [editar] Exige poder editarla.
 * @returns {{u: Object, ciclos: string[], ciclo: string, carreras: Array<Object>, car: Object}} */
function cargaContexto_(ciclo, carrera, editar) {
  const correo = cargaTexto_(Session.getActiveUser().getEmail()).trim().toLowerCase();
  if (!correo) cargaFallo_("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
  if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_)
    cargaFallo_("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
  const f = cargaFilas_("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = f ? f[1].trim().toLowerCase() : "";
  if (rol !== "coordinador" && rol !== "director")
    cargaFallo_("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
  const u = { correo, rol, carreras: cargaTexto_(f[2]).split(",").map(s => s.trim().toUpperCase()).filter(String),
              departamento: cargaTexto_(f[3]).trim().toUpperCase() };
  const ciclos = cargaFilas_("Ciclos").map(x => x[0].trim()).filter(String);
  if (!ciclos.length) cargaFallo_("La pestaña Ciclos está vacía.");
  const elegido = cargaTexto_(ciclo).trim() || ciclos[ciclos.length - 1];
  if (ciclos.indexOf(elegido) < 0) cargaFallo_("Ciclo desconocido: " + elegido);
  const carreras = cargaFilas_("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(),
    departamento: cargaTexto_(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
  const sigla = cargaTexto_(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
  if (carrera !== undefined && !car) cargaFallo_("Carrera desconocida: " + sigla);
  if (editar && !cargaPuede_(u, car)) cargaFallo_("Solo el director de " + car.departamento + " puede editar la carga de " + sigla + ".");
  return { u, ciclos, ciclo: elegido, carreras, car };
}

/** El director edita la carga de las carreras de su departamento (pestaña Carreras).
 * @param {{rol: string, departamento: string}} u @param {{departamento: string}} carrera @returns {boolean} */
function cargaPuede_(u, carrera) {
  return u.rol === "director" && !!u.departamento && u.departamento === carrera.departamento;
}

/** Entero ≥ 0 dado como número o texto; si no, falla con el mensaje. @param {*} v @param {string} mensaje @returns {number} */
function cargaEntero_(v, mensaje) {
  const n = typeof v === "number" || (typeof v === "string" && v.trim()) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 0) cargaFallo_(mensaje);
  return n;
}

/* ===================== Hoja, candado y fechas ===================== */

/** Filas de una pestaña como texto, sin la de cabeceras (si falta la pestaña, falla). @param {string} nombre @returns {string[][]} */
function cargaFilas_(nombre) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!hoja) cargaFallo_("Falta la pestaña " + nombre + " en la hoja.");
  return hoja.getDataRange().getDisplayValues().slice(1);
}

/** Escribe una fila como texto en la fila indicada o, si es 0, al final; lo que empieza por = + - @ lleva apóstrofo.
 * @param {string} nombre @param {number} fila @param {Array<*>} valores @returns {void} */
function cargaEscribir_(nombre, fila, valores) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  const v = valores.map(x => { const s = cargaTexto_(x); return /^[=+\-@]/.test(s) ? "'" + s : s; });
  if (!fila) { hoja.appendRow(v); fila = hoja.getLastRow(); }
  hoja.getRange(fila, 1, 1, v.length).setNumberFormat("@").setValues([v]);
}

/** Ejecuta fn con el candado del script tomado (máximo 10 s de espera). @param {function(): *} fn @returns {*} */
function cargaConCandado_(fn) {
  const candado = LockService.getScriptLock();
  candado.waitLock(10000);
  try { return fn(); } finally { candado.releaseLock(); }
}

/** Fecha y hora de Perú en ISO 8601: «2026-10-15T11:01:11-05:00». @param {number} ms Desde 1970 (UTC). @returns {string} */
function cargaFecha_(ms) {
  return new Date(ms - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
}

/** JSON de una celda, o {} si está vacía o dañada. @param {string} texto @returns {Object} */
function cargaJson_(texto) {
  try { const o = JSON.parse(texto); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; }
}

/* ===================== Bloqueo (pestaña Bloqueos: cu, ciclo, carrera, correo, vence) ===================== */

/** Bloqueos de carga del ciclo (de una carrera, o de todas con ""), con su fila y si siguen vigentes.
 * @param {string} ciclo @param {string} carrera @returns {Array<{fila: number, carrera: string, correo: string, vigente: boolean}>} */
function cargaBloqueos_(ciclo, carrera) {
  return cargaFilas_("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
    correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() }))
    .filter(b => b.cu === "carga" && b.ciclo === ciclo && (!carrera || b.carrera === carrera));
}

/** Bloqueo vigente del usuario; si no lo tiene, falla. @param {{correo: string}} u @param {string} ciclo @param {string} carrera @returns {{fila: number}} */
function cargaExigirBloqueo_(u, ciclo, carrera) {
  const mio = cargaBloqueos_(ciclo, carrera).filter(b => b.vigente && b.correo === u.correo)[0];
  if (!mio) cargaFallo_(CARGA_SIN_BLOQUEO_);
  return mio;
}

/** Borra las filas de bloqueo del usuario, de abajo hacia arriba.
 * @param {{correo: string}} u @param {string} ciclo @param {string} carrera @returns {void} */
function cargaSoltar_(u, ciclo, carrera) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bloqueos");
  cargaBloqueos_(ciclo, carrera).filter(b => b.correo === u.correo).reverse().forEach(b => hoja.deleteRow(b.fila));
}

/* ===================== Versiones, planes y catálogo ===================== */

/** Versiones de carga del ciclo (Cargas: ciclo, carrera, version, usuario, fecha, motivo, contenido) y la vigente
 * (la de número más alto) de cada carrera. @param {string} ciclo @returns {{todas: Array<Object>, vigentes: Object<string, Object>}} */
function cargaVersiones_(ciclo) {
  const vigentes = {}, todas = cargaFilas_("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(),
    version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(), motivo: cargaTexto_(f[5]).trim(), contenido: cargaTexto_(f[6]) }))
    .filter(v => v.ciclo === ciclo && v.version > 0);
  todas.forEach(v => { if (!vigentes[v.carrera] || v.version > vigentes[v.carrera].version) vigentes[v.carrera] = v; });
  return { todas, vigentes };
}

/** Asignaciones guardadas en una versión de carga ([] si no hay versión). @param {{contenido: string}|undefined|null} v @returns {Array<Object>} */
function cargaAsignacionesDe_(v) {
  const lista = v ? cargaJson_(v.contenido).asignaciones : null;
  return Array.isArray(lista) ? lista : [];
}

/** Plan vigente de cada carrera del ciclo (Planes: ciclo, carrera, version, usuario, fecha, contenido).
 * @param {string} ciclo @returns {Object<string, {version: number, asignaturas: Array<Object>}>} */
function cargaPlanes_(ciclo) {
  const m = {};
  cargaFilas_("Planes").forEach(f => {
    const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
    if (f[0].trim() === ciclo && v > 0 && (!m[c] || v > m[c].version)) m[c] = { version: v, contenido: f[5] };
  });
  Object.keys(m).forEach(c => { m[c].asignaturas = (cargaJson_(m[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
  return m;
}

/** Catálogo de la pestaña Docentes (DOCENTE, DEPARTAMENTO, CONDICION, DEDICACION, CARGO, TC_OTRA_UNIV, NO_LECTIVAS).
 * @returns {{lista: Array<Object>, porClave: Object<string, Object>}} porClave: por cargaClaveDocente_. */
function cargaCatalogo_() {
  const lista = [], porClave = {};
  cargaFilas_("Docentes").forEach(f => {
    const docente = cargaTexto_(f[0]).replace(/\s+/g, " ").trim(), k = cargaClaveDocente_(docente);
    if (!docente || porClave[k]) return;
    lista.push(porClave[k] = { docente, departamento: cargaTexto_(f[1]).trim().toUpperCase(), condicion: cargaTexto_(f[2]),
      dedicacion: cargaTexto_(f[3]), cargo: cargaTexto_(f[4]).trim(), tcOtra: cargaTexto_(f[5]), noLectivas: cargaTexto_(f[6]) });
  });
  return { lista, porClave };
}

/* ===================== Secciones ===================== */

/** Secciones de la carrera, versiones de su carga y asignaciones vigentes de las otras carreras; si no tiene plan, falla.
 * @param {{ciclo: string, carreras: Array<Object>, car: Object}} ctx
 * @returns {Object} { secciones, noAsignables, porRef, versionPlan, versiones, vigente, otras } */
function cargaEstado_(ctx) {
  const sigla = ctx.car.sigla, planes = cargaPlanes_(ctx.ciclo);
  if (!planes[sigla]) cargaFallo_(sigla + " no tiene plan registrado en " + ctx.ciclo);
  const est = cargaSecciones_(sigla, planes, ctx), { todas, vigentes } = cargaVersiones_(ctx.ciclo);
  return Object.assign(est, { versionPlan: planes[sigla].version, versiones: todas.filter(v => v.carrera === sigla),
    vigente: vigentes[sigla] || null, otras: ctx.carreras.filter(c => c.sigla !== sigla).flatMap(c => cargaAsignacionesDe_(vigentes[c.sigla])) });
}

/** Referencia normalizada de un grupo: «ING|3.1.1.24|1». @param {string} carrera @param {string} codigo @param {number|string} n @returns {string} */
function cargaRef_(carrera, codigo, n) {
  return cargaNormalizar_(carrera) + "|" + cargaNormalizar_(codigo).replace(/ /g, "") + "|" + Number(n);
}

/** Secciones de una carrera: sus grupos sin fusión y las fusiones cuyo principal es suyo. Los grupos fusionados en otra
 * sección van a noAsignables; porRef une la referencia de cada grupo con su fila. @param {string} sigla
 * @param {Object<string, Object>} planes Vigentes de todas las carreras. @param {Object} ctx @returns {Object} { secciones, noAsignables, porRef } */
function cargaSecciones_(sigla, planes, ctx) {
  const existe = {}, fusionDe = {}, grupos = fn => ctx.carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || [])
    .forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
  grupos((c, a, g) => { existe[cargaRef_(c, a.codigo || a.nombre, g.n)] = true; });
  /* Una fusión vive en el plan que la creó; si un grupo está en dos, gana la de su propia carrera. */
  grupos((c, a, g) => {
    const f = g.fusion;
    if (!f || !f.principal || !Array.isArray(f.miembros)) return;
    if (!existe[cargaRef_(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
    f.miembros.forEach(m => {
      const ref = cargaRef_(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[ref], suya = cargaNormalizar_(m.carrera);
      if (!previa || (previa.de !== suya && c === suya)) fusionDe[ref] = { fusion: f, de: c };
    });
  });
  const secciones = [], noAsignables = [], porRef = {};
  planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
    const ref = cargaRef_(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[ref], p = fz ? fz.fusion.principal : null;
    const refP = p ? cargaRef_(p.carrera, p.codigo, p.grupo) : "";
    if (fz && refP !== ref) {
      const misma = cargaNormalizar_(p.carrera) === sigla;
      porRef[ref] = { codigo: cargaTexto_(a.codigo), asignatura: cargaTexto_(a.nombre), semestre: a.semestre, grupo: g.n, dpto: cargaTexto_(a.dpto),
        texto: misma ? "fusionado con el grupo " + p.grupo + " de " + p.codigo : "fusionado con " + p.carrera + " " + p.codigo + " grupo " + p.grupo,
        principalRef: misma ? refP : "", carreraPrincipal: cargaTexto_(p.carrera) };
      noAsignables.push(porRef[ref]);
    } else secciones.push(porRef[ref] = cargaSeccion_(sigla, a, g, fz ? fz.fusion : null));
  }));
  return { secciones, noAsignables, porRef };
}

/** Sección de un grupo (o de la fusión de la que es principal) con sus componentes: T si HT > 0, P si HP > 0, P1…Pn /
 * T1…Tn con desdoble, y un solo T con TH si HT y HP son 0. @param {string} sigla @param {Object} a Asignatura del plan.
 * @param {Object} g Grupo del plan. @param {Object|null} fusion @returns {Object} */
function cargaSeccion_(sigla, a, g, fusion) {
  const avisos = [], componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
  const horas = (v, nombre) => cargaNumero_(v) !== null ? cargaNumero_(v)
    : (cargaTexto_(v).trim() && avisos.push(nombre + " no numérico («" + v + "»): se toma 0."), 0);
  const ht = horas(g.ht, "HT"), hp = horas(g.hp, "HP"), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th, "TH");
  /* Con desdoble del componente, P1…Pn (o T1…Tn), cada uno con las horas de P (o T). */
  const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
    .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
  if (ht > 0) poner("T", ht);
  if (hp > 0) poner("P", hp);
  if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
  const p = fusion ? cargaRef_(fusion.principal.carrera, fusion.principal.codigo, fusion.principal.grupo) : "";
  return { clave: sigla + "|" + cargaTexto_(a.codigo || a.nombre).trim() + "|" + g.n,
    codigo: cargaTexto_(a.codigo), asignatura: cargaTexto_(a.nombre), semestre: a.semestre === undefined ? null : a.semestre,
    grupo: g.n, dpto: cargaTexto_(a.dpto).trim().toUpperCase(), ht, hp, th,
    intl: /INTERNACIONAL|VIRTUAL/.test(cargaNormalizar_(cargaTexto_(g.obs) + " " + cargaTexto_(a.obs))),
    fusion: fusion ? "con " + fusion.miembros.filter(m => cargaRef_(m.carrera, m.codigo, m.grupo) !== p)
      .map(m => m.carrera + " " + m.codigo + "-" + m.grupo).join(", ") : "",
    componentes, avisos };
}

/** Pone los docentes de una carga en las secciones y devuelve las asignaciones que ya no tienen componente (huérfanas).
 * @param {Array<Object>} secciones @param {Array<{clave: string, comp: string, docente: string}>} asignaciones @returns {Array<Object>} */
function cargaLlenar_(secciones, asignaciones) {
  const porComp = {};
  secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = c; }));
  return asignaciones.filter(a => {
    const c = porComp[a.clave + "|" + a.comp];
    if (c) c.docente = cargaTexto_(a.docente);
    return !c;
  }).map(a => ({ clave: a.clave, comp: a.comp, docente: a.docente, codigo: a.codigo || "", horas: a.horas || 0 }));
}

/** Respuesta de cargaAbrir y cargaVersion: las secciones llenadas con una versión de la carga. @param {Object} ctx
 * @param {Object} est De cargaEstado_. @param {Object|null} version @param {Object} modo { modo, motivo, editor, vence } @returns {Object} */
function cargaDocumento_(ctx, est, version, modo) {
  const huerfanas = cargaLlenar_(est.secciones, cargaAsignacionesDe_(version));
  return Object.assign({ ciclo: ctx.ciclo, carrera: ctx.car.sigla, nombre: ctx.car.nombre, departamento: ctx.car.departamento }, modo, {
    version: version ? version.version : 0, versionPlan: est.versionPlan, secciones: est.secciones, noAsignables: est.noAsignables,
    huerfanas, catalogo: cargaCatalogo_().lista.map(d => ({ docente: d.docente, departamento: d.departamento })) });
}

/* ===================== Guardado y reglas ===================== */

/** Sanea las asignaciones (del navegador o de la versión que se restaura) y les aplica las reglas: descarta las vacías y,
 * con un aviso, las repetidas y las que no son un componente del plan vigente; usa el nombre del catálogo y recalcula
 * horas, código, semestre, dpto e intl. @param {string} sigla @param {Object} est De cargaEstado_. @param {Array<*>} lista
 * @param {{porClave: Object}} catalogo @param {string} motivo @returns {Object} { asignaciones, advertencias, bloquea, requiereMotivo } */
function cargaEvaluar_(sigla, est, lista, catalogo, motivo) {
  const porComp = {}, asignaciones = [];
  let descartadas = 0;
  est.secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = { s, c }; }));
  lista.forEach(a => {
    const nombre = a && typeof a.docente === "string" ? a.docente.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    const k = nombre && a.clave + "|" + a.comp, x = porComp[k];
    if (!nombre) return;
    if (!x) return descartadas++;
    delete porComp[k];
    const cat = catalogo.porClave[cargaClaveDocente_(nombre)];
    asignaciones.push({ clave: x.s.clave, comp: x.c.comp, docente: cat ? cat.docente : nombre, horas: x.c.horas,
      codigo: x.s.codigo, semestre: x.s.semestre, dpto: x.s.dpto, intl: x.s.intl });
  });
  const r = cargaReglas_(sigla, asignaciones, est.otras, est.secciones, catalogo, motivo);
  if (descartadas) r.advertencias.unshift({ codigo: "", nivel: "advertencia", docente: "",
    texto: "Se descartaron " + descartadas + " asignaciones que no corresponden a un componente del plan vigente." });
  return Object.assign(r, { asignaciones });
}

/** Reglas A07–A15 y «no está en Docentes» para cada docente de la carga nueva; sus horas suman las cargas vigentes de las
 * otras carreras (otras) y la nueva de esta (nuevas). @param {string} sigla @param {Array<Object>} nuevas @param {Array<Object>} otras
 * @param {Array<Object>} secciones @param {{porClave: Object}} catalogo @param {string} motivo @returns {Object} { advertencias, bloquea, requiereMotivo } */
function cargaReglas_(sigla, nuevas, otras, secciones, catalogo, motivo) {
  const advertencias = [], nombres = {}, n = cargaNormalizar_, todas = otras.concat(nuevas);
  let bloquea = false, requiereMotivo = false;
  const libres = secciones.reduce((t, s) => t + s.componentes.length, 0) - nuevas.length;
  if (libres > 0) advertencias.push({ codigo: "A13", nivel: "advertencia", docente: "", texto: "Quedan " + libres + " componentes sin docente." });
  nuevas.forEach(a => { nombres[cargaClaveDocente_(a.docente)] = a.docente; });
  Object.keys(nombres).sort().forEach(clave => {
    const docente = nombres[clave], cat = catalogo.porClave[clave], es = a => cargaClaveDocente_(a.docente) === clave;
    const suyas = todas.filter(es), aqui = nuevas.filter(es), sem = {};
    const h = Math.round(suyas.reduce((t, a) => t + (Number(a.horas) || 0), 0) * 100) / 100;
    const poner = (codigo, nivel, texto) => advertencias.push({ codigo, nivel, docente, texto });
    if (h > 40) { bloquea = true; poner("A07", "bloqueo", "Supera las 40 h lectivas (" + h + " h). No se puede guardar."); }
    aqui.forEach(a => { if (a.semestre != null) (sem[a.semestre] = sem[a.semestre] || new Set()).add(a.codigo); });
    Object.keys(sem).forEach(s => { if (sem[s].size > 1) poner("A11", "advertencia", "Dicta " + sem[s].size + " cursos distintos en " +
      sigla + ", semestre " + s + " (" + [...sem[s]].join(", ") + ")."); });
    if (!cat) return poner("—", "advertencia", "No está en la pestaña Docentes (" + h + " h en el ciclo).");
    if (n(cat.tcOtra) === "SI" && h > 16) poner("A08", "advertencia", "Tiene tiempo completo en otra universidad y supera las 16 h (" + h + " h).");
    if (n(cat.condicion) === "ORDINARIO" && h > 24) poner("A09", "advertencia", "Docente ordinario con más de 24 h (" + h + " h).");
    if (n(cat.dedicacion) === "TP" && h > 0 && h < 8 && suyas.some(a => !a.intl))
      poner("A10", "advertencia", "Tiempo parcial con menos de 8 h (" + h + " h) y dicta cursos no internacionales.");
    if (cat.cargo && h > 24) {
      requiereMotivo = requiereMotivo || !motivo;
      poner("A12", "motivo", "Tiene cargo (" + cat.cargo + ") y supera las 24 h (" + h + " h): " +
        (motivo ? "se guarda con el motivo." : "escribe un motivo para guardar."));
    } else if (cat.cargo && h > 20) poner("A12", "advertencia", "Tiene cargo (" + cat.cargo + ") y supera las 20 h (" + h + " h).");
    const prestamos = aqui.map(a => a.dpto).filter((d, i, l) => d && cat.departamento && d !== cat.departamento && l.indexOf(d) === i);
    if (prestamos.length) poner("A14", "info", "Es de " + cat.departamento + " y dicta cursos de " + prestamos.join(", ") + " (préstamo).");
    const noLectivas = cargaNumero_(cat.noLectivas);
    if (n(cat.dedicacion) === "TC" && noLectivas !== null && h + noLectivas < 40)
      poner("A15", "advertencia", "Tiempo completo: " + h + " h lectivas + " + noLectivas + " h no lectivas no llegan a 40 h.");
  });
  return { advertencias, bloquea, requiereMotivo };
}

/** Añade una versión a Cargas con la fecha de ahora; si el JSON no cabe en una celda, falla antes de escribir. @param {Object} ctx
 * @param {number} version @param {string} motivo @param {Object} contenido { asignaciones, restauradaDe? } @returns {string} fecha */
function cargaEscribirVersion_(ctx, version, motivo, contenido) {
  const json = JSON.stringify(contenido), fecha = cargaFecha_(Date.now());
  if (json.length > CARGA_MAX_CELDA_) cargaFallo_("La carga no cabe en una celda (" + json.length + " de " + CARGA_MAX_CELDA_ + " caracteres).");
  cargaEscribir_("Cargas", 0, [ctx.ciclo, ctx.car.sigla, version, ctx.u.correo, fecha, motivo, json]);
  return fecha;
}

/* ===================== Carga masiva (formato CargaXDepartamento) ===================== */

/** Lee el formato CargaXDepartamento: DOCENTE vacío hereda el de arriba y una fila con una celda que empieza por TOTAL
 * termina el bloque; solo cuentan las filas de la carrera con CODIGO, y cada una se empareja con una sección por CODIGO +
 * grupo (SEMESTRE «1-2» → 2). @param {string} texto @param {string} sigla @param {Object} est De cargaSecciones_.
 * @param {{porClave: Object}} catalogo @returns {Object} { asignaciones, sinSeccion, noEnCatalogo, descartadas, avisos } */
function cargaLeerMasivo_(texto, sigla, est, catalogo) {
  const filas = cargaFilasTexto_(texto), norm = filas.map(f => f.map(cargaNormalizar_));
  const ic = norm.findIndex(f => f.indexOf("DOCENTE") >= 0 && f.indexOf("CODIGO") >= 0);
  if (ic < 0) cargaFallo_("No encontré la fila de cabeceras (DOCENTE, CODIGO…).");
  const col = nombres => norm[ic].findIndex(c => nombres.indexOf(c) >= 0), celda = (f, i) => cargaTexto_(f[i]).replace(/\s+/g, " ").trim();
  const k = { docente: col(["DOCENTE"]), carrera: col(["CARRERA"]), semestre: col(["SEMESTRE"]), codigo: col(["CODIGO"]),
    asignatura: col(["ASIGNATURA", "CURSO"]), ht: col(["HORAS TEORICAS", "HT"]), hp: col(["HORAS PRACTICAS", "HP"]) };
  const r = { asignaciones: [], sinSeccion: [], noEnCatalogo: [], descartadas: 0, avisos: [] }, usados = {};
  let docente = "";
  for (let i = ic + 1; i < filas.length; i++) {
    const f = filas[i], fila = i + 1, codigo = celda(f, k.codigo), asignatura = celda(f, k.asignatura);
    /* «TOTAL» (DIMA) o «TOTAL PROFESORES»… en la columna CÓDIGO (DACJ): fin del bloque del docente. */
    if (norm[i].some(c => /^TOTAL\b/.test(c))) { docente = ""; continue; }
    if (celda(f, k.docente)) docente = celda(f, k.docente);
    if (!codigo) continue;
    const carrera = cargaNormalizar_(celda(f, k.carrera));
    if (carrera && carrera !== sigla) { r.descartadas++; continue; }
    const m = /^\d+\s*-\s*(\d+)$/.exec(celda(f, k.semestre)), grupo = m ? Number(m[1]) : 1;
    const sin = motivo => r.sinSeccion.push({ fila, codigo, grupo, asignatura, docente, motivo });
    if (!docente) { sin("sin docente"); continue; }
    let s = est.porRef[cargaRef_(sigla, codigo, grupo)];
    if (s && !s.componentes && !s.principalRef) { sin("se asigna en " + s.carreraPrincipal); continue; }
    if (s && !s.componentes) s = est.porRef[s.principalRef];
    if (!s) { sin("no está en el plan"); continue; }
    const ht = cargaNumero_(celda(f, k.ht)) || 0, hp = cargaNumero_(celda(f, k.hp)) || 0;
    const bases = ["T", "P"].filter(b => (ht > 0 || hp > 0 ? (b === "T" ? ht : hp) > 0 : s.componentes.some(c => c.comp[0] === b)));
    if (!bases.length) { sin("la sección no tiene horas en el plan"); continue; }
    const cat = catalogo.porClave[cargaClaveDocente_(docente)], nombre = cat ? cat.docente : docente.slice(0, 120);
    bases.forEach(b => {
      const candidatos = s.componentes.filter(c => c.comp[0] === b), libre = candidatos.filter(c => !usados[s.clave + "|" + c.comp])[0];
      if (!candidatos.length) return sin("el plan no tiene componente " + b);
      if (!libre) return r.avisos.push("Fila " + fila + ": " + s.codigo + " grupo " + s.grupo + " (" + b + ") ya se asignó en la fila " +
        usados[s.clave + "|" + candidatos[0].comp] + "; se queda la primera.");
      usados[s.clave + "|" + libre.comp] = fila;
      r.asignaciones.push({ clave: s.clave, comp: libre.comp, docente: nombre, fila, codigo: s.codigo, grupo: s.grupo, asignatura: s.asignatura });
      if (!cat && r.noEnCatalogo.indexOf(nombre) < 0) r.noEnCatalogo.push(nombre);
    });
  }
  if (r.descartadas) r.avisos.unshift("Se descartaron " + r.descartadas + " filas de otra carrera.");
  if (r.sinSeccion.length) r.avisos.push(r.sinSeccion.length + " filas sin sección asignable en el plan.");
  return r;
}

/** Filas de un texto pegado o de un CSV. Separador: tabulación si aparece en las 5 primeras líneas no vacías (la hoja real
 * empieza con una fecha en una sola celda); si no, «;» o «,», el que más aparezca. Comillas al estilo Excel: un campo entre
 * comillas puede tener separadores y saltos de línea. @param {string} texto @returns {string[][]} */
function cargaFilasTexto_(texto) {
  const t = cargaTexto_(texto).replace(/^\uFEFF/, ""), primeras = t.split(/\r?\n/).filter(l => l.trim()).slice(0, 5).join("\n");
  const cuenta = c => primeras.split(c).length - 1, filas = [];
  const sep = cuenta("\t") ? "\t" : (cuenta(",") > cuenta(";") ? "," : ";");
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (comillas) {
      if (ch !== '"') campo += ch;
      else if (t[i + 1] === '"') { campo += '"'; i++; }
      else comillas = false;
    } else if (ch === '"' && campo === "") comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      fila.push(campo); filas.push(fila); fila = []; campo = "";
    } else campo += ch;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

/* ===================== Texto ===================== */

/** Texto de cualquier valor ("" si es null o undefined). @param {*} v @returns {string} */
function cargaTexto_(v) {
  return v === null || v === undefined ? "" : String(v);
}

/** Mayúsculas, sin tildes ni diéresis, y espacios o saltos de línea seguidos → un espacio. @param {*} s @returns {string} */
function cargaNormalizar_(s) {
  return cargaTexto_(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Nombre de docente para comparar: normalizado y sin comas ni puntos. @param {*} nombre @returns {string} */
function cargaClaveDocente_(nombre) {
  return cargaNormalizar_(cargaTexto_(nombre).replace(/[.,]/g, " "));
}

/** Número de un texto (acepta coma decimal), o null. @param {*} v @returns {number|null} */
function cargaNumero_(v) {
  const s = cargaTexto_(v).trim().replace(",", ".");
  return s !== "" && isFinite(Number(s)) ? Number(s) : null;
}
