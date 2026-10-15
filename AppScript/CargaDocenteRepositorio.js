// @ts-check
/* Datos de la asignación docente (CU-002): los planes del ciclo, la carga de cada
   departamento (repositorio REPO_CARGA_ de Versionado.js), lo que no cuadra entre ambos y
   lo que cada cuenta puede ver. */

/**
 * Planes del ciclo con su contenido vigente. filas (opcional): las filas de Planes del
 * ciclo, si ya se leyeron.
 * @param {string} ciclo
 * @param {FilaTabla[]=} filas
 * @returns {Array<{sig: Sigla, estado: string, version: number, contenido: Asignatura[], usuario: string, fecha: string}>}
 */
function planesDelCiclo_(ciclo, filas) {
  filas = filas || leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(REPO_PLAN_, ciclo, filas);
  return Dominio.CARRERAS.map(function (c) {
    const fila = buscarPlan_(filas, ciclo, c.sig);
    const p = estadoDePlan_(fila);
    return { sig: c.sig, estado: p.estado, version: p.version, contenido: contenidos[c.sig] || [],
             usuario: fila ? fila.actualizado_por : "", fecha: fila ? fila.actualizado_en : "" };
  });
}

/**
 * Carga docente de un departamento: repositorio REPO_CARGA_ (Versionado.js).
 * @param {string} ciclo
 * @param {Dpto} dpto
 * @returns {FilaTabla|null}
 */
function filaCarga_(ciclo, dpto) {
  return filaIndice_(REPO_CARGA_, ciclo, dpto);
}

/**
 * Asignaciones de una versión de la carga.
 * @param {string} ciclo
 * @param {Dpto} dpto
 * @param {number} n
 * @param {number} filaVersion
 * @returns {Asignacion[]}
 */
function contenidoCarga_(ciclo, dpto, n, filaVersion) {
  return contenidoVersion_(REPO_CARGA_, ciclo, dpto, n, filaVersion);
}

/**
 * Versiones de la carga, con «planes» (la versión de cada plan a la vista al guardar).
 * @param {string} ciclo
 * @param {Dpto} dpto
 * @param {number} vigente
 * @returns {Array<FilaTabla & {n: number, planes: Object<string, number>}>}
 */
function metaVersionesCarga_(ciclo, dpto, vigente) {
  return metaVersiones_(REPO_CARGA_, ciclo, dpto, vigente).map(function (v) {
    /** @type {Object<string, number>} */
    let planes = {};
    try { planes = v.planes ? JSON.parse(v.planes) : {}; } catch (e) { planes = {}; }
    return Object.assign({}, v, { planes: planes });
  });
}

/**
 * Carga vigente de cada departamento: {DIMA: {version, asignaciones, usuario, fecha}, …}.
 * filas (opcional): las filas de Cargas del ciclo, si ya se leyeron.
 * @param {string} ciclo
 * @param {FilaTabla[]=} filas
 * @returns {Object<string, Carga>}
 */
function cargasVigentes_(ciclo, filas) {
  filas = filas || leerIndice_(REPO_CARGA_).filter(function (f) { return f.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(REPO_CARGA_, ciclo, filas);
  /** @type {Object<string, Carga>} */
  const res = {};
  Dominio.DPTOS.forEach(function (d) {
    const f = buscarEnIndice_(REPO_CARGA_, filas, ciclo, d);
    res[d] = { version: vigente_(f).version, usuario: f ? f.actualizado_por : "", fecha: f ? f.actualizado_en : "", asignaciones: contenidos[d] || [] };
  });
  return res;
}

/**
 * Las asignaciones de cada carga: {DIMA: [asig…], …}.
 * @param {Object<string, Carga>} cargas
 * @returns {Object<string, Asignacion[]>}
 */
function soloAsignaciones_(cargas) {
  /** @type {Object<string, Asignacion[]>} */
  const r = {};
  Object.keys(cargas).forEach(function (d) { r[d] = cargas[d].asignaciones; });
  return r;
}

/**
 * Debe llamarse dentro de conCandado_. datos: {tipo, usuario, fecha, motivo, planes,
 * asignaciones}. Devuelve el número de la versión nueva.
 * @param {string} ciclo
 * @param {Dpto} dpto
 * @param {FilaTabla|null} fila
 * @param {{tipo: string, usuario: string, fecha: string, motivo?: string, planes?: Object<string, number>, asignaciones: Asignacion[]}} datos
 * @returns {number}
 */
function registrarVersionCarga_(ciclo, dpto, fila, datos) {
  return registrarVersion_(REPO_CARGA_, ciclo, dpto, fila, {
    usuario: datos.usuario, fecha: datos.fecha, contenido: datos.asignaciones,
    meta: { tipo: datos.tipo, motivo: datos.motivo || "", planes: JSON.stringify(datos.planes || {}) }
  });
}

/**
 * Grupos de cada plan que ya tienen docente: {ADM: {grupoId: ["Apellido, Nombre (DIMA)"]}}.
 * Calcularlo lee las cargas de los cuatro departamentos y arma las secciones del ciclo,
 * así que se guarda en la caché con la versión de cada plan y de cada carga en la clave:
 * cualquier guardado cambia la clave, y nunca se sirve un resultado viejo.
 * @param {string} ciclo
 * @returns {Object<string, Object<string, string[]>>}
 */
function docentesPorGrupo_(ciclo) {
  const filasPlan = leerPlanes_().filter(function (f) { return f.ciclo === ciclo; });
  if (!filasPlan.length) return {};
  const filasCarga = leerIndice_(REPO_CARGA_).filter(function (f) { return f.ciclo === ciclo; });
  const firma = filasPlan.map(function (f) { return "p:" + f.carrera + ":" + vigente_(f).version; })
    .concat(filasCarga.map(function (f) { return "c:" + f.departamento + ":" + vigente_(f).version; }))
    .sort().join(",");
  const clave = claveCache_("docentes", ciclo + ":" + Dominio.hash(firma));
  const guardado = leerDeCache_(clave);
  if (guardado) return guardado;

  /** @type {Object<string, Object<string, string[]>>} */
  const res = {};
  const unidades = Dominio.unidadesDelCiclo(planesDelCiclo_(ciclo, filasPlan));
  if (unidades.length) {
    const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargasVigentes_(ciclo, filasCarga)));
    vig.porUnidad.forEach(function (asigs, id) {
      const seccion = vig.idx.porId.get(id);
      const nombres = asigs.filter(function (a) { return String(a.docente || "").trim(); })
        .map(function (a) { return a.docente + " (" + a.dptoCarga + ")"; })
        .filter(function (x, i, l) { return l.indexOf(x) === i; });
      if (!nombres.length) return;
      seccion.miembros.forEach(function (m) { (res[m.carrera] = res[m.carrera] || {})[m.grupoId] = nombres; });
    });
  }
  guardarEnCache_(clave, res, SEGUNDOS_CACHE_VERSION_);
  return res;
}

