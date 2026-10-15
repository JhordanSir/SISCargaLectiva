// @ts-check
/* Asignación docente (CU-002). Cada carrera tiene su carga docente en cada ciclo: la lista
   de docentes asignados a las secciones de su plan Registrado (una sección fusionada va en
   la carga de la carrera de su grupo principal). Cada guardado añade una versión a
   VersionesCarga, como los planes, y Cargas apunta a la vigente.
   La carga de una carrera la edita, con bloqueo, el director del departamento al que
   pertenece la carrera (Dominio.dptoDeCarrera). Un curso derivado a otro departamento
   (asignatura.derivado) lo asigna el director de ese departamento, en la misma carga: cada
   director solo cambia las secciones que le tocan y el servidor conserva las demás. Los
   demás consultan. Este archivo tiene las funciones que llama el navegador; el catálogo
   está en CargaDocenteCatalogo.js y los datos, en CargaDocenteRepositorio.js. */

/**
 * Carrera que se muestra si el navegador no pide ninguna: la primera del departamento del
 * director o la primera que coordina.
 * @param {Usuario} usuario
 * @returns {string}
 */
function carreraPorDefecto_(usuario) {
  return Dominio.carrerasDeDpto(usuario.departamento || "")[0] || (usuario.carreras || [])[0] || Dominio.CARRERAS[0].sig;
}

/**
 * Endpoint: todo lo que necesita la pantalla de asignación de una carrera: secciones del
 * ciclo, cargas de todas las carreras (para el balance), catálogo, avisos y bloqueo.
 * @param {string} ciclo
 * @param {Sigla=} carrera Por defecto, la primera del departamento del director.
 * @returns {Respuesta<Object>}
 */
function obtenerCargaDocente(ciclo, carrera) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo || config_().cicloXlsx);
    const s = validarCarrera_(carrera || carreraPorDefecto_(usuario));
    const catalogo = leerCatalogoDocentes_(false);
    const planes = planesDelCiclo_(c);
    const unidades = Dominio.unidadesDelCiclo(planes);
    const cargas = cargasVigentes_(c);
    const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargas));
    const metas = cargas[s].version ? metaVersionesCarga_(c, s, cargas[s].version) : [];
    const b = bloqueoDe_(c, Dominio.REF.carga(s));
    const d = Dominio.dptoDeCarrera(s);
    return {
      ciclo: c, carrera: s, carreraNombre: Dominio.nombreCarrera(s), departamento: d, departamentoNombre: Dominio.nombreDpto(d),
      puedeEditar: puedeEditarCarga_(usuario, s, unidades),
      catalogo: catalogoVisible_(catalogo.docentes, usuario), columnasCatalogo: catalogo.columnas,
      unidades: unidades, cargas: cargasVisibles_(cargas, usuario, unidades),
      planes: planes.map(function (p) { return { sig: p.sig, estado: p.estado, version: p.version }; }),
      avisos: (catalogo.avisos || []).concat(avisosDeCarga_(s, planes, unidades, metas[metas.length - 1] || null,
        /** @type {Object<string, Asignacion[]>} */ (vig.sinSeccion))),
      bloqueo: b ? datosBloqueo_(b) : null
    };
  });
}

/**
 * Qué grupos de cada plan del ciclo ya tienen docente: {ADM: {grupoId: [nombres]}}. El
 * navegador lo pide aparte del tablero y en segundo plano: lo usa para mostrar los docentes
 * en la consulta de un plan y para advertir antes de borrar un grupo con docente.
 * @param {string} ciclo
 * @returns {Respuesta<Object<string, Object<string, string[]>>>}
 */
function obtenerDocentesPorGrupo(ciclo) {
  return responder_(function () {
    exigirUsuario_();
    return docentesPorGrupo_(validarCiclo_(ciclo));
  });
}

/**
 * Toma el bloqueo de la carga de una carrera. Si la edita otra cuenta, falla con BLOQUEADO.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number=} versionConocida
 * @returns {Respuesta<{version: number, expira: string, recuperacion: (Recuperacion|null), asignaciones?: Asignacion[]}>}
 */
