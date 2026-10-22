// @ts-check
/* Copia de recuperación: mientras alguien edita un plan o una carga docente, el navegador
   envía cada minuto lo que aún no guardó (SesionEdicion.js). Si la página se cierra o se
   cae, al volver a editar se ofrece recuperarlo. No es una versión: se borra al guardar o al
   descartar.
   Decisión (auditoría P3.6-f): la copia sigue en la hoja, que no caduca como CacheService,
   pero se escribe con un candado breve (conCandadoSiLibre_, 2 s). Si otro guardado tiene el
   candado, esta copia se salta y el navegador la repite al minuto siguiente. El candado
   sigue siendo el del script: las filas de Recuperacion se borran por número de fila al
   guardar, y un candado por usuario no protegería de esos borrados. */

var MS_CANDADO_RECUPERACION_ = 2000;

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
 * Guarda (o reemplaza) la copia de esta cuenta. texto: el contenido ya saneado, en JSON.
 * Si otro guardado tiene el candado, no la guarda y devuelve null.
 * @param {string} ciclo
 * @param {Ref} ref
 * @param {string} correo
 * @param {string} texto
 * @param {number} versionBase
 * @returns {{fecha: string}|null}
 */
function guardarRecuperacion_(ciclo, ref, correo, texto, versionBase) {
  return conCandadoSiLibre_(function () {
    const f = filaRecuperacion_(ciclo, ref, correo);
    const fecha = Dominio.isoPeru();
    const valores = [ciclo, ref, correo, fecha, String(versionBase)].concat(trocear_(texto));
    if (f) {
      const h = hojaBd_(TABLA_.RECUPERACION);
      if (h.getLastColumn() > valores.length) h.getRange(f._fila, valores.length + 1, 1, h.getLastColumn() - valores.length).clearContent();
      escribirFila_(TABLA_.RECUPERACION, f._fila, valores);
    } else agregarFila_(TABLA_.RECUPERACION, valores);
    return { fecha: fecha };
  }, MS_CANDADO_RECUPERACION_);
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
