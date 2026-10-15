/* Asignación docente (CU-002). Cada departamento tiene su carga docente en cada ciclo: la
   lista de docentes asignados a las secciones que le piden los planes Registrados. Cada
   guardado añade una versión a VersionesCarga, como los planes, y Cargas apunta a la
   vigente. Solo el director del departamento la edita, con bloqueo; los demás la
   consultan. Este archivo tiene las funciones que llama el navegador; el catálogo está en
   CargaDocenteCatalogo.js y los datos, en CargaDocenteRepositorio.js. */

function obtenerCargaDocente(ciclo, dpto) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo || config_().cicloXlsx);
    const d = validarDpto_(dpto || usuario.departamento || "DIMA");
    const catalogo = leerCatalogoDocentes_(false);
    const planes = planesDelCiclo_(c);
    const unidades = Dominio.unidadesDelCiclo(planes);
    const cargas = cargasVigentes_(c);
    const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargas));
    const metas = cargas[d].version ? metaVersionesCarga_(c, d, cargas[d].version) : [];
    const b = bloqueoDe_(c, Dominio.REF.carga(d));
    return {
      ciclo: c, departamento: d, departamentoNombre: Dominio.nombreDpto(d),
      puedeEditar: puedeEditarCarga_(usuario, d),
      catalogo: catalogoVisible_(catalogo.docentes, usuario, d), columnasCatalogo: catalogo.columnas,
      unidades: unidades, cargas: cargasVisibles_(cargas, usuario, d),
      planes: planes.map(function (p) { return { sig: p.sig, estado: p.estado, version: p.version }; }),
      avisos: (catalogo.avisos || []).concat(avisosDeCarga_(d, planes, metas[metas.length - 1] || null, vig.sinSeccion)),
      bloqueo: b ? datosBloqueo_(b) : null
    };
  });
}

/* Qué grupos de cada plan del ciclo ya tienen docente: {ADM: {grupoId: [nombres]}}. El
   navegador lo pide aparte del tablero y en segundo plano: lo usa para mostrar los docentes
   en la consulta de un plan y para advertir antes de borrar un grupo con docente. */
function obtenerDocentesPorGrupo(ciclo) {
  return responder_(function () {
    exigirUsuario_();
    return docentesPorGrupo_(validarCiclo_(ciclo));
  });
}

/* Toma el bloqueo de la carga. Si la edita otra cuenta, falla con BLOQUEADO. */
function abrirEdicionCarga(ciclo, dpto, versionConocida) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(usuario, d);
    return conCandado_(function () {
      const r = tomarBloqueo_(c, Dominio.REF.carga(d), usuario.correo);
      if (!r.ok) falloBloqueado_("La carga de " + d, r.bloqueo);
      const v = vigente_(filaCarga_(c, d));
      const res = { version: v.version, expira: r.expira, recuperacion: leerRecuperacion_(c, Dominio.REF.carga(d), usuario.correo) };
      if (versionConocida == null || parseInt(versionConocida, 10) !== v.version)
        res.asignaciones = v.version ? contenidoCarga_(c, d, v.version, v.filaVersion) : [];
      return res;
    });
  });
}

function renovarBloqueoCarga(ciclo, dpto) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(usuario, d);
    return renovarBloqueo_(c, Dominio.REF.carga(d), usuario.correo);
  });
}

function liberarBloqueoCarga(ciclo, dpto) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    return soltarBloqueo_(c, Dominio.REF.carga(d), usuario.correo);
  });
}

function guardarCarga(ciclo, dpto, datos) {
  return responder_(function () { return guardarCarga_(ciclo, dpto, datos); });
}

/* datos: {asignaciones, versionBase, tipo («guardar» o «autoguardado»), motivo,
   motivoExceso, forzar}. Orquesta: permiso, bloqueo, conflicto, depuración, excesos de
   horas y guardado. */
