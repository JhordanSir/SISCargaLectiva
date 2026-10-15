// @ts-check
/* Copia de recuperación: mientras alguien edita un plan o una carga docente, el navegador
   envía cada minuto lo que aún no guardó. Si la página se cierra o se cae, al volver a
   editar se ofrece recuperarlo. No es una versión: se borra al guardar o al descartar.
   Decisión (auditoría P3.6-f): la copia sigue en la hoja, que no caduca como CacheService,
   pero se escribe con un candado breve (conCandadoSiLibre_, 2 s). Si otro guardado tiene el
   candado, esta copia se salta y el navegador la repite al minuto siguiente. El candado
   sigue siendo el del script: las filas de Recuperacion se borran por número de fila al
   guardar, y un candado por usuario no protegería de esos borrados. */

var MS_CANDADO_RECUPERACION_ = 2000;

/**
 * Valida una referencia («plan:ADM», «carga:DIMA»); si no lo es, falla con DATO_INVALIDO.
 * @param {*} ref
 * @returns {{tipo: string, clave: string, ref: Ref}}
 */
function refRecuperacion_(ref) {
  const r = String(ref || "");
  const m = r.match(/^(plan|carga):([A-Z]+)$/);
  if (!m) fallo_("DATO_INVALIDO", "Referencia de recuperación no válida.");
  return { tipo: m[1], clave: m[2], ref: Dominio.REF[m[1]](m[2]) };
}

/**
 * Solo quien puede editar el plan o la carga guarda su copia de recuperación.
 * @param {Usuario} usuario
 * @param {{tipo: string, clave: string}} r
 * @returns {void}
 */
function exigirRecuperacion_(usuario, r) {
  if (r.tipo === "plan") exigirEdicion_(usuario, validarCarrera_(r.clave));
  else exigirCarga_(usuario, validarDpto_(r.clave));
}

/**
 * Fila de la copia de esta cuenta para ese documento, o null.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {FilaTabla|null}
 */
function filaRecuperacion_(ciclo, ref, correo) {
  return leerTabla_(TABLA_.RECUPERACION, 5).filter(function (f) {
    return f.ciclo === ciclo && f.ref === ref && f.correo === correo;
  })[0] || null;
}

/**
 * Lo que haya guardado esta cuenta para ese plan o esa carga, o null.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {Recuperacion|null}
 */
function leerRecuperacion_(ciclo, ref, correo) {
  const f = filaRecuperacion_(ciclo, ref, correo);
  if (!f) return null;
  const h = hojaBd_(TABLA_.RECUPERACION);
  const valores = h.getRange(f._fila, 1, 1, Math.max(TABLAS_.Recuperacion.length, h.getLastColumn())).getValues()[0];
  try {
    return { fecha: f.fecha, versionBase: parseInt(f.version_base, 10) || 0,
             contenido: JSON.parse(unirDesde_(valores, TABLAS_.Recuperacion.indexOf("contenido")) || "null") };
  } catch (e) {
    return null;
  }
}

/**
 * Debe llamarse dentro de conCandado_.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @returns {void}
 */
function borrarRecuperacion_(ciclo, ref, correo) {
  borrarFilasDonde_(TABLA_.RECUPERACION, function (f) { return f.ciclo === ciclo && f.ref === ref && f.correo === correo; }, 5);
}

/**
 * datos: {contenido, versionBase}.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {{contenido: *, versionBase: number}} datos
 * @returns {Respuesta<{fecha: (string|null), omitida?: boolean}>} omitida: el sistema estaba ocupado; se repite luego.
 */
function guardarRecuperacion(ciclo, ref, datos) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), r = refRecuperacion_(ref);
    exigirRecuperacion_(usuario, r);
    const contenido = datos && datos.contenido != null ? datos.contenido : [];
    const texto = JSON.stringify(r.tipo === "plan" ? Dominio.sanearAsignaturas(contenido) : Dominio.sanearAsignaciones(contenido));
    const guardada = conCandadoSiLibre_(function () {
      const f = filaRecuperacion_(c, r.ref, usuario.correo);
      const fecha = new Date().toISOString();
      const valores = [c, r.ref, usuario.correo, fecha, String(parseInt(String(datos && datos.versionBase), 10) || 0)].concat(trocear_(texto));
      if (f) {
        const h = hojaBd_(TABLA_.RECUPERACION);
        if (h.getLastColumn() > valores.length) h.getRange(f._fila, valores.length + 1, 1, h.getLastColumn() - valores.length).clearContent();
        escribirFila_(TABLA_.RECUPERACION, f._fila, valores);
      } else agregarFila_(TABLA_.RECUPERACION, valores);
      return { fecha: fecha };
    }, MS_CANDADO_RECUPERACION_);
    return guardada || { fecha: null, omitida: true };
  });
}

/**
 * Endpoint: borra la copia de recuperación de la cuenta.
 * @param {string} ciclo
 * @param {Ref} ref
 * @returns {Respuesta<boolean>}
 */
function descartarRecuperacion(ciclo, ref) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), r = refRecuperacion_(ref);
    return conCandado_(function () { borrarRecuperacion_(c, r.ref, usuario.correo); return true; });
  });
}
