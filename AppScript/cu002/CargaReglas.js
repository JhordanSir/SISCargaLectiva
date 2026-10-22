// @ts-check
/* Reglas de CU-002 que aplica el guardado y la lectura de una carga docente: qué parte de
   la carga le toca a cada director, qué asignaciones sobran, los límites de horas (A07, A12),
   los avisos de la carga (FA-010, FA-011) y quién ve el DNI de cada docente. No leen ni
   escriben la hoja: reciben lo que necesitan. */

/**
 * Lo que queda en la carga de una carrera tras el guardado de una cuenta (CU-002 paso 69):
 * las asignaciones que no le tocan (secciones que asigna otro departamento) se conservan
 * como estaban, y las que le tocan son las que envió. Una asignación sin sección le toca al
 * dueño de la carga.
 * @param {Usuario} usuario
 * @param {Sigla} carrera
 * @param {Asignacion[]} actuales Contenido vigente de la carga.
 * @param {Asignacion[]} recibidas Lo que envió el navegador.
 * @param {Seccion[]} unidades
 * @returns {Asignacion[]}
 */
function combinarCarga_(usuario, carrera, actuales, recibidas, unidades) {
  const idx = Dominio.indiceUnidades(unidades);
  const esPropia = Dominio.dptoDeCarrera(carrera) === usuario.departamento;
  const leToca = function (a) {
    const seccion = Dominio.unidadDe(idx, a);
    return seccion ? seccion.dpto === usuario.departamento : esPropia;
  };
  return actuales.filter(function (a) { return !leToca(a); }).concat(recibidas.filter(leToca));
}

/**
 * CU-002 paso 70: quita de la carga de una carrera las asignaciones de secciones que hoy van
 * en la carga de otra carrera (por ejemplo, si cambió el grupo principal de una fusión)
 * cuando esa carga ya tiene las suyas: ya no le corresponden.
 * @param {Sigla} carrera
 * @param {Asignacion[]} asignaciones
 * @param {Seccion[]} unidades
 * @param {Object<string, Asignacion[]>} cargas
 * @returns {Asignacion[]}
 */
function depurarCarga_(carrera, asignaciones, unidades, cargas) {
  const idx = Dominio.indiceUnidades(unidades);
  return asignaciones.filter(function (a) {
    const seccion = Dominio.unidadDe(idx, a);
    if (!seccion || seccion.carrera === carrera) return true;
    return !(cargas[seccion.carrera] || []).some(function (x) { const v = Dominio.unidadDe(idx, x); return v && v.id === seccion.id; });
  });
}

/**
 * CU-002 pasos 62 y 63 (FA-103, FA-104): nadie puede pasar de 40 h lectivas (A07): si un
 * docente lo haría, no se guarda. Un docente con cargo que pase de 24 h exige motivoExceso
 * (A12). Compara el balance antes y después de cambiar la carga de la carrera, así que solo
 * cuentan los excesos que se crean o crecen ahora. Devuelve el motivo ya recortado.
 * @param {DocenteCatalogo[]} catalogo
 * @param {Seccion[]} unidades
 * @param {Object<string, Asignacion[]>} cargas
 * @param {Sigla} carrera
 * @param {Asignacion[]} asignaciones
 * @param {*} motivoExceso
 * @returns {string}
 */
function validarExcesos_(catalogo, unidades, cargas, carrera, asignaciones, motivoExceso) {
  const nuevas = Object.assign({}, cargas);
  nuevas[carrera] = asignaciones;
  const exc = Dominio.excesosAlGuardar(Dominio.calcularBalance(catalogo, unidades, cargas), Dominio.calcularBalance(catalogo, unidades, nuevas));
  const lista = function (xs) { return xs.map(function (x) { return x.docente + " (" + x.horas + " h)"; }).join(", "); };
  if (exc.bloqueos.length)
    fallo_("EXCESO_HORAS", "No se guardó: " + lista(exc.bloqueos) + (exc.bloqueos.length === 1 ? " superaría" : " superarían") +
                           " las " + Dominio.LIMITES.MAXIMO + " h lectivas semanales (A07).", { docentes: exc.bloqueos });
  const motivo = String(motivoExceso || "").trim().slice(0, 300);
  if (exc.severos.length && !motivo)
    fallo_("FALTA_MOTIVO", "Falta el motivo: " + lista(exc.severos) + " tiene cargo administrativo y pasaría de " +
                           Dominio.LIMITES.CARGO_SEVERO + " h (A12).", { docentes: exc.severos });
  return motivo;
}

