// @ts-check
/* Entradas de la asignación docente en modo de edición (AsignacionEdicion.html y
   AsignacionCarga.html). Validan, comprueban que la cuenta asigna esa carga y delegan en
   CargaServicio.js. Al final, la derivación de una sección (FA-079, que usa
   cu001/logica/DerivacionPlan.js) y las de la sesión de edición: latido del bloqueo,
   liberación y copia de recuperación, que usan base/Sesiones.js igual que las de CU-001. */

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


/**
 * CU-002 FA-079 a FA-083: deriva la asignatura del grupo grupoId al departamento «nuevo»
 * (cu001/logica/DerivacionPlan.js).
 * @param {string} ciclo
 * @param {Sigla} sig Carrera del plan (en una sección fusionada, la del grupo principal).
 * @param {string} grupoId
 * @param {Dpto} nuevo
 * @param {string=} motivo
 * @returns {Respuesta<{version: number, estado: string, totales: Totales, contenido: Asignatura[], sinCambios?: boolean}>}
 */
function asignacionEdicionDerivar(ciclo, sig, grupoId, nuevo, motivo) {
  return responder_(function () { return derivarDesdeEntrada_(ciclo, sig, grupoId, nuevo, motivo); });
}

/* ---------- sesión de edición (base/SesionEdicion.html la llama con estos nombres) ---------- */

/**
 * CU-002 paso 21: renueva el bloqueo de la carga mientras hay actividad (base/Sesiones.js).
 * @param {string} ciclo
 * @param {Ref} ref «carga:ADM».
 * @returns {Respuesta<{expira: string}>}
 */
function asignacionEdicionRenovar(ciclo, ref) {
  return responder_(function () { return renovarSesion_("carga", ciclo, ref); });
}

/**
 * Suelta el bloqueo de la carga al terminar la edición o al cerrar la página.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {Respuesta<boolean>}
 */
function asignacionEdicionLiberar(ciclo, ref) {
  return responder_(function () { return liberarSesion_("carga", ciclo, ref); });
}

/**
 * Copia de recuperación de la carga, cada minuto mientras hay cambios sin guardar.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {{contenido: *, versionBase: number}} datos
 * @returns {Respuesta<{fecha: (string|null), omitida?: boolean}>}
 */
function asignacionEdicionGuardarCopia(ciclo, ref, datos) {
  return responder_(function () { return guardarCopiaSesion_("carga", ciclo, ref, datos); });
}

/**
 * Borra la copia de recuperación de la carga.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {Respuesta<boolean>}
 */
function asignacionEdicionDescartarCopia(ciclo, ref) {
  return responder_(function () { return descartarCopiaSesion_("carga", ciclo, ref); });
}
