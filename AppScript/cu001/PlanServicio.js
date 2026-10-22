// @ts-check
/* Reglas de CU-001 «Registrar plan de ciclo» que usan las entradas de cu001/ (Tablero.js,
   Consulta.js y EdicionPlan.js): quién edita un plan, el tablero del ciclo, la consulta, la
   apertura de la edición y el guardado y la restauración de versiones. Leen y escriben a
   través de PlanRepositorio.js; las fusiones con otras carreras están en Fusiones.js. */

/**
 * Solo el coordinador de una carrera edita su plan; falla con SIN_PERMISO si no.
 * @param {Usuario} usuario
 * @param {Sigla} sig
 * @returns {void}
 */
function exigirEdicionPlan_(usuario, sig) {
  if (usuario.carreras.indexOf(sig) < 0)
    fallo_("SIN_PERMISO", usuario.rol === "director"
      ? "El director de departamento no edita los planes de ciclo: los consulta y puede derivar a otro departamento los cursos que piden al suyo."
      : "Tu cuenta no tiene permiso para editar el plan de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarlo.");
}

/**
 * Un plan Registrado nunca vuelve a Borrador.
 * @param {string} actual
 * @param {string} pedido
 * @returns {string}
 */
function resolverEstado_(actual, pedido) {
  if (actual === Dominio.ESTADOS.REGISTRADO) return Dominio.ESTADOS.REGISTRADO;
  return pedido === Dominio.ESTADOS.REGISTRADO ? Dominio.ESTADOS.REGISTRADO : Dominio.ESTADOS.BORRADOR;
}

/**
 * Si otro guardado dejó una versión posterior a versionBase, devuelve sus datos para que
 * el navegador advierta antes de guardar encima.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number} vigente
 * @param {*} versionBase
 * @returns {MetaVersion|{n: number}|null}
 */
function conflictoPlan_(ciclo, sig, vigente, versionBase) {
  if (vigente <= (parseInt(versionBase, 10) || 0)) return null;
  const ultima = versionesDelPlan_(ciclo, sig, vigente).filter(function (v) { return v.n === vigente; })[0];
  return ultima ? sinFila_(ultima) : { n: vigente };
}

/**
 * El plan no se puede guardar si otra cuenta tiene su bloqueo.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {Usuario} usuario
 * @param {string} accion Lo que no se hizo, para el mensaje.
 * @returns {FilaTabla|null} El bloqueo propio, si lo hay.
 */
function exigirSinBloqueoAjeno_(ciclo, sig, usuario, accion) {
  const b = bloqueoDe_(ciclo, Dominio.REF.plan(sig));
  if (b && b.correo !== usuario.correo)
    fallo_("BLOQUEADO", "El plan de " + Dominio.nombreCarrera(sig) + " lo está editando " + b.correo + ", así que " + accion + ". Inténtalo cuando termine.");
  return b;
}

/* ============================================================
   Tablero y consulta
   ============================================================ */

/**
 * Filas del tablero de un ciclo, con el contenido vigente de cada plan: así el navegador
 * consulta un plan o empieza a editarlo sin volver a pedirlo. No lee las cargas docentes:
 * qué grupos tienen docente lo pide el navegador aparte (docentesAsignadosObtener).
 * @param {string} ciclo
 * @returns {FilaTablero[]}
 */
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

/**
 * Contenido vigente de un plan, con su estado y quién lo edita.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {{estado: string, version: number, asignaturas: Asignatura[], bloqueo: (Bloqueo|null)}}
 */
function planVigente_(ciclo, sig) {
  const p = estadoDePlan_(filaPlan_(ciclo, sig));
  const b = bloqueoDe_(ciclo, Dominio.REF.plan(sig));
  return {
    estado: p.estado,
    version: p.version,
    asignaturas: p.version ? contenidoPlan_(ciclo, sig, p.version, p.filaVersion) : [],
    bloqueo: b ? datosBloqueo_(b) : null
  };
}

/* ============================================================
   Edición
   ============================================================ */

/**
 * Toma el bloqueo del plan y devuelve lo que hace falta para editarlo, con la copia de
 * recuperación de la cuenta si la hay. versionConocida: la versión que el navegador ya
 * tiene; si sigue siendo la vigente, no se devuelve el contenido.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number=} versionConocida
 * @returns {{estado: string, version: number, expira: string, asignaturas?: Asignatura[], recuperacion: (Recuperacion|null)}}
 */
function abrirEdicionPlan_(usuario, ciclo, sig, versionConocida) {
  return conCandado_(function () {
    const r = tomarBloqueo_(ciclo, Dominio.REF.plan(sig), usuario.correo);
    if (!r.ok) falloBloqueado_("El plan de " + Dominio.nombreCarrera(sig), r.bloqueo);
    const p = estadoDePlan_(filaPlan_(ciclo, sig));
    const res = { estado: p.estado, version: p.version, expira: r.expira, recuperacion: leerRecuperacion_(ciclo, Dominio.REF.plan(sig), usuario.correo) };
    if (versionConocida == null || parseInt(String(versionConocida), 10) !== p.version)
      res.asignaturas = p.version ? contenidoPlan_(ciclo, sig, p.version, p.filaVersion) : [];
    return res;
  });
}

