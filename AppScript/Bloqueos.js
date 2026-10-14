/* Bloqueo de edición por carrera y ciclo, para la oferta y los docentes (P117). Vive en la
   fila del plan de _SYS_PLANES_ESTADO y caduca SIS_MINUTOS_BLOQUEO minutos después de la
   última actividad; la web lo renueva con un latido mientras hay actividad. La bitácora
   anota cuándo se toma y cuándo se libera, no cada latido. En la hoja de la carrera se
   aplicará con su protección (fase 3 del plan). */

function vigente_(b) {
  return !!b && !!b.correo && Date.parse(b.expira) > Date.now();
}

function bloqueoDeFila_(fila) {
  return fila && fila.bloqueo_correo
    ? { correo: fila.bloqueo_correo, desde: fila.bloqueo_desde, expira: fila.bloqueo_expira }
    : null;
}

function bloqueoDe_(ciclo, sig) {
  const b = bloqueoDeFila_(buscarPlan_(leerPlanes_(), ciclo, sig));
  return vigente_(b) ? b : null;
}

/* Debe llamarse dentro de conCandado_. Toma o renueva el bloqueo de la cuenta. */
function tomarBloqueo_(ciclo, sig, correo) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  const b = bloqueoDeFila_(fila);
  if (vigente_(b) && b.correo !== correo) return { ok: false, bloqueo: b };
  const nuevo = !vigente_(b);
  const desde = nuevo ? new Date().toISOString() : b.desde;
  const expira = new Date(Date.now() + config_().minutosBloqueo * 60000).toISOString();
  actualizarPlan_(ciclo, sig, fila, { bloqueo_correo: correo, bloqueo_desde: desde, bloqueo_expira: expira });
  if (nuevo) anotarBitacora_(correo, ciclo, sig, "toma del bloqueo", "", "Hasta " + expira + " si no hay actividad.");
  return { ok: true, desde: desde, expira: expira };
}

/* Debe llamarse dentro de conCandado_. */
function soltarBloqueo_(ciclo, sig, correo) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  if (!fila || fila.bloqueo_correo !== correo) return false;
  actualizarPlan_(ciclo, sig, fila, { bloqueo_correo: "", bloqueo_desde: "", bloqueo_expira: "" });
  anotarBitacora_(correo, ciclo, sig, "liberación del bloqueo", "", "");
  return true;
}

function renovarBloqueo(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const r = tomarBloqueo_(c, s, u.correo);
    return r.ok ? { expira: r.expira } : { perdido: { correo: r.bloqueo.correo } };
  });
}

function liberarBloqueo(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  return conCandado_(function () {
    soltarBloqueo_(c, s, u.correo);
    return true;
  });
}
