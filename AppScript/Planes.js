/* Planes de ciclo: tablero, consulta, edición y guardado con versiones (Versionado.js,
   repositorio REPO_PLAN_). La fila de cada plan en Planes guarda además su estado, sus
   totales y la firma del xlsx del que salió. */

function leerPlanes_() {
  return leerIndice_(REPO_PLAN_);
}

function buscarPlan_(planes, ciclo, sig) {
  return buscarEnIndice_(REPO_PLAN_, planes, ciclo, sig);
}

function filaPlan_(ciclo, sig) {
  return filaIndice_(REPO_PLAN_, ciclo, sig);
}

function estadoDePlan_(fila) {
  const v = vigente_(fila);
  return {
    estado: fila && fila.estado ? fila.estado : Dominio.ESTADOS.SIN,
    version: v.version,
    totales: fila && fila.totales ? JSON.parse(fila.totales) : null,
    filaVersion: v.filaVersion
  };
}

/* Un plan Registrado nunca vuelve a Borrador. */
function resolverEstado_(actual, pedido) {
  if (actual === Dominio.ESTADOS.REGISTRADO) return Dominio.ESTADOS.REGISTRADO;
  return pedido === Dominio.ESTADOS.REGISTRADO ? Dominio.ESTADOS.REGISTRADO : Dominio.ESTADOS.BORRADOR;
}

/* Contenido de una versión del plan. */
function contenidoPlan_(ciclo, sig, n, filaVersion) {
  return contenidoVersion_(REPO_PLAN_, ciclo, sig, n, filaVersion);
}

/* Debe llamarse dentro de conCandado_. datos: {estado, tipo, usuario, fecha, motivo,
   asignaturas, firma_xlsx?}. Devuelve el número de la versión nueva. */
function registrarVersionPlan_(ciclo, sig, fila, datos) {
  const indice = { estado: datos.estado, totales: JSON.stringify(Dominio.totales(datos.asignaturas)) };
  if (datos.firma_xlsx != null) indice.firma_xlsx = datos.firma_xlsx;
  return registrarVersion_(REPO_PLAN_, ciclo, sig, fila, {
    usuario: datos.usuario, fecha: datos.fecha, contenido: datos.asignaturas, indice: indice,
    meta: { estado: datos.estado, tipo: datos.tipo, motivo: datos.motivo || "" }
  });
}

function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

/* Si otro guardado dejó una versión posterior a versionBase, devuelve sus datos para que
   el navegador advierta antes de guardar encima. */
function conflictoPlan_(ciclo, sig, vigente, versionBase) {
  if (vigente <= (parseInt(versionBase, 10) || 0)) return null;
  const ultima = metaVersiones_(REPO_PLAN_, ciclo, sig, vigente).filter(function (v) { return v.n === vigente; })[0];
  return ultima ? sinFila_(ultima) : { n: vigente };
}

/* Filas del tablero de un ciclo, con el contenido vigente de cada plan: así el navegador
   consulta un plan o empieza a editarlo sin volver a pedirlo. No lee las cargas docentes:
   qué grupos tienen docente lo pide el navegador aparte (obtenerDocentesPorGrupo). */
function leerTablero_(ciclo) {
  const planes = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  const bloqueos = bloqueosVigentes_();
  const contenidos = contenidosVigentes_(REPO_PLAN_, ciclo, planes);
  return Dominio.CARRERAS.map(function (car) {
    const p = estadoDePlan_(buscarPlan_(planes, ciclo, car.sig));
    const b = bloqueos.filter(function (x) { return x.ciclo === ciclo && x.ref === Dominio.REF.plan(car.sig); })[0];
    return {
      sig: car.sig, nombre: car.nombre, estado: p.estado, version: p.version, totales: p.totales,
      bloqueo: b ? datosBloqueo_(b) : null,
      contenido: contenidos[car.sig] || []
    };
  });
}

/* El plan no se puede guardar si otra cuenta tiene su bloqueo. */
function exigirSinBloqueoAjeno_(ciclo, sig, usuario, accion) {
  const b = bloqueoDe_(ciclo, Dominio.REF.plan(sig));
  if (b && b.correo !== usuario.correo)
    fallo_("BLOQUEADO", "El plan de " + Dominio.nombreCarrera(sig) + " lo está editando " + b.correo + ", así que " + accion + ". Inténtalo cuando termine.");
  return b;
}