function abrirEdicionCarga(ciclo, carrera, versionConocida) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    exigirCarga_(usuario, s, seccionesDelCiclo_(c));
    return conCandado_(function () {
      const r = tomarBloqueo_(c, Dominio.REF.carga(s), usuario.correo);
      if (!r.ok) falloBloqueado_("La carga de " + Dominio.nombreCarrera(s), r.bloqueo);
      const v = vigente_(filaCarga_(c, s));
      const res = { version: v.version, expira: r.expira, recuperacion: leerRecuperacion_(c, Dominio.REF.carga(s), usuario.correo) };
      if (versionConocida == null || parseInt(String(versionConocida), 10) !== v.version)
        res.asignaciones = v.version ? contenidoCarga_(c, s, v.version, v.filaVersion) : [];
      return res;
    });
  });
}

/**
 * Endpoint: renueva el bloqueo de la carga (latido). Falla con BLOQUEO_PERDIDO si otra cuenta lo tomó.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {Respuesta<{expira: string}>}
 */
function renovarBloqueoCarga(ciclo, carrera) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    exigirCargaEnEdicion_(usuario, c, s);
    return renovarBloqueo_(c, Dominio.REF.carga(s), usuario.correo);
  });
}

/**
 * Endpoint: suelta el bloqueo de la carga que tenga la cuenta.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {Respuesta<boolean>}
 */
function liberarBloqueoCarga(ciclo, carrera) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    return soltarBloqueo_(c, Dominio.REF.carga(s), usuario.correo);
  });
}

/**
 * Endpoint: guarda la carga de una carrera (ver guardarCarga_).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {Object} datos
 * @returns {Respuesta<{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}>}
 */
function guardarCarga(ciclo, carrera, datos) {
  return responder_(function () { return guardarCarga_(ciclo, carrera, datos); });
}

/**
 * datos: {asignaciones, versionBase, tipo («guardar» o «autoguardado»), motivo,
 * motivoExceso, forzar}. Orquesta: permiso, bloqueo, conflicto, combinación con lo que no
 * le toca a la cuenta, depuración, excesos de horas y guardado.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {{asignaciones: Asignacion[], versionBase?: number, tipo?: string, motivo?: string, motivoExceso?: string, forzar?: boolean}} datos
 * @returns {{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}}
 */
function guardarCarga_(ciclo, carrera, datos) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
  if (!datos) fallo_("DATO_INVALIDO", "No llegó la carga que se quería guardar.");
  const recibidas = Dominio.sanearAsignaciones(datos.asignaciones);
  const T = Dominio.TIPO_VERSION;
  const tipo = datos.tipo === T.AUTOGUARDADO || T.esRestauracion(datos.tipo) ? datos.tipo : T.GUARDAR_CARGA;
  const planes = planesDelCiclo_(c);
  const unidades = Dominio.unidadesDelCiclo(planes);
  exigirCarga_(usuario, s, unidades);

  return conCandado_(function () {
    const b = bloqueoDe_(c, Dominio.REF.carga(s));
    if (b && b.correo !== usuario.correo)
      fallo_("BLOQUEADO", "La carga de " + Dominio.nombreCarrera(s) + " la está editando " + b.correo + ", así que no se guardó.");
    const fila = filaCarga_(c, s);
    const v = vigente_(fila);
    if (!datos.forzar) exigirSinConflictoCarga_(c, s, v.version, datos.versionBase);

    const cargas = soloAsignaciones_(cargasVigentes_(c));
    const actuales = v.version ? contenidoCarga_(c, s, v.version, v.filaVersion) : [];
    const combinadas = combinarCarga_(usuario, s, actuales, recibidas, unidades);
    const asignaciones = depurarCarga_(s, combinadas, unidades, cargas);
    const motivoExceso = validarExcesos_(leerCatalogoDocentes_(false).docentes, unidades, cargas, s, asignaciones, datos.motivoExceso);
    const g = persistirCarga_(c, s, fila, { tipo: tipo, usuario: usuario.correo, motivo: datos.motivo, motivoExceso: motivoExceso, planes: planes, asignaciones: asignaciones });
    const r = b ? tomarBloqueo_(c, Dominio.REF.carga(s), usuario.correo) : null;
    return { version: g.version, fecha: g.fecha, asignaciones: asignaciones, expira: r && r.ok ? r.expira : null };
  });
}

