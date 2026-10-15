/* Copia de recuperación: mientras alguien edita un plan o una carga docente, el navegador
   envía cada minuto lo que aún no guardó. Si la página se cierra o se cae, al volver a
   editar se ofrece recuperarlo. No es una versión: se borra al guardar o al descartar. */

function refRecuperacion_(ref) {
  const r = String(ref || "");
  const m = r.match(/^(plan|carga):([A-Z]+)$/);
  if (!m) fallo_("DATO_INVALIDO", "Referencia de recuperación no válida.");
  return { tipo: m[1], clave: m[2], ref: Dominio.REF[m[1]](m[2]) };
}

function exigirRecuperacion_(u, r) {
  if (r.tipo === "plan") exigirEdicion_(u, validarCarrera_(r.clave));
  else exigirCarga_(u, validarDpto_(r.clave));
}

function filaRecuperacion_(ciclo, ref, correo) {
  return leerTabla_(TABLA_.RECUPERACION, 5).filter(function (f) {
    return f.ciclo === ciclo && f.ref === ref && f.correo === correo;
  })[0] || null;
}

/* Lo que haya guardado esta cuenta para ese plan o esa carga, o null. */
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

/* Debe llamarse dentro de conCandado_. */
function borrarRecuperacion_(ciclo, ref, correo) {
  borrarFilasDonde_(TABLA_.RECUPERACION, function (f) { return f.ciclo === ciclo && f.ref === ref && f.correo === correo; }, 5);
}

/* datos: {contenido, versionBase}. */
function guardarRecuperacion(ciclo, ref, datos) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), r = refRecuperacion_(ref);
    exigirRecuperacion_(u, r);
    const contenido = datos && datos.contenido != null ? datos.contenido : [];
    const texto = JSON.stringify(r.tipo === "plan" ? Dominio.sanearAsignaturas(contenido) : Dominio.sanearAsignaciones(contenido));
    return conCandado_(function () {
      const f = filaRecuperacion_(c, r.ref, u.correo);
      const fecha = new Date().toISOString();
      const valores = [c, r.ref, u.correo, fecha, String(parseInt(datos && datos.versionBase, 10) || 0)].concat(trocear_(texto));
      if (f) {
        const h = hojaBd_(TABLA_.RECUPERACION);
        if (h.getLastColumn() > valores.length) h.getRange(f._fila, valores.length + 1, 1, h.getLastColumn() - valores.length).clearContent();
        escribirFila_(TABLA_.RECUPERACION, f._fila, valores);
      } else agregarFila_(TABLA_.RECUPERACION, valores);
      return { fecha: fecha };
    });
  });
}

function descartarRecuperacion(ciclo, ref) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), r = refRecuperacion_(ref);
    return conCandado_(function () { borrarRecuperacion_(c, r.ref, u.correo); return true; });
  });
}
