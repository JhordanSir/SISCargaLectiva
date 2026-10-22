// @ts-check
/* Bloqueos de edición. Un bloqueo reserva un documento a una cuenta en un ciclo: el plan de
   una carrera («plan:ADM») o su carga docente («carga:ADM») (Dominio.REF).
   Caduca SIS_MINUTOS_BLOQUEO minutos después de la última actividad; el navegador lo
   renueva con un latido mientras hay actividad (SesionEdicion.js). Las mismas referencias
   identifican las copias de recuperación (Recuperacion.js). */

/**
 * Filas de la pestaña Bloqueos, vigentes o no.
 * @returns {FilaTabla[]}
 */
function leerBloqueos_() {
  return leerTabla_(TABLA_.BLOQUEOS);
}

/**
 * ¿La fila es un bloqueo que aún no caducó?
 * @param {FilaTabla|undefined} b
 * @returns {boolean}
 */
function bloqueoVigente_(b) {
  return !!b && Date.parse(b.expira) > Date.now();
}

/**
 * Bloqueo vigente de un documento, o null.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {FilaTabla|null}
 */
function bloqueoDe_(ciclo, ref) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.ref === ref; })[0];
  return bloqueoVigente_(b) ? b : null;
}

/**
 * Todos los bloqueos que no han caducado.
 * @returns {FilaTabla[]}
 */
function bloqueosVigentes_() {
  return leerBloqueos_().filter(bloqueoVigente_);
}

/**
 * Lo que el navegador necesita saber de un bloqueo.
 * @param {FilaTabla} b
 * @returns {Bloqueo}
 */
function datosBloqueo_(b) {
  return { correo: b.correo, desde: b.desde, expira: b.expira };
}

/**
 * Corta la operación porque otra cuenta edita el documento. que: «El plan de Derecho».
 * @param {string} que
 * @param {FilaTabla} b
 * @returns {never}
 */
function falloBloqueado_(que, b) {
  fallo_("BLOQUEADO", que + " lo está editando " + b.correo + ".", datosBloqueo_(b));
}

/**
 * Debe llamarse dentro de conCandado_. Toma o renueva el bloqueo de la cuenta.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {{ok: boolean, desde?: string, expira?: string, bloqueo?: FilaTabla}} ok false: otra cuenta tiene el bloqueo.
 */
function tomarBloqueo_(ciclo, ref, correo) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.ref === ref; })[0];
  if (bloqueoVigente_(b) && b.correo !== correo) return { ok: false, bloqueo: b };
  const desde = bloqueoVigente_(b) ? b.desde : Dominio.isoPeru();
  const expira = Dominio.isoPeru(Date.now() + config_().minutosBloqueo * 60000);
  const valores = [ciclo, ref, correo, desde, expira];
  if (b) escribirFila_(TABLA_.BLOQUEOS, b._fila, valores);
  else agregarFila_(TABLA_.BLOQUEOS, valores);
  return { ok: true, desde: desde, expira: expira };
}

/**
 * Renueva el bloqueo de la cuenta; si otra cuenta lo tomó entretanto, lo dice.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {{expira: string}}
 */
function renovarBloqueo_(ciclo, ref, correo) {
  return conCandado_(function () {
    const r = tomarBloqueo_(ciclo, ref, correo);
    if (!r.ok) fallo_("BLOQUEO_PERDIDO", "Tu bloqueo caducó y ahora lo está editando " + r.bloqueo.correo + ".", { correo: r.bloqueo.correo });
    return { expira: r.expira };
  });
}

/**
 * Suelta los bloqueos de la cuenta sobre ese documento.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {boolean}
 */
function soltarBloqueo_(ciclo, ref, correo) {
  return conCandado_(function () {
    borrarFilasDonde_(TABLA_.BLOQUEOS, function (x) { return x.ciclo === ciclo && x.ref === ref && x.correo === correo; });
    return true;
  });
}
