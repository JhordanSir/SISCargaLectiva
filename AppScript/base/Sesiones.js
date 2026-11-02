// @ts-check
/* Lógica de la sesión de edición (SesionEdicion.html), la misma para el plan de ciclo
   (CU-001) y la carga docente (CU-002). Aquí no hay entradas para el navegador: cada
   pantalla tiene las suyas en su …Servidor.js (edicionPlanRenovar, asignacionEdicionRenovar…)
   y llaman a estas funciones con el tipo de documento que editan. El documento se indica
   con su referencia: «plan:ADM» o «carga:ADM» (Dominio.REF). */

/**
 * Valida una referencia del tipo esperado («plan:ADM» o «carga:ADM»); si no lo es, falla
 * con DATO_INVALIDO.
 * @param {*} ref
 * @param {"plan"|"carga"} tipo
 * @returns {{tipo: string, carrera: Sigla, ref: Ref}}
 */
function refDocumento_(ref, tipo) {
  const m = String(ref || "").match(/^(plan|carga):([A-Z]+)$/);
  if (!m || m[1] !== tipo) fallo_("DATO_INVALIDO", "Referencia de documento no válida.");
  const carrera = validarCarrera_(m[2]);
  return { tipo: m[1], carrera: carrera, ref: Dominio.REF[m[1]](carrera) };
}

/**
 * Solo quien puede editar el documento renueva su bloqueo o guarda su copia: el
 * coordinador de la carrera, en un plan; el director que asigna, en una carga.
 * @param {Usuario} usuario
 * @param {{tipo: string, carrera: Sigla}} d
 * @param {string} ciclo
 * @returns {void}
 */
function exigirEdicionDocumento_(usuario, d, ciclo) {
  if (d.tipo === "plan") exigirEdicionPlan_(usuario, d.carrera);
  else exigirCargaEnEdicion_(usuario, ciclo, d.carrera);
}

/**
 * CU-001 paso 16 y CU-002 paso 21 (el bloqueo vence tras los minutos sin actividad): el
 * latido del navegador lo renueva mientras hay actividad. Falla con BLOQUEO_PERDIDO si otra
 * cuenta lo tomó tras vencer (CU-001 FA-120, CU-002 FA-114).
 * @param {"plan"|"carga"} tipo
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {{expira: string}}
 */
function renovarSesion_(tipo, ciclo, ref) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = refDocumento_(ref, tipo);
  exigirEdicionDocumento_(usuario, d, c);
  return renovarBloqueo_(c, d.ref, usuario.correo);
}

/**
 * Suelta el bloqueo que tenga la cuenta sobre el documento: CU-001 paso 53, FA-029, FA-115
 * y FA-117 a FA-119; CU-002 pasos 84 a 85, FA-112 y FA-113; y al cerrar la página.
 * @param {"plan"|"carga"} tipo
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {boolean}
 */
function liberarSesion_(tipo, ciclo, ref) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = refDocumento_(ref, tipo);
  return soltarBloqueo_(c, d.ref, usuario.correo);
}

/**
 * Copia de recuperación que el navegador envía cada minuto mientras hay cambios sin
 * guardar (CU-001 y CU-002, «Copia de recuperación»). datos: {contenido, versionBase}.
 * @param {"plan"|"carga"} tipo
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {{contenido: *, versionBase: number}} datos
 * @returns {{fecha: (string|null), omitida?: boolean}} omitida: el sistema estaba ocupado; se repite luego.
 */
function guardarCopiaSesion_(tipo, ciclo, ref, datos) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = refDocumento_(ref, tipo);
  exigirEdicionDocumento_(usuario, d, c);
  const contenido = datos && datos.contenido != null ? datos.contenido : [];
  const texto = JSON.stringify(d.tipo === "plan" ? Dominio.sanearAsignaturas(contenido) : Dominio.sanearAsignaciones(contenido));
  const guardada = guardarRecuperacion_(c, d.ref, usuario.correo, texto, parseInt(String(datos && datos.versionBase), 10) || 0);
  return guardada || { fecha: null, omitida: true };
}

/**
 * Borra la copia de recuperación de la cuenta: CU-001 FA-017 y FA-115; CU-002 FA-017 y
 * FA-110.
 * @param {"plan"|"carga"} tipo
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {boolean}
 */
function descartarCopiaSesion_(tipo, ciclo, ref) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = refDocumento_(ref, tipo);
  return conCandado_(function () { borrarRecuperacion_(c, d.ref, usuario.correo); return true; });
}
