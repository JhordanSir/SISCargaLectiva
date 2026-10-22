// @ts-check
/* Datos de la carga docente (CU-002): el repositorio REPO_CARGA_ de comun/Versionado.js.
   Cada carrera tiene su carga en cada ciclo: la lista de asignaciones de las secciones de su
   plan Registrado. Cargas apunta a la versión vigente; cada guardado añade una fila a
   VersionesCarga con la versión de cada plan que se tenía a la vista. */

var REPO_CARGA_ = { indice: "Cargas", versiones: "VersionesCarga", clave: "carrera", cache: "vcc", nombre: "de la carga" };

/**
 * Fila de la carga de una carrera en Cargas, o null.
 * @param {string} ciclo
 * @param {string} carrera Sigla de la carrera (o la de un departamento, en las cargas de antes de la migración).
 * @returns {FilaTabla|null}
 */
function filaCarga_(ciclo, carrera) {
  return filaIndice_(REPO_CARGA_, ciclo, carrera);
}

/**
 * Asignaciones de una versión de la carga.
 * @param {string} ciclo
 * @param {string} carrera Sigla de la carrera (o la de un departamento, en las cargas de antes de la migración).
 * @param {number} n
 * @param {number} filaVersion
 * @returns {Asignacion[]}
 */
function contenidoCarga_(ciclo, carrera, n, filaVersion) {
  return contenidoVersion_(REPO_CARGA_, ciclo, carrera, n, filaVersion);
}

/**
 * Versiones de la carga, con «planes» (la versión de cada plan a la vista al guardar).
 * @param {string} ciclo
 * @param {string} carrera Sigla de la carrera (o la de un departamento, en las cargas de antes de la migración).
 * @param {number} vigente
 * @returns {Array<FilaTabla & {n: number, planes: Object<string, number>}>}
 */
function metaVersionesCarga_(ciclo, carrera, vigente) {
  return metaVersiones_(REPO_CARGA_, ciclo, carrera, vigente).map(function (v) {
    /** @type {Object<string, number>} */
    let planes = {};
    try { planes = v.planes ? JSON.parse(v.planes) : {}; } catch (e) { planes = {}; }
    return Object.assign({}, v, { planes: planes });
  });
}

/**
 * Carga vigente de cada carrera: {ING: {version, asignaciones, usuario, fecha}, …}, con
 * todas las carreras aunque no tengan carga. Una carga por departamento de antes de la
 * migración (instalar()) aparece también con su sigla: sus asignaciones se ven como
 * heredadas hasta que se migran. filas (opcional): las filas de Cargas del ciclo.
 * @param {string} ciclo
 * @param {FilaTabla[]=} filas
 * @returns {Object<string, Carga>}
 */
function cargasVigentes_(ciclo, filas) {
  filas = filas || leerIndice_(REPO_CARGA_).filter(function (f) { return f.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(REPO_CARGA_, ciclo, filas);
  const claves = Dominio.CARRERAS.map(function (c) { return c.sig; });
  filas.forEach(function (f) { if (claves.indexOf(f.carrera) < 0) claves.push(f.carrera); });
  /** @type {Object<string, Carga>} */
  const res = {};
  claves.forEach(function (k) {
    const f = buscarEnIndice_(REPO_CARGA_, filas, ciclo, k);
    res[k] = { version: vigente_(f).version, usuario: f ? f.actualizado_por : "", fecha: f ? f.actualizado_en : "", asignaciones: contenidos[k] || [] };
  });
  return res;
}

/**
 * Las asignaciones de cada carga: {ING: [asig…], …}.
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
 * @param {Sigla} carrera
 * @param {FilaTabla|null} fila
 * @param {{tipo: string, usuario: string, fecha: string, motivo?: string, planes?: Object<string, number>, asignaciones: Asignacion[]}} datos
 * @returns {number}
 */
function registrarVersionCarga_(ciclo, carrera, fila, datos) {
  return registrarVersion_(REPO_CARGA_, ciclo, carrera, fila, {
    usuario: datos.usuario, fecha: datos.fecha, contenido: datos.asignaciones,
    meta: { tipo: datos.tipo, motivo: datos.motivo || "", planes: JSON.stringify(datos.planes || {}) }
  });
}