/**
 * Guarda una versión nueva del plan. datos: {asignaturas, estado, tipo, motivo, versionBase,
 * forzar, fusionesDisueltas}. Si se guardó otra versión después de versionBase, falla con
 * CONFLICTO para que el navegador advierta; con forzar se guarda igualmente (advertir, no
 * prohibir). Las fusiones con grupos de otras carreras se llevan a esos planes
 * (Fusiones.js); el plan guardado vuelve en «asignaturas» y los planes ajenos tocados, en
 * «otros».
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {{asignaturas: Asignatura[], estado: string, tipo: string, motivo?: string, versionBase: number, forzar?: boolean, fusionesDisueltas?: string[]}} datos
 * @returns {{version: number, estado: string, fecha: string, expira: (string|null), asignaturas: Asignatura[], otros: Array<Object>}}
 */
function guardarPlan_(usuario, ciclo, sig, datos) {
  const recibidas = Dominio.sanearAsignaturas(datos.asignaturas);
  const disueltas = Dominio.sanearMarcas(datos.fusionesDisueltas);

  return conCandado_(function () {
    const b = exigirSinBloqueoAjeno_(ciclo, sig, usuario, "no se guardó");
    const fila = filaPlan_(ciclo, sig);
    const p = estadoDePlan_(fila);
    const conflicto = datos.forzar ? null : conflictoPlan_(ciclo, sig, p.version, datos.versionBase);
    if (conflicto) fallo_("CONFLICTO", "Mientras editabas se guardó la versión v" + conflicto.n + " del plan.", conflicto);
    const estado = resolverEstado_(p.estado, datos.estado);
    const fecha = Dominio.isoPeru();
    const antes = p.version ? contenidoPlan_(ciclo, sig, p.version, p.filaVersion) : [];
    const f = prepararFusiones_(ciclo, sig, antes, recibidas, disueltas, usuario);
    const n = registrarVersionPlan_(ciclo, sig, fila, {
      estado: estado, tipo: datos.tipo, usuario: usuario.correo, fecha: fecha,
      motivo: String(datos.motivo || "").slice(0, 500), asignaturas: f.asignaturas
    });
    const otros = guardarFusionesAjenas_(ciclo, f.otros, usuario.correo, fecha);
    borrarRecuperacion_(ciclo, Dominio.REF.plan(sig), usuario.correo);
    const r = b ? tomarBloqueo_(ciclo, Dominio.REF.plan(sig), usuario.correo) : null;
    return { version: n, estado: estado, fecha: fecha, expira: r && r.ok ? r.expira : null, asignaturas: f.asignaturas, otros: otros };
  });
}

/**
 * Versiones de un plan, de la más antigua a la más reciente.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @returns {MetaVersion[]}
 */
function historialPlan_(ciclo, sig) {
  return versionesDelPlan_(ciclo, sig, estadoDePlan_(filaPlan_(ciclo, sig)).version).map(sinFila_);
}

/**
 * Restaurar no borra el historial: crea una versión nueva con el contenido de la versión n.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {number} n
 * @returns {{version: number, estado: string, asignaturas: Asignatura[], otros: Array<Object>, expira: (string|null)}}
 */
function restaurarPlan_(usuario, ciclo, sig, n) {
  const k = parseInt(String(n), 10);
  return conCandado_(function () {
    const b = exigirSinBloqueoAjeno_(ciclo, sig, usuario, "no se restauró");
    const fila = filaPlan_(ciclo, sig);
    const p = estadoDePlan_(fila);
    if (!(k >= 1 && k <= p.version)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
    const antes = contenidoPlan_(ciclo, sig, p.version, p.filaVersion);
    const f = prepararFusiones_(ciclo, sig, antes, contenidoPlan_(ciclo, sig, k, 0), [], usuario);
    const estado = resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR);
    const fecha = Dominio.isoPeru();
    const version = registrarVersionPlan_(ciclo, sig, fila, {
      estado: estado, tipo: Dominio.TIPO_VERSION.restauracion(k), usuario: usuario.correo,
      fecha: fecha, motivo: "", asignaturas: f.asignaturas
    });
    const otros = guardarFusionesAjenas_(ciclo, f.otros, usuario.correo, fecha);
    const r = b ? tomarBloqueo_(ciclo, Dominio.REF.plan(sig), usuario.correo) : null;
    return { version: version, estado: estado, asignaturas: f.asignaturas, otros: otros, expira: r && r.ok ? r.expira : null };
  });
}
