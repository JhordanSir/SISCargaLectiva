// @ts-check
/* CU-002 «Asignar docentes al plan de ciclo»: lo que usan las entradas de cu002/
   (AsignacionServidor.js y AsignacionEdicionServidor.js). Cada carrera tiene su carga docente en cada
   ciclo: la lista de docentes asignados a las secciones de su plan Registrado (una sección
   fusionada va en la carga de la carrera de su grupo principal).
   La carga de una carrera la edita, con bloqueo, el director del departamento al que
   pertenece la carrera (Dominio.dptoDeCarrera). Un curso derivado a otro departamento
   (asignatura.derivado) lo asigna el director de ese departamento, en la misma carga: cada
   director solo cambia las secciones que le tocan y el servidor conserva las demás. Los
   demás consultan. Los datos están en CargaRepositorio.js, las reglas del guardado en
   CargaReglas.js y el catálogo en CatalogoDocentes.js. */

/* ============================================================
   Quién edita una carga
   ============================================================ */

/**
 * La carga de una carrera la edita el director del departamento de la carrera. El de otro
 * departamento solo si tiene cursos de esa carrera derivados a él; para saberlo hacen falta
 * las secciones del ciclo (unidades).
 * @param {Usuario} usuario
 * @param {string} carrera
 * @param {Seccion[]=} unidades
 * @returns {boolean}
 */
function puedeEditarCarga_(usuario, carrera, unidades) {
  if (usuario.rol !== "director" || !usuario.departamento) return false;
  if (Dominio.dptoDeCarrera(carrera) === usuario.departamento) return true;
  return (unidades || []).some(function (s) { return s.carrera === carrera && s.dpto === usuario.departamento; });
}

/**
 * Falla con SIN_PERMISO si la cuenta no puede editar la carga de esa carrera.
 * @param {Usuario} usuario
 * @param {string} carrera
 * @param {Seccion[]=} unidades
 * @returns {void}
 */
function exigirCarga_(usuario, carrera, unidades) {
  if (puedeEditarCarga_(usuario, carrera, unidades)) return;
  if (usuario.rol !== "director") fallo_("SIN_PERMISO", "El coordinador de carrera consulta la asignación docente en solo lectura.");
  if (!usuario.departamento) fallo_("SIN_PERMISO", "Tu cuenta de director no tiene departamento. Pide que lo escriban en la columna «departamento» de la pestaña Usuarios.");
  const d = usuario.departamento;
  fallo_("SIN_PERMISO", "Solo asignas docentes en las carreras de " + d + " (" + Dominio.carrerasDeDpto(d).join(", ") + ") y en los cursos derivados a " + d +
                        ". La carga de " + Dominio.nombreCarrera(carrera) + " la consultas en solo lectura.");
}

/**
 * Para lo que se repite mientras se edita (latido, copia de recuperación, restaurar):
 * basta con ser el director de la carrera o tener su bloqueo, que solo se da tras
 * comprobar el permiso completo. Si no, se comprueba con las secciones del ciclo.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {void}
 */
function exigirCargaEnEdicion_(usuario, ciclo, carrera) {
  if (puedeEditarCarga_(usuario, carrera)) return;
  const b = bloqueoDe_(ciclo, Dominio.REF.carga(carrera));
  if (usuario.rol === "director" && b && b.correo === usuario.correo) return;
  exigirCarga_(usuario, carrera, seccionesDelCiclo_(ciclo));
}

/* ============================================================
   Consulta de la carga
   ============================================================ */

/**
 * Secciones que piden docente en el ciclo (Dominio.unidadesDelCiclo de los planes vigentes).
 * @param {string} ciclo
 * @returns {Seccion[]}
 */
function seccionesDelCiclo_(ciclo) {
  return Dominio.unidadesDelCiclo(planesDelCiclo_(ciclo));
}

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
 * Todo lo que necesita la pantalla de asignación de una carrera: secciones del ciclo,
 * cargas de todas las carreras (para el balance), catálogo, avisos y bloqueo.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {Object}
 */