/**
 * Lo que no cuadra entre los planes y la última carga guardada de un departamento:
 * planes que cambiaron después y asignaciones que se quedaron sin sección.
 * @param {Dpto} dpto
 * @param {Array<{sig: Sigla, version: number, usuario?: string}>} planes
 * @param {{planes?: Object<string, number>}|null} meta Última versión de la carga.
 * @param {Object<string, Asignacion[]>} sinSeccion
 * @returns {Aviso[]}
 */
function avisosDeCarga_(dpto, planes, meta, sinSeccion) {
  const avisos = [];
  const vistos = meta ? meta.planes || {} : {};
  if (meta) planes.forEach(function (p) {
    const antes = parseInt(String(vistos[p.sig]), 10) || 0;
    if (p.version > antes && antes > 0)
      avisos.push(Dominio.aviso("PLAN_CAMBIADO", "El plan de " + Dominio.nombreCarrera(p.sig) + " cambió después del último guardado de esta carga (v" +
                  antes + " → v" + p.version + (p.usuario ? ", " + p.usuario : "") + "). Revisa sus secciones.",
                  { carrera: p.sig, antes: antes, ahora: p.version, usuario: p.usuario || "" }));
  });
  const n = (sinSeccion[dpto] || []).length;
  if (n) avisos.push(Dominio.aviso("SIN_SECCION", n === 1 ? "1 asignación se quedó sin sección en el plan: reasígnala o quítala."
                                                      : n + " asignaciones se quedaron sin sección en el plan: reasígnalas o quítalas.", { cuantas: n }));
  return avisos;
}

/**
 * Quita de la carga las asignaciones de secciones que hoy piden docente a otro
 * departamento cuando ese departamento ya tiene las suyas: ya no le corresponden.
 * @param {Dpto} dpto
 * @param {Asignacion[]} asignaciones
 * @param {Seccion[]} unidades
 * @param {Object<string, Asignacion[]>} cargas
 * @returns {Asignacion[]}
 */
function depurarCarga_(dpto, asignaciones, unidades, cargas) {
  const idx = Dominio.indiceUnidades(unidades);
  return asignaciones.filter(function (a) {
    const seccion = Dominio.unidadDe(idx, a);
    if (!seccion || seccion.dpto === dpto) return true;
    return !(cargas[seccion.dpto] || []).some(function (x) { const v = Dominio.unidadDe(idx, x); return v && v.id === seccion.id; });
  });
}

/**
 * El DNI solo lo recibe el director del departamento: el de sus docentes en el catálogo
 * y el de las asignaciones de su propia carga. Los demás identifican a los docentes por
 * su nombre.
 * @template {Object} T
 * @param {T} x
 * @returns {T}
 */
function sinDni_(x) {
  /** @type {Object<string, *>} */
  const c = Object.assign({}, x);
  delete c.dni;
  if (Array.isArray(c.historial)) c.historial = c.historial.map(function (h) { const y = Object.assign({}, h); delete y.dni; return y; });
  return /** @type {T} */ (c);
}

/**
 * El catálogo que ve la cuenta: con DNI solo los docentes de su departamento, si es su director.
 * @param {DocenteCatalogo[]} docentes
 * @param {Usuario} usuario
 * @param {Dpto} dpto
 * @returns {DocenteCatalogo[]}
 */
function catalogoVisible_(docentes, usuario, dpto) {
  const puede = puedeEditarCarga_(usuario, dpto);
  return docentes.map(function (doc) { return puede && doc.dpto === dpto ? doc : sinDni_(doc); });
}

/**
 * Las cargas que ve la cuenta: con DNI solo la de su departamento, si es su director.
 * @param {Object<string, Carga>} cargas
 * @param {Usuario} usuario
 * @param {Dpto} dpto
 * @returns {Object<string, Carga>}
 */
function cargasVisibles_(cargas, usuario, dpto) {
  const puede = puedeEditarCarga_(usuario, dpto);
  /** @type {Object<string, Carga>} */
  const r = {};
  Object.keys(cargas).forEach(function (k) {
    r[k] = Object.assign({}, cargas[k], { asignaciones: puede && k === dpto ? cargas[k].asignaciones : cargas[k].asignaciones.map(sinDni_) });
  });
  return r;
}
