// @ts-check
/* Entradas de la pantalla «Planes de ciclo» (cu001/Tablero.html). Validan, comprueban la
   cuenta y delegan en PlanServicio.js y OfertaDrive.js. */

/**
 * CU-001 pasos 9 a 11 (tablero del ciclo elegido) y FA-009 a FA-012 («Releer Excel»).
 * Mira los xlsx de Drive si toca, o en el momento con opciones.releer, y devuelve las filas.
 * @param {string} ciclo
 * @param {{releer?: boolean}=} opciones
 * @returns {Respuesta<{avisos: Aviso[], filas: FilaTablero[]}>}
 */
function tableroObtener(ciclo, opciones) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo);
    const avisos = sincronizarFuentes_(!!(opciones && opciones.releer));
    return { avisos: avisos, filas: leerTablero_(c) };
  });
}