function cargaDeCarrera_(usuario, ciclo, carrera) {
  const catalogo = leerCatalogoDocentes_(false);
  const planes = planesDelCiclo_(ciclo);
  const unidades = Dominio.unidadesDelCiclo(planes);
  const cargas = cargasVigentes_(ciclo);
  const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargas));
  const metas = cargas[carrera].version ? metaVersionesCarga_(ciclo, carrera, cargas[carrera].version) : [];
  const b = bloqueoDe_(ciclo, Dominio.REF.carga(carrera));
  const d = Dominio.dptoDeCarrera(carrera);
  return {
    ciclo: ciclo, carrera: carrera, carreraNombre: Dominio.nombreCarrera(carrera), departamento: d, departamentoNombre: Dominio.nombreDpto(d),
    puedeEditar: puedeEditarCarga_(usuario, carrera, unidades),
    catalogo: catalogoVisible_(catalogo.docentes, usuario), columnasCatalogo: catalogo.columnas,
    unidades: unidades, cargas: cargasVisibles_(cargas, usuario, unidades),
    planes: planes.map(function (p) { return { sig: p.sig, estado: p.estado, version: p.version }; }),
    avisos: (catalogo.avisos || []).concat(avisosDeCarga_(carrera, planes, unidades, metas[metas.length - 1] || null,
      /** @type {Object<string, Asignacion[]>} */ (vig.sinSeccion))),
    bloqueo: b ? datosBloqueo_(b) : null
  };
}

/**
 * Versiones de la carga de una carrera.
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @returns {MetaVersion[]}
 */
function historialCarga_(ciclo, carrera) {
  return metaVersionesCarga_(ciclo, carrera, vigente_(filaCarga_(ciclo, carrera)).version)
    .map(function (v) { return { n: v.n, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo }; });
}

/**
 * Asignaciones de una versión de la carga, con DNI solo para el director de la carrera.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {Asignacion[]}
 */
function versionCarga_(usuario, ciclo, carrera, n) {
  const lista = contenidoCarga_(ciclo, carrera, parseInt(String(n), 10), 0);
  return puedeEditarCarga_(usuario, carrera) ? lista : lista.map(sinDni_);
}

/**
 * Grupos de cada plan que ya tienen docente: {ADM: {grupoId: ["Apellido, Nombre (DIMA)"]}}.
 * El departamento entre paréntesis es el que asigna la sección. Calcularlo lee todas las
 * cargas y arma las secciones del ciclo, así que se guarda en la caché con la versión de
 * cada plan y de cada carga en la clave: cualquier guardado cambia la clave, y nunca se
 * sirve un resultado viejo.
 * @param {string} ciclo
 * @returns {Object<string, Object<string, string[]>>}
 */
function docentesPorGrupo_(ciclo) {
  const filasPlan = leerPlanes_().filter(function (f) { return f.ciclo === ciclo; });
  if (!filasPlan.length) return {};
  const filasCarga = leerIndice_(REPO_CARGA_).filter(function (f) { return f.ciclo === ciclo; });
  const firma = filasPlan.map(function (f) { return "p:" + f.carrera + ":" + vigente_(f).version; })
    .concat(filasCarga.map(function (f) { return "c:" + f.carrera + ":" + vigente_(f).version; }))
    .sort().join(",");
  const clave = claveCache_("docentes", ciclo + ":" + Dominio.hash(firma));
  const guardado = leerDeCache_(clave);
  if (guardado) return guardado;

  /** @type {Object<string, Object<string, string[]>>} */
  const res = {};
  const unidades = Dominio.unidadesDelCiclo(planesDelCiclo_(ciclo, filasPlan));
  if (unidades.length) {
    const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargasVigentes_(ciclo, filasCarga)));
    vig.porUnidad.forEach(function (asigs, id) {
      const seccion = vig.idx.porId.get(id);
      const nombres = asigs.filter(function (a) { return String(a.docente || "").trim(); })
        .map(function (a) { return a.docente + " (" + seccion.dpto + ")"; })
        .filter(function (x, i, l) { return l.indexOf(x) === i; });
      if (!nombres.length) return;
      seccion.miembros.forEach(function (m) { (res[m.carrera] = res[m.carrera] || {})[m.grupoId] = nombres; });
    });
  }
  guardarEnCache_(clave, res, SEGUNDOS_CACHE_VERSION_);
  return res;
}

/* ============================================================
   Edición de la carga
   ============================================================ */

/**
 * Toma el bloqueo de la carga de una carrera. Si la edita otra cuenta, falla con BLOQUEADO.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number=} versionConocida
 * @returns {{version: number, expira: string, recuperacion: (Recuperacion|null), asignaciones?: Asignacion[]}}
 */
function abrirEdicionCarga_(usuario, ciclo, carrera, versionConocida) {
  return conCandado_(function () {
    const r = tomarBloqueo_(ciclo, Dominio.REF.carga(carrera), usuario.correo);
    if (!r.ok) falloBloqueado_("La carga de " + Dominio.nombreCarrera(carrera), r.bloqueo);
    const v = vigente_(filaCarga_(ciclo, carrera));
    const res = { version: v.version, expira: r.expira, recuperacion: leerRecuperacion_(ciclo, Dominio.REF.carga(carrera), usuario.correo) };
    if (versionConocida == null || parseInt(String(versionConocida), 10) !== v.version)
      res.asignaciones = v.version ? contenidoCarga_(ciclo, carrera, v.version, v.filaVersion) : [];
    return res;
  });
}

