// @ts-check
/* Docentes ya asignados a cada grupo de los planes del ciclo (comun/DocentesAsignados.html).
   Las pantallas de CU-001 los muestran en la consulta (FA-013, columna del docente) y en la
   grilla, y los usan para advertir antes de eliminar un grupo o una asignatura con docente
   (FA-057, FA-064, FA-071). Salen de las cargas docentes de CU-002 (docentesPorGrupo_). */

/**
 * {ADM: {grupoId: ["Apellido, Nombre (DIMA)"]}} de los planes del ciclo. El navegador lo
 * pide aparte del tablero y en segundo plano.
 * @param {string} ciclo
 * @returns {Respuesta<Object<string, Object<string, string[]>>>}
 */
function docentesAsignadosObtener(ciclo) {
  return responder_(function () {
    exigirUsuario_();
    return docentesPorGrupo_(validarCiclo_(ciclo));
  });
}
