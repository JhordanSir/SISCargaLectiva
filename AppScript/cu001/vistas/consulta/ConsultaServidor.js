// @ts-check
/* Entradas de la consulta de un plan en solo lectura (Consulta.html):
   leer el plan y derivar una asignatura (FA-005), cuya lógica está en
   cu001/logica/DerivacionPlan.js. */

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

/**
 * CU-001 FA-005 a FA-008: deriva la asignatura del grupo grupoId al departamento «nuevo»
 * (cu001/logica/DerivacionPlan.js).
 * @param {string} ciclo
 * @param {Sigla} sig Carrera del plan (en una sección fusionada, la del grupo principal).
 * @param {string} grupoId
 * @param {Dpto} nuevo
 * @param {string=} motivo
 * @returns {Respuesta<{version: number, estado: string, totales: Totales, contenido: Asignatura[], sinCambios?: boolean}>}
 */
function consultaDerivar(ciclo, sig, grupoId, nuevo, motivo) {
  return responder_(function () { return derivarDesdeEntrada_(ciclo, sig, grupoId, nuevo, motivo); });
}
