// @ts-check
/* Entradas de la edición del plan de ciclo (EdicionPlan*.html y CargaOferta.html).
   Validan, comprueban que la cuenta coordina la carrera y delegan en PlanServicio.js. Al
   final, las de la sesión de edición: latido del bloqueo, liberación y copia de recuperación,
   que usan base/Sesiones.js igual que las de CU-002. */

/**
 * CU-001 pasos 13 a 18, FA-014, FA-015, FA-016 y FA-104: toma el bloqueo del plan y
 * devuelve su contenido vigente y la copia de recuperación de la cuenta, si la hay.
 * versionConocida: la versión que el navegador ya tiene (si sigue vigente, no se reenvía).
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number=} versionConocida
 * @returns {Respuesta<{estado: string, version: number, expira: string, asignaturas?: Asignatura[], recuperacion: (Recuperacion|null)}>}
 */
function edicionPlanAbrir(ciclo, sig, versionConocida) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicionPlan_(usuario, s);
    return abrirEdicionPlan_(usuario, c, s, versionConocida);
  });
}

/**
 * CU-001 pasos 43 a 50 («Registrar plan»), FA-105 («Guardar borrador»), FA-110 («Guardar
 * cambios»), FA-117 y FA-118 (autoguardado al expirar), con FA-099, FA-108 y FA-113 (versión
 * más reciente) y FA-101 a FA-103 (fusiones con otras carreras).
 * datos: {asignaturas, estado, tipo, motivo, versionBase, forzar, fusionesDisueltas}.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {{asignaturas: Asignatura[], estado: string, tipo: string, motivo?: string, versionBase: number, forzar?: boolean, fusionesDisueltas?: string[]}} datos
 * @returns {Respuesta<{version: number, estado: string, fecha: string, expira: (string|null), asignaturas: Asignatura[], otros: Array<Object>}>}
 */
function edicionPlanGuardar(ciclo, sig, datos) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicionPlan_(usuario, s);
    const T = Dominio.TIPO_VERSION;
    if (!datos || [T.BORRADOR, T.REGISTRAR, T.CAMBIOS, T.AUTOGUARDADO].indexOf(datos.tipo) < 0) fallo_("DATO_INVALIDO", "Tipo de guardado desconocido.");
    return guardarPlan_(usuario, c, s, datos);
  });
}

/**
 * CU-001 FA-092 y FA-093: versiones del plan, de la más antigua a la más reciente.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {Respuesta<MetaVersion[]>}
 */
function edicionPlanHistorial(ciclo, sig) {
  return responder_(function () {
    exigirUsuario_();
    return historialPlan_(validarCiclo_(ciclo), validarCarrera_(sig));
  });
}

/**
 * CU-001 FA-094: restaura la versión n como una versión nueva (no borra el historial).
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number} n
 * @returns {Respuesta<{version: number, estado: string, asignaturas: Asignatura[], otros: Array<Object>, expira: (string|null)}>}
 */
function edicionPlanRestaurar(ciclo, sig, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicionPlan_(usuario, s);
    return restaurarPlan_(usuario, c, s, n);
  });
}

/* ---------- sesión de edición (base/SesionEdicion.html la llama con estos nombres) ---------- */

/**
 * CU-001 paso 16: renueva el bloqueo de el plan mientras hay actividad (base/Sesiones.js).
 * @param {string} ciclo
 * @param {Ref} ref «plan:ADM».
 * @returns {Respuesta<{expira: string}>}
 */
function edicionPlanRenovar(ciclo, ref) {
  return responder_(function () { return renovarSesion_("plan", ciclo, ref); });
}

/**
 * Suelta el bloqueo de el plan al terminar la edición o al cerrar la página.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {Respuesta<boolean>}
 */
function edicionPlanLiberar(ciclo, ref) {
  return responder_(function () { return liberarSesion_("plan", ciclo, ref); });
}

/**
 * Copia de recuperación de el plan, cada minuto mientras hay cambios sin guardar.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {{contenido: *, versionBase: number}} datos
 * @returns {Respuesta<{fecha: (string|null), omitida?: boolean}>}
 */
function edicionPlanGuardarCopia(ciclo, ref, datos) {
  return responder_(function () { return guardarCopiaSesion_("plan", ciclo, ref, datos); });
}

/**
 * Borra la copia de recuperación de el plan.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {Respuesta<boolean>}
 */
function edicionPlanDescartarCopia(ciclo, ref) {
  return responder_(function () { return descartarCopiaSesion_("plan", ciclo, ref); });
}
