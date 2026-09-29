/* Bloqueo de edición por carrera y ciclo. Caduca SIS_MINUTOS_BLOQUEO minutos después
   de la última actividad; el navegador lo renueva con un latido mientras hay actividad. */

function leerBloqueos_() {
  return leerTabla_("Bloqueos");
}

function vigente_(b) {
  return !!b && Date.parse(b.expira) > Date.now();
}

function bloqueoDe_(ciclo, sig) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.carrera === sig; })[0];
  return vigente_(b) ? b : null;
}

function bloqueosVigentes_() {
  return leerBloqueos_().filter(vigente_);
}

/* Debe llamarse dentro de conCandado_. Toma o renueva el bloqueo de la cuenta. */
function tomarBloqueo_(ciclo, sig, correo) {
  const b = leerBloqueos_().filter(function (x) { return x.ciclo === ciclo && x.carrera === sig; })[0];
  if (vigente_(b) && b.correo !== correo) return { ok: false, bloqueo: b };
  const desde = vigente_(b) ? b.desde : new Date().toISOString();
  const expira = new Date(Date.now() + config_().minutosBloqueo * 60000).toISOString();
  const valores = [ciclo, sig, correo, desde, expira];
  if (b) escribirFila_("Bloqueos", b._fila, valores);
  else agregarFila_("Bloqueos", valores);
  return { ok: true, desde: desde, expira: expira };
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
    leerBloqueos_()
      .filter(function (x) { return x.ciclo === c && x.carrera === s && x.correo === u.correo; })
      .map(function (x) { return x._fila; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (fila) { borrarFila_("Bloqueos", fila); });
    return true;
  });
}
