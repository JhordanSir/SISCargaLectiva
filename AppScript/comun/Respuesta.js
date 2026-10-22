// @ts-check
/* Contrato de las respuestas al navegador. Todo endpoint devuelve
     {ok: true, datos}                         si salió bien, o
     {ok: false, codigo, mensaje, detalle}     si no se pudo,
   y el navegador decide por el código (comun/Nucleo.html, invocar). Un fallo previsto se lanza
   con fallo_(); cualquier otra excepción se registra y llega como INTERNO, sin detalles
   técnicos. */

var CODIGOS_ = [
  "NO_AUTENTICADO", "FUERA_DEL_DOMINIO", "SIN_ROL", "SIN_PERMISO", "DATO_INVALIDO", "NO_INSTALADO",
  "NO_ENCONTRADO", "BLOQUEADO", "BLOQUEO_PERDIDO", "CONFLICTO", "EXCESO_HORAS", "FALTA_MOTIVO", "OCUPADO", "INTERNO"
];

var MENSAJE_INTERNO_ = "Ocurrió un error inesperado. Inténtalo de nuevo; si se repite, avisa a la administración del sistema.";

/**
 * Error previsto, con su código del catálogo CODIGOS_.
 * @param {string} codigo
 * @param {string} mensaje Texto para la persona.
 * @param {Object=} detalle Datos que el navegador necesita para actuar (p. ej. quién tiene el bloqueo).
 * @returns {Error & {codigo: string, detalle: (Object|null)}}
 */
function errorSis_(codigo, mensaje, detalle) {
  return Object.assign(new Error(mensaje), { codigo: codigo, detalle: detalle || null });
}

/**
 * Corta la operación con un fallo previsto.
 * @param {string} codigo
 * @param {string} mensaje
 * @param {Object=} detalle
 * @returns {never}
 */
function fallo_(codigo, mensaje, detalle) {
  throw errorSis_(codigo, mensaje, detalle);
}

/**
 * Ejecuta el cuerpo de un endpoint y lo envuelve en el contrato.
 * @template T
 * @param {function(): T} fn
 * @returns {Respuesta<T>}
 */
function responder_(fn) {
  try {
    return { ok: true, datos: fn() };
  } catch (e) {
    if (e && e.codigo && CODIGOS_.indexOf(e.codigo) >= 0)
      return { ok: false, codigo: e.codigo, mensaje: e.message, detalle: e.detalle || null };
    console.error(e && e.stack ? e.stack : String(e));
    return { ok: false, codigo: "INTERNO", mensaje: MENSAJE_INTERNO_, detalle: null };
  }
}