/**
 * datos: {asignaciones, versionBase, tipo («guardar», «autoguardado» o «restauración de
 * vN»), motivo, motivoExceso, forzar}. Orquesta: permiso, bloqueo, conflicto, combinación
 * con lo que no le toca a la cuenta, depuración, excesos de horas y guardado. El
 * autoguardado (FA-112) y la restauración (FA-087) guardan según los pasos 69 en adelante:
 * no aplican los límites de horas de los pasos 62 y 63 (A07, A12).
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {{asignaciones: Asignacion[], versionBase?: number, tipo?: string, motivo?: string, motivoExceso?: string, forzar?: boolean}} datos
 * @returns {{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}}
 */
function guardarCarga_(usuario, ciclo, carrera, datos) {
  if (!datos) fallo_("DATO_INVALIDO", "No llegó la carga que se quería guardar.");
  const recibidas = Dominio.sanearAsignaciones(datos.asignaciones);
  const T = Dominio.TIPO_VERSION;
  const automatico = datos.tipo === T.AUTOGUARDADO || T.esRestauracion(datos.tipo);
  const tipo = automatico ? datos.tipo : T.GUARDAR_CARGA;
  const planes = planesDelCiclo_(ciclo);
  const unidades = Dominio.unidadesDelCiclo(planes);
  exigirCarga_(usuario, carrera, unidades);

  return conCandado_(function () {
    const b = bloqueoDe_(ciclo, Dominio.REF.carga(carrera));
    if (b && b.correo !== usuario.correo)
      fallo_("BLOQUEADO", "La carga de " + Dominio.nombreCarrera(carrera) + " la está editando " + b.correo + ", así que no se guardó.");
    const fila = filaCarga_(ciclo, carrera);
    const v = vigente_(fila);
    if (!datos.forzar) exigirSinConflictoCarga_(ciclo, carrera, v.version, datos.versionBase);

    const cargas = soloAsignaciones_(cargasVigentes_(ciclo));
    const actuales = v.version ? contenidoCarga_(ciclo, carrera, v.version, v.filaVersion) : [];
    const combinadas = combinarCarga_(usuario, carrera, actuales, recibidas, unidades);
    const asignaciones = depurarCarga_(carrera, combinadas, unidades, cargas);
    const motivoExceso = automatico ? "" : validarExcesos_(leerCatalogoDocentes_(false).docentes, unidades, cargas, carrera, asignaciones, datos.motivoExceso);
    const g = persistirCarga_(ciclo, carrera, fila, { tipo: tipo, usuario: usuario.correo, motivo: datos.motivo, motivoExceso: motivoExceso, planes: planes, asignaciones: asignaciones });
    const r = b ? tomarBloqueo_(ciclo, Dominio.REF.carga(carrera), usuario.correo) : null;
    return { version: g.version, fecha: g.fecha, asignaciones: asignaciones, expira: r && r.ok ? r.expira : null };
  });
}

/**
 * CU-002 paso 68 (FA-108): si se guardó otra versión después de versionBase, falla con
 * CONFLICTO para que el navegador advierta; con forzar se guarda igualmente (advertir, no
 * prohibir).
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
 * Debe llamarse dentro de conCandado_. CU-002 pasos 71 a 76: añade la versión con la
 * versión de cada plan a la vista (para avisar después si cambian) y borra la copia de
 * recuperación. datos: {tipo, usuario, motivo, motivoExceso, planes, asignaciones}.
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
 * CU-002 FA-087: restaurar no borra el historial: crea una versión nueva con el contenido
 * recuperado, según los pasos 69 a 77 de un guardado (cada director solo restaura las
 * secciones que le tocan; no se aplican los límites de horas).
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} carrera
 * @param {number} n
 * @returns {{version: number, fecha: string, asignaciones: Asignacion[], expira: (string|null)}}
 */
function restaurarCarga_(usuario, ciclo, carrera, n) {
  const k = parseInt(String(n), 10);
  const vigente = vigente_(filaCarga_(ciclo, carrera)).version;
  if (!(k >= 1 && k <= vigente)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
  const asignaciones = contenidoCarga_(ciclo, carrera, k, 0);
  return guardarCarga_(usuario, ciclo, carrera, { asignaciones: asignaciones, versionBase: vigente, tipo: Dominio.TIPO_VERSION.restauracion(k) });
}