function guardarCarga_(ciclo, dpto, datos) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
  exigirCarga_(usuario, d);
  if (!datos) fallo_("DATO_INVALIDO", "No llegó la carga que se quería guardar.");
  const recibidas = Dominio.sanearAsignaciones(datos.asignaciones);
  const T = Dominio.TIPO_VERSION;
  const tipo = datos.tipo === T.AUTOGUARDADO || T.esRestauracion(datos.tipo) ? datos.tipo : T.GUARDAR_CARGA;

  return conCandado_(function () {
    const b = bloqueoDe_(c, Dominio.REF.carga(d));
    if (b && b.correo !== usuario.correo)
      fallo_("BLOQUEADO", "La carga de " + d + " la está editando " + b.correo + ", así que no se guardó.");
    const fila = filaCarga_(c, d);
    if (!datos.forzar) exigirSinConflictoCarga_(c, d, vigente_(fila).version, datos.versionBase);

    const planes = planesDelCiclo_(c);
    const unidades = Dominio.unidadesDelCiclo(planes);
    const cargas = soloAsignaciones_(cargasVigentes_(c));
    const asignaciones = depurarCarga_(d, recibidas, unidades, cargas);
    const motivoExceso = validarExcesos_(leerCatalogoDocentes_(false).docentes, unidades, cargas, d, asignaciones, datos.motivoExceso);
    const g = persistirCarga_(c, d, fila, { tipo: tipo, usuario: usuario.correo, motivo: datos.motivo, motivoExceso: motivoExceso, planes: planes, asignaciones: asignaciones });
    const r = b ? tomarBloqueo_(c, Dominio.REF.carga(d), usuario.correo) : null;
    return { version: g.version, fecha: g.fecha, asignaciones: asignaciones, expira: r && r.ok ? r.expira : null };
  });
}

/* Si se guardó otra versión después de versionBase, falla con CONFLICTO para que el
   navegador advierta; con forzar se guarda igualmente (advertir, no prohibir). */
function exigirSinConflictoCarga_(ciclo, dpto, vigente, versionBase) {
  if (vigente <= (parseInt(versionBase, 10) || 0)) return;
  const ultima = metaVersionesCarga_(ciclo, dpto, vigente).filter(function (v) { return v.n === vigente; })[0];
  fallo_("CONFLICTO", "Mientras editabas se guardó la versión v" + vigente + " de la carga.",
         ultima ? { n: ultima.n, tipo: ultima.tipo, usuario: ultima.usuario, fecha: ultima.fecha } : { n: vigente });
}

/* Nadie puede pasar de 40 h lectivas (A07): si un docente lo haría, no se guarda. Un
   docente con cargo que pase de 24 h exige motivoExceso (A12). Compara el balance antes y
   después de cambiar la carga de dpto, así que solo cuentan los excesos que se crean o
   crecen ahora. Devuelve el motivo ya recortado. */
function validarExcesos_(catalogo, unidades, cargas, dpto, asignaciones, motivoExceso) {
  const nuevas = Object.assign({}, cargas);
  nuevas[dpto] = asignaciones;
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

/* Debe llamarse dentro de conCandado_. Añade la versión con la versión de cada plan a la
   vista (para avisar después si cambian) y borra la copia de recuperación. datos: {tipo,
   usuario, motivo, motivoExceso, planes, asignaciones}. */
function persistirCarga_(ciclo, dpto, fila, datos) {
  const fecha = new Date().toISOString();
  const motivo = [String(datos.motivo || "").trim().slice(0, 300), datos.motivoExceso ? "Exceso de carga con cargo: " + datos.motivoExceso : ""]
    .filter(Boolean).join(" · ");
  const vistos = {};
  datos.planes.forEach(function (p) { if (p.version) vistos[p.sig] = p.version; });
  const n = registrarVersionCarga_(ciclo, dpto, fila, { tipo: datos.tipo, usuario: datos.usuario, fecha: fecha, motivo: motivo.slice(0, 500),
                                                        planes: vistos, asignaciones: datos.asignaciones });
  borrarRecuperacion_(ciclo, Dominio.REF.carga(dpto), datos.usuario);
  return { version: n, fecha: fecha };
}

function obtenerHistorialCarga(ciclo, dpto) {
  return responder_(function () {
    exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    return metaVersionesCarga_(c, d, vigente_(filaCarga_(c, d)).version).map(function (v) { return { n: v.n, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo }; });
  });
}

function obtenerVersionCarga(ciclo, dpto, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    const lista = contenidoCarga_(c, d, parseInt(n, 10), 0);
    return puedeEditarCarga_(usuario, d) ? lista : lista.map(sinDni_);
  });
}

/* Restaurar no borra el historial: crea una versión nueva con el contenido recuperado,
   con las mismas reglas de un guardado. */
function restaurarCarga(ciclo, dpto, n) {
  return responder_(function () {
    const usuario = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(usuario, d);
    const k = parseInt(n, 10);
    const vigente = vigente_(filaCarga_(c, d)).version;
    if (!(k >= 1 && k <= vigente)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
    const asignaciones = contenidoCarga_(c, d, k, 0);
    return guardarCarga_(c, d, { asignaciones: asignaciones, versionBase: vigente, tipo: Dominio.TIPO_VERSION.restauracion(k), motivoExceso: Dominio.TIPO_VERSION.restauracion(k) });
  });
}