/**
 * Lo que queda en la carga de una carrera tras el guardado de una cuenta: las asignaciones
 * que no le tocan (secciones que asigna otro departamento) se conservan como estaban, y las
 * que le tocan son las que envió. Una asignación sin sección le toca al dueño de la carga.
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
 * Si se guardó otra versión después de versionBase, falla con CONFLICTO para que el
 * navegador advierta; con forzar se guarda igualmente (advertir, no prohibir).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} vigente
 * @param {*} versionBase
 * @returns {void}
 */
function exigirSinConflictoCarga_(ciclo, carrera, vigente, versionBase) {
  if (vigente <= (parseInt(versionBase, 10) || 0)) return;
  const ultima = metaVersionesCarga_(ciclo, carrera, vigente).filter(function (v) { return v.n === vigente; })[0];
  fallo_("CONFLICTO", "Mientras editabas se guardó la versión v" + vigente + " de la carga.",
         ultima ? { n: ultima.n, tipo: ultima.tipo, usuario: ultima.usuario, fecha: ultima.fecha } : { n: vigente });
}

/**
 * Nadie puede pasar de 40 h lectivas (A07): si un docente lo haría, no se guarda. Un
 * docente con cargo que pase de 24 h exige motivoExceso (A12). Compara el balance antes y
 * después de cambiar la carga de la carrera, así que solo cuentan los excesos que se crean
 * o crecen ahora. Devuelve el motivo ya recortado.
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
 * Debe llamarse dentro de conCandado_. Añade la versión con la versión de cada plan a la
 * vista (para avisar después si cambian) y borra la copia de recuperación. datos: {tipo,
 * usuario, motivo, motivoExceso, planes, asignaciones}.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {FilaTabla|null} fila
 * @param {{tipo: string, usuario: string, motivo?: string, motivoExceso?: string, planes: Array<{sig: Sigla, version: number}>, asignaciones: Asignacion[]}} datos
 * @returns {{version: number, fecha: string}}
 */
function persistirCarga_(ciclo, carrera, fila, datos) {
  const fecha = Dominio.isoPeru();
  const motivo = [String(datos.motivo || "").trim().slice(0, 300), datos.motivoExceso ? "Exceso de carga con cargo: " + datos.motivoExceso : ""]
    .filter(Boolean).join(" · ");
  /** @type {Object<string, number>} */
  const vistos = {};
  datos.planes.forEach(function (p) { if (p.version) vistos[p.sig] = p.version; });
  const n = registrarVersionCarga_(ciclo, carrera, fila, { tipo: datos.tipo, usuario: datos.usuario, fecha: fecha, motivo: motivo.slice(0, 500),
                                                           planes: vistos, asignaciones: datos.asignaciones });
  borrarRecuperacion_(ciclo, Dominio.REF.carga(carrera), datos.usuario);
  return { version: n, fecha: fecha };
}

/**
 * Endpoint: versiones de la carga de una carrera.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {Respuesta<MetaVersion[]>}
 */
function obtenerHistorialCarga(ciclo, carrera) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    return metaVersionesCarga_(c, s, vigente_(filaCarga_(c, s)).version).map(function (v) { return { n: v.n, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo }; });
  });
}

/**
 * Endpoint: asignaciones de una versión de la carga (con DNI solo para el director de la carrera).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {Respuesta<Asignacion[]>}
 */
function obtenerVersionCarga(ciclo, carrera, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    const lista = contenidoCarga_(c, s, parseInt(String(n), 10), 0);
    return puedeEditarCarga_(usuario, s) ? lista : lista.map(sinDni_);
  });
}

/**
 * Restaurar no borra el historial: crea una versión nueva con el contenido recuperado,
 * con las mismas reglas de un guardado (cada director solo restaura las secciones que le
 * tocan).
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {Respuesta<{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}>}
 */
function restaurarCarga(ciclo, carrera, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), s = validarCarrera_(carrera);
    exigirCargaEnEdicion_(usuario, c, s);
    const k = parseInt(String(n), 10);
    const vigente = vigente_(filaCarga_(c, s)).version;
    if (!(k >= 1 && k <= vigente)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
    const asignaciones = contenidoCarga_(c, s, k, 0);
    return guardarCarga_(c, s, { asignaciones: asignaciones, versionBase: vigente, tipo: Dominio.TIPO_VERSION.restauracion(k), motivoExceso: Dominio.TIPO_VERSION.restauracion(k) });
  });
}
