// @ts-check
/* Entradas de la asignación docente en modo de edición (cu002/AsignacionEdicion.html y
   AsignacionCarga.html). Validan, comprueban que la cuenta asigna esa carga y delegan en
   CargaServicio.js. El latido del bloqueo, su liberación y la copia de recuperación son
   comunes con CU-001: están en comun/SesionEdicion.js. */

/**
 * CU-002 pasos 18 a 23, FA-015, FA-016 y FA-017: toma el bloqueo de la carga y devuelve su
 * versión vigente y la copia de recuperación de la cuenta, si la hay. versionConocida: la
 * versión que el navegador ya tiene (si sigue vigente, no se reenvían las asignaciones).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number=} versionConocida
 * @returns {Respuesta<{version: number, expira: string, recuperacion: (Recuperacion|null), asignaciones?: Asignacion[]}>}
 */
function asignacionEdicionAbrir(ciclo, carrera, versionConocida) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    exigirCarga_(usuario, s, seccionesDelCiclo_(c));
    return abrirEdicionCarga_(usuario, c, s, versionConocida);
  });
}

/**
 * CU-002 pasos 61 a 80 («Guardar asignaciones») con FA-103 a FA-109, y FA-112 (autoguardado
 * al expirar). datos: {asignaciones, versionBase, tipo, motivo, motivoExceso, forzar}.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {Object} datos
 * @returns {Respuesta<{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}>}
 */
function asignacionEdicionGuardar(ciclo, carrera, datos) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    return guardarCarga_(usuario, validarCiclo_(ciclo), validarCarrera_(carrera), datos);
  });
}

/**
 * CU-002 FA-087 y FA-088: restaura la versión n de la carga como una versión nueva (no
 * borra el historial); cada director solo restaura las secciones que le tocan.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {Respuesta<{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}>}
 */
function asignacionEdicionRestaurar(ciclo, carrera, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    exigirCargaEnEdicion_(usuario, c, s);
    return restaurarCarga_(usuario, c, s, n);
  });
}
