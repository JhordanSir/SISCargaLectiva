/* Bloqueos de edición. Un bloqueo reserva un documento a una cuenta: el plan de una
   carrera («plan:ADM») o la carga docente de un departamento («carga:DIMA») en un ciclo.
   Caduca SIS_MINUTOS_BLOQUEO minutos después de la última actividad; el navegador lo
   renueva con un latido mientras hay actividad. Las mismas referencias identifican las
   copias de recuperación (Recuperacion.js). */

var REF_ = {
  plan: function (sig) { return "plan:" + sig; },
  carga: function (dpto) { return "carga:" + dpto; }
};

function leerBloqueos_() {
  return leerTabla_("Bloqueos");
}

function bloqueoVigente_(b) {
  return !!b && Date.parse(b.expira) > Date.now();
}

function bloqueoDe_(ciclo, ref) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.ref === ref; })[0];
  return bloqueoVigente_(b) ? b : null;
}

function bloqueosVigentes_() {
  return leerBloqueos_().filter(bloqueoVigente_);
}

/* Lo que el navegador necesita saber de un bloqueo. */
function datosBloqueo_(b) {
  return { correo: b.correo, desde: b.desde, expira: b.expira };
}

/* Debe llamarse dentro de conCandado_. Toma o renueva el bloqueo de la cuenta. */
function tomarBloqueo_(ciclo, ref, correo) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.ref === ref; })[0];
  if (bloqueoVigente_(b) && b.correo !== correo) return { ok: false, bloqueo: b };
  const desde = bloqueoVigente_(b) ? b.desde : new Date().toISOString();
  const expira = new Date(Date.now() + config_().minutosBloqueo * 60000).toISOString();
  const valores = [ciclo, ref, correo, desde, expira];
  if (b) escribirFila_("Bloqueos", b._fila, valores);
  else agregarFila_("Bloqueos", valores);
  return { ok: true, desde: desde, expira: expira };
}

/* Renueva el bloqueo de la cuenta; si otra cuenta lo tomó entretanto, lo dice. */
function renovarBloqueo_(ciclo, ref, correo) {
  return conCandado_(function () {
    const r = tomarBloqueo_(ciclo, ref, correo);
    return r.ok ? { expira: r.expira } : { perdido: { correo: r.bloqueo.correo } };
  });
}

/* Suelta los bloqueos de la cuenta sobre ese documento. */
function soltarBloqueo_(ciclo, ref, correo) {
  return conCandado_(function () {
    borrarFilasDonde_("Bloqueos", function (x) { return x.ciclo === ciclo && x.ref === ref && x.correo === correo; });
    return true;
  });
}

/* ============================================================
   Funciones que llama el navegador: bloqueo del plan de una carrera
   ============================================================ */

function renovarBloqueo(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return renovarBloqueo_(c, REF_.plan(s), u.correo);
}

function liberarBloqueo(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  return soltarBloqueo_(c, REF_.plan(s), u.correo);
}
