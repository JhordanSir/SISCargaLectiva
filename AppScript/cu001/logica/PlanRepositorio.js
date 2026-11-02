// @ts-check
/* Datos de los planes de ciclo (CU-001): el repositorio REPO_PLAN_ de base/Versionado.js.
   La fila de cada plan en la pestaña Planes guarda su estado, su versión vigente, sus
   totales y la firma de las pestañas de las que salió; cada guardado añade una fila a Versiones. */

var REPO_PLAN_ = { indice: "Planes", versiones: "Versiones", clave: "carrera", cache: "v", nombre: "del plan" };

/**
 * Filas de la pestaña Planes (todos los ciclos).
 * @returns {FilaTabla[]}
 */
function leerPlanes_() {
  return leerIndice_(REPO_PLAN_);
}

/**
 * Fila de un plan entre las filas de Planes, o null.
 * @param {FilaTabla[]} planes
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {FilaTabla|null}
 */
function buscarPlan_(planes, ciclo, sig) {
  return buscarEnIndice_(REPO_PLAN_, planes, ciclo, sig);
}

/**
 * Fila de un plan en Planes, o null.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {FilaTabla|null}
 */
function filaPlan_(ciclo, sig) {
  return filaIndice_(REPO_PLAN_, ciclo, sig);
}

/**
 * Estado, versión vigente y totales de un plan según su fila.
 * @param {FilaTabla|null|undefined} fila
 * @returns {{estado: string, version: number, totales: (Totales|null), filaVersion: number}}
 */
function estadoDePlan_(fila) {
  const v = vigente_(fila);
  return {
    estado: fila && fila.estado ? fila.estado : Dominio.ESTADOS.SIN,
    version: v.version,
    totales: fila && fila.totales ? JSON.parse(fila.totales) : null,
    filaVersion: v.filaVersion
  };
}

/**
 * Contenido de una versión del plan.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number} n
 * @param {number=} filaVersion
 * @returns {Asignatura[]}
 */
function contenidoPlan_(ciclo, sig, n, filaVersion) {
  return contenidoVersion_(REPO_PLAN_, ciclo, sig, n, filaVersion);
}

/**
 * Versiones de un plan (sin su contenido), de la más antigua a la más reciente.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number=} vigente
 * @returns {Array<FilaTabla & {n: number}>}
 */
function versionesDelPlan_(ciclo, sig, vigente) {
  return metaVersiones_(REPO_PLAN_, ciclo, sig, vigente);
}

/**
 * Datos de una versión que se envían al navegador (sin su fila).
 * @param {FilaTabla & {n: number}} v Una versión de versionesDelPlan_.
 * @returns {MetaVersion}
 */
function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

/**
 * Debe llamarse dentro de conCandado_. datos: {estado, tipo, usuario, fecha, motivo,
 * asignaturas, firma_hoja?}. Devuelve el número de la versión nueva.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {FilaTabla|null} fila
 * @param {{estado: string, tipo: string, usuario: string, fecha: string, motivo?: string, asignaturas: Asignatura[], firma_hoja?: string}} datos
 * @returns {number}
 */
function registrarVersionPlan_(ciclo, sig, fila, datos) {
  const indice = { estado: datos.estado, totales: JSON.stringify(Dominio.totales(datos.asignaturas)) };
  if (datos.firma_hoja != null) indice.firma_hoja = datos.firma_hoja;
  return registrarVersion_(REPO_PLAN_, ciclo, sig, fila, {
    usuario: datos.usuario, fecha: datos.fecha, contenido: datos.asignaturas, indice: indice,
    meta: { estado: datos.estado, tipo: datos.tipo, motivo: datos.motivo || "" }
  });
}

/**
 * Planes del ciclo con su contenido vigente (los usa también CU-002 para armar las
 * secciones). filas (opcional): las filas de Planes del ciclo, si ya se leyeron.
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