/**
 * CU-002 FA-010 y FA-011: lo que no cuadra entre los planes y la última carga guardada de
 * una carrera: planes que cambiaron después (el de la carrera y los de las carreras
 * fusionadas con sus secciones) y asignaciones que se quedaron sin sección.
 * @param {Sigla} carrera
 * @param {Array<{sig: Sigla, version: number, usuario?: string}>} planes
 * @param {Seccion[]} unidades
 * @param {{planes?: Object<string, number>}|null} meta Última versión de la carga.
 * @param {Object<string, Asignacion[]>} sinSeccion
 * @returns {Aviso[]}
 */
function avisosDeCarga_(carrera, planes, unidades, meta, sinSeccion) {
  const avisos = [];
  const vistos = meta ? meta.planes || {} : {};
  const relacionadas = [carrera];
  unidades.forEach(function (u) {
    if (u.carrera === carrera) u.miembros.forEach(function (m) { if (relacionadas.indexOf(m.carrera) < 0) relacionadas.push(m.carrera); });
  });
  if (meta) planes.filter(function (p) { return relacionadas.indexOf(p.sig) >= 0; }).forEach(function (p) {
    const antes = parseInt(String(vistos[p.sig]), 10) || 0;
    if (p.version > antes && antes > 0)
      avisos.push(Dominio.aviso("PLAN_CAMBIADO", "El plan de " + Dominio.nombreCarrera(p.sig) + " cambió después del último guardado de esta carga (v" +
                  antes + " → v" + p.version + (p.usuario ? ", " + p.usuario : "") + "). Revisa sus secciones.",
                  { carrera: p.sig, antes: antes, ahora: p.version, usuario: p.usuario || "" }));
  });
  const n = (sinSeccion[carrera] || []).length;
  if (n) avisos.push(Dominio.aviso("SIN_SECCION", n === 1 ? "1 asignación se quedó sin sección en el plan: reasígnala o quítala."
                                                      : n + " asignaciones se quedaron sin sección en el plan: reasígnalas o quítalas.", { cuantas: n }));
  return avisos;
}

/**
 * El DNI solo lo recibe el director del departamento: el de sus docentes en el catálogo
 * y el de las asignaciones que él hace. Los demás identifican a los docentes por su nombre.
 * @template {Object} T
 * @param {T} x
 * @returns {T}
 */
function sinDni_(x) {
  /** @type {Object<string, *>} */
  const c = Object.assign({}, x);
  delete c.dni;
  if (Array.isArray(c.historial)) c.historial = c.historial.map(function (h) { const y = Object.assign({}, h); delete y.dni; return y; });
  return /** @type {T} */ (c);
}

/**
 * El catálogo que ve la cuenta: con DNI solo los docentes de su departamento, si es su director.
 * @param {DocenteCatalogo[]} docentes
 * @param {Usuario} usuario
 * @returns {DocenteCatalogo[]}
 */
function catalogoVisible_(docentes, usuario) {
  const dpto = usuario.rol === "director" ? usuario.departamento : "";
  return docentes.map(function (doc) { return dpto && doc.dpto === dpto ? doc : sinDni_(doc); });
}

/**
 * Las cargas que ve la cuenta: con DNI solo las asignaciones que hace su departamento (las
 * de las secciones que le tocan y, en las cargas de sus carreras, las que no tienen sección).
 * @param {Object<string, Carga>} cargas
 * @param {Usuario} usuario
 * @param {Seccion[]} unidades
 * @returns {Object<string, Carga>}
 */
function cargasVisibles_(cargas, usuario, unidades) {
  const dpto = usuario.rol === "director" ? usuario.departamento : "";
  const idx = Dominio.indiceUnidades(unidades);
  /** @type {Object<string, Carga>} */
  const r = {};
  Object.keys(cargas).forEach(function (k) {
    const suya = function (a) {
      const seccion = Dominio.unidadDe(idx, a);
      return !!dpto && (seccion ? seccion.dpto === dpto : Dominio.dptoDeCarrera(k) === dpto);
    };
    r[k] = Object.assign({}, cargas[k], { asignaciones: cargas[k].asignaciones.map(function (a) { return suya(a) ? a : sinDni_(a); }) });
  });
  return r;
}
