// @ts-check
/* Entradas de la consulta de un plan en solo lectura (cu001/Consulta.html). La derivación
   de una asignatura (FA-005) es común con CU-002: está en comun/Derivacion.js. */

/**
 * CU-001 FA-013: contenido vigente de un plan para consultarlo. El navegador solo lo pide
 * si el tablero no lo trajo.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {Respuesta<{estado: string, version: number, asignaturas: Asignatura[], bloqueo: (Bloqueo|null)}>}
 */
function consultaObtener(ciclo, sig) {
  return responder_(function () {
    exigirUsuario_();
    return planVigente_(validarCiclo_(ciclo), validarCarrera_(sig));
  });
}