/* ============================================================
   Funciones que llama el navegador (google.script.run)
   ============================================================ */

/* opciones.releer: mira los xlsx de Drive ahora, sin esperar al siguiente intervalo. */
function obtenerTablero(ciclo, opciones) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo);
    const avisos = sincronizarFuentes_(!!(opciones && opciones.releer));
    return { avisos: avisos, filas: leerTablero_(c) };
  });
}

function obtenerPlan(ciclo, sig) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    const p = estadoDePlan_(filaPlan_(c, s));
    const b = bloqueoDe_(c, Dominio.REF.plan(s));
    return {
      estado: p.estado,
      version: p.version,
      asignaturas: p.version ? contenidoPlan_(c, s, p.version, p.filaVersion) : [],
      bloqueo: b ? datosBloqueo_(b) : null
    };
  });
}

/* versionConocida: la versión que el navegador ya tiene. Si sigue siendo la vigente,
   no se devuelve el contenido. */
function abrirEdicion(ciclo, sig, versionConocida) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicion_(usuario, s);
    return conCandado_(function () {
      const r = tomarBloqueo_(c, Dominio.REF.plan(s), usuario.correo);
      if (!r.ok) falloBloqueado_("El plan de " + Dominio.nombreCarrera(s), r.bloqueo);
      const p = estadoDePlan_(filaPlan_(c, s));
      const res = { estado: p.estado, version: p.version, expira: r.expira };
      if (versionConocida == null || parseInt(versionConocida, 10) !== p.version)
        res.asignaturas = p.version ? contenidoPlan_(c, s, p.version, p.filaVersion) : [];
      res.recuperacion = leerRecuperacion_(c, Dominio.REF.plan(s), usuario.correo);
      return res;
    });
  });
}

/* datos: {asignaturas, estado, tipo, motivo, versionBase, forzar, fusionesDisueltas}. Si se
   guardó otra versión después de versionBase, falla con CONFLICTO para que el navegador
   advierta; con forzar se guarda igualmente (advertir, no prohibir). Las fusiones con
   grupos de otras carreras se llevan a esos planes (Fusiones.js); el plan guardado vuelve
   en «asignaturas» y los planes ajenos tocados, en «otros». */
function guardarPlan(ciclo, sig, datos) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicion_(usuario, s);
    const T = Dominio.TIPO_VERSION;
    if (!datos || [T.BORRADOR, T.REGISTRAR, T.CAMBIOS, T.AUTOGUARDADO].indexOf(datos.tipo) < 0) fallo_("DATO_INVALIDO", "Tipo de guardado desconocido.");
    const recibidas = Dominio.sanearAsignaturas(datos.asignaturas);
    const disueltas = Dominio.sanearMarcas(datos.fusionesDisueltas);

    return conCandado_(function () {
      const b = exigirSinBloqueoAjeno_(c, s, usuario, "no se guardó");
      const fila = filaPlan_(c, s);
      const p = estadoDePlan_(fila);
      const conflicto = datos.forzar ? null : conflictoPlan_(c, s, p.version, datos.versionBase);
      if (conflicto) fallo_("CONFLICTO", "Mientras editabas se guardó la versión v" + conflicto.n + " del plan.", conflicto);
      const estado = resolverEstado_(p.estado, datos.estado);
      const fecha = new Date().toISOString();
      const antes = p.version ? contenidoPlan_(c, s, p.version, p.filaVersion) : [];
      const f = prepararFusiones_(c, s, antes, recibidas, disueltas, usuario);
      const n = registrarVersionPlan_(c, s, fila, {
        estado: estado, tipo: datos.tipo, usuario: usuario.correo, fecha: fecha,
        motivo: String(datos.motivo || "").slice(0, 500), asignaturas: f.asignaturas
      });
      const otros = guardarFusionesAjenas_(c, f.otros, usuario.correo, fecha);
      borrarRecuperacion_(c, Dominio.REF.plan(s), usuario.correo);
      const r = b ? tomarBloqueo_(c, Dominio.REF.plan(s), usuario.correo) : null;
      return { version: n, estado: estado, fecha: fecha, expira: r && r.ok ? r.expira : null, asignaturas: f.asignaturas, otros: otros };
    });
  });
}

