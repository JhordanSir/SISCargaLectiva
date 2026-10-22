// @ts-check
/* Entradas de la pantalla de asignación docente (cu002/Asignacion.html) en modo de
   consulta. Validan, comprueban la cuenta y delegan en CargaServicio.js. La derivación de
   una sección (FA-079) es común con CU-001: está en comun/Derivacion.js. */

/**
 * CU-002 pasos 7 a 17 y FA-006 a FA-014: secciones del ciclo, cargas de todas las carreras
 * (para el balance), catálogo de docentes, avisos y bloqueo de la carga de la carrera.
 * @param {string} ciclo
 * @param {Sigla=} carrera Por defecto, la primera del departamento del director.
 * @returns {Respuesta<Object>}
 */
function asignacionObtener(ciclo, carrera) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo || config_().cicloXlsx);
    const s = validarCarrera_(carrera || carreraPorDefecto_(usuario));
    return cargaDeCarrera_(usuario, c, s);
  });
}

/**
 * CU-002 FA-084 y FA-085: versiones de la carga de una carrera.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {Respuesta<MetaVersion[]>}
 */
function asignacionHistorial(ciclo, carrera) {
  return responder_(function () {
    exigirUsuario_();
    return historialCarga_(validarCiclo_(ciclo), validarCarrera_(carrera));
  });
}

/**
 * CU-002 FA-086: asignaciones de una versión de la carga (con DNI solo para su director).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {Respuesta<Asignacion[]>}
 */
function asignacionVerVersion(ciclo, carrera, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    return versionCarga_(usuario, validarCiclo_(ciclo), validarCarrera_(carrera), n);
  });
}