function obtenerHistorial(ciclo, sig) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    return metaVersiones_(REPO_PLAN_, c, s, estadoDePlan_(filaPlan_(c, s)).version).map(sinFila_);
  });
}

/* Restaurar no borra el historial: crea una versión nueva con el contenido recuperado. */
function restaurarVersion(ciclo, sig, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
    exigirEdicion_(usuario, s);
    const k = parseInt(n, 10);

    return conCandado_(function () {
      const b = exigirSinBloqueoAjeno_(c, s, usuario, "no se restauró");
      const fila = filaPlan_(c, s);
      const p = estadoDePlan_(fila);
      if (!(k >= 1 && k <= p.version)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
      const antes = contenidoPlan_(c, s, p.version, p.filaVersion);
      const f = prepararFusiones_(c, s, antes, contenidoPlan_(c, s, k, 0), [], usuario);
      const estado = resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR);
      const fecha = new Date().toISOString();
      const version = registrarVersionPlan_(c, s, fila, {
        estado: estado, tipo: Dominio.TIPO_VERSION.restauracion(k), usuario: usuario.correo,
        fecha: fecha, motivo: "", asignaturas: f.asignaturas
      });
      const otros = guardarFusionesAjenas_(c, f.otros, usuario.correo, fecha);
      const r = b ? tomarBloqueo_(c, Dominio.REF.plan(s), usuario.correo) : null;
      return { version: version, estado: estado, asignaturas: f.asignaturas, otros: otros, expira: r && r.ok ? r.expira : null };
    });
  });
}

/* Deriva una asignatura a otro departamento sin abrir el plan. Lo hace el director del
   departamento al que hoy se pide el docente o el coordinador de la carrera. Crea una
   versión nueva del plan con el mismo estado. Las asignaciones de docentes la siguen. */
function cambiarDepartamento(ciclo, sig, grupoId, nuevo, motivo) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(sig), d = validarDpto_(nuevo);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(grupoId || ""))) fallo_("DATO_INVALIDO", "Grupo no válido.");
    motivo = String(motivo || "").slice(0, 300);
    return conCandado_(function () {
      const fila = filaPlan_(c, s);
      const p = estadoDePlan_(fila);
      if (!p.version) fallo_("NO_ENCONTRADO", "El plan de " + Dominio.nombreCarrera(s) + " no tiene asignaturas.");
      const asignaturas = contenidoPlan_(c, s, p.version, p.filaVersion);
      const a = asignaturas.filter(function (x) { return x.grupos.some(function (g) { return g.id === grupoId; }); })[0];
      if (!a) fallo_("NO_ENCONTRADO", "La asignatura ya no está en el plan de " + Dominio.nombreCarrera(s) + ". Actualiza la pantalla.");
      const actual = Dominio.normalizarDpto(a.dpto) || String(a.dpto || "").trim();
      const esDirector = usuario.rol === "director" && !!usuario.departamento && usuario.departamento === actual;
      if (!esDirector && usuario.carreras.indexOf(s) < 0)
        fallo_("SIN_PERMISO", usuario.rol === "director"
          ? "Solo puedes derivar los cursos que se piden a tu departamento (" + (usuario.departamento || "sin departamento") + ")."
          : "Solo el coordinador de " + Dominio.nombreCarrera(s) + " puede cambiar el departamento de sus asignaturas.");
      if (actual === d) return { version: p.version, estado: p.estado, totales: Dominio.totales(asignaturas), contenido: asignaturas, sinCambios: true };
      exigirSinBloqueoAjeno_(c, s, usuario, "el cambio de departamento no se guardó");
      a.dpto = d;
      const version = registrarVersionPlan_(c, s, fila, {
        estado: p.estado, tipo: Dominio.TIPO_VERSION.CAMBIO_DPTO, usuario: usuario.correo, fecha: new Date().toISOString(),
        motivo: (a.codigo + " " + a.nombre + ": " + (actual || "sin DPTO") + " → " + d + (motivo ? ". " + motivo : "")).slice(0, 500),
        asignaturas: asignaturas
      });
      return { version: version, estado: p.estado, totales: Dominio.totales(asignaturas), contenido: asignaturas };
    });
  });
}
