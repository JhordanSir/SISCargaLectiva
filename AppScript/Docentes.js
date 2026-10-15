/* Asignación docente (CU-002). Cada departamento tiene su carga docente en cada ciclo: la
   lista de docentes asignados a las secciones que le piden los planes Registrados. Cada
   guardado añade una versión a VersionesCarga, como los planes, y Cargas apunta a la
   vigente. Solo el director del departamento la edita, con bloqueo; los demás la
   consultan. El catálogo de docentes sale de CargaDeDocentes.xlsx en Drive. */

var SEGUNDOS_CACHE_CATALOGO_ = 3600;

/* ============================================================
   Catálogo de docentes (CargaDeDocentes.xlsx)
   ============================================================ */

/* Columnas opcionales que amplían el catálogo: «TC OTRA UNIVERSIDAD» (Sí/No), «CARGO»
   (texto; si tiene algo, el docente tiene cargo administrativo) y «NO LECTIVAS» (horas). */
function leerCatalogoDocentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("catalogo", cfg.carpetaId);
  if (!forzar) {
    const guardado = leerDeCache_(clave);
    if (guardado && Array.isArray(guardado.docentes)) return guardado;
  }
  const res = { docentes: [], avisos: [], columnas: {} };
  const carpeta = abrirCarpeta_(cfg.carpetaId);
  if (!carpeta) { res.avisos.push(Dominio.aviso("CATALOGO_SIN_CARPETA", "No se pudo abrir la carpeta de Drive del sistema.")); return res; }
  const fuentes = localizarXlsx_(carpeta, []);
  if (!fuentes.docentes) {
    res.avisos.push(Dominio.aviso("CATALOGO_FALTA", "La carpeta no tiene el archivo CargaDeDocentes (.xlsx): no hay catálogo de docentes. Puedes escribir los nombres a mano."));
    return res;
  }
  try {
    const libro = leerLibroXlsx_(descomprimirXlsx_(fuentes.docentes.getBlob()));
    const hoja = libro.filter(function (h) { return /general/i.test(h.nombre); })[0] || libro[0];
    const filas = hoja && hoja.filas ? hoja.filas : [];
    let cab = -1;
    for (let i = 0; i < Math.min(10, filas.length) && cab < 0; i++) {
      const f = (filas[i] || []).map(Dominio.normalizar);
      if (f.some(function (c) { return c.indexOf("NOMBRE") >= 0; }) && f.some(function (c) { return c.indexOf("PAT") >= 0 || c === "DNI"; })) cab = i;
    }
    if (cab < 0) { res.avisos.push(Dominio.aviso("CATALOGO_SIN_CABECERAS", "No se reconocen las cabeceras de CargaDeDocentes.")); return res; }
    const col = {};
    filas[cab].map(Dominio.normalizar).forEach(function (c, j) {
      const fijar = function (k, cond) { if (cond && col[k] === undefined) col[k] = j; };
      fijar("dni", c === "DNI");
      fijar("pat", c.indexOf("PATERNO") >= 0 || c.indexOf("APELLIDO PAT") >= 0);
      fijar("mat", c.indexOf("MATERNO") >= 0 || c.indexOf("APELLIDO MAT") >= 0);
      fijar("nom", c === "NOMBRES" || c === "NOMBRE");
      fijar("cond", c.indexOf("CONDICION") >= 0);
      fijar("cat", c.indexOf("CATEGORIA") >= 0);
      fijar("dpto", c.indexOf("DEPARTAMENTO") >= 0 || c === "DPTO");
      fijar("dedic", c.indexOf("DEDIC") >= 0);
      fijar("tcOtra", c.indexOf("OTRA") >= 0 && (c.indexOf("UNIV") >= 0 || c.indexOf("INSTIT") >= 0));
      fijar("cargo", c.indexOf("CARGO") >= 0);
      fijar("noLect", c.indexOf("NO LECTIV") >= 0);
    });
    res.columnas = { tcOtra: col.tcOtra !== undefined, cargo: col.cargo !== undefined, noLectivas: col.noLect !== undefined };
    const v = function (f, k) { return col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : ""; };
    const si = function (t) { const n = Dominio.normalizar(t); return /^(SI|S|X|1|TRUE|VERDADERO|TC)$/.test(n) || n.indexOf("SI ") === 0; };
    for (let r = cab + 1; r < filas.length; r++) {
      const f = filas[r] || [];
      const pat = v(f, "pat"), mat = v(f, "mat"), nom = v(f, "nom");
      if (!pat && !nom) continue;
      const dptoTexto = v(f, "dpto");
      const dedic = Dominio.normalizar(v(f, "dedic"));
      res.docentes.push({
        dni: v(f, "dni"),
        nombreCompleto: (pat + " " + mat).trim() + (nom ? ", " + nom : ""),
        condicion: v(f, "cond"), categoria: v(f, "cat"),
        dpto: Dominio.normalizarDpto(dptoTexto) || dptoTexto,
        dedicacion: dedic.indexOf("TC") >= 0 || dedic.indexOf("COMPLETO") >= 0 ? "TC" : (dedic ? "TP" : ""),
        tcOtra: col.tcOtra !== undefined && si(v(f, "tcOtra")),
        cargo: col.cargo !== undefined ? v(f, "cargo") : "",
        noLectivas: col.noLect !== undefined ? Dominio.num(v(f, "noLect")) : null
      });
    }
    guardarEnCache_(clave, res, SEGUNDOS_CACHE_CATALOGO_);
  } catch (e) {
    res.avisos.push(Dominio.aviso("CATALOGO_ILEGIBLE", "No se pudo leer CargaDeDocentes: " + e.message));
  }
  return res;
}

/* ============================================================
   Secciones del ciclo y cargas de los departamentos
   ============================================================ */

function planesDelCiclo_(ciclo) {
  const filas = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(REPO_PLAN_, ciclo, filas);
  return Dominio.CARRERAS.map(function (c) {
    const fila = buscarPlan_(filas, ciclo, c.sig);
    const p = estadoDePlan_(fila);
    return { sig: c.sig, estado: p.estado, version: p.version, contenido: contenidos[c.sig] || [],
             usuario: fila ? fila.actualizado_por : "", fecha: fila ? fila.actualizado_en : "" };
  });
}

/* Carga docente de un departamento: repositorio REPO_CARGA_ (Versionado.js). */
function filaCarga_(ciclo, dpto) {
  return filaIndice_(REPO_CARGA_, ciclo, dpto);
}

function contenidoCarga_(ciclo, dpto, n, filaVersion) {
  return contenidoVersion_(REPO_CARGA_, ciclo, dpto, n, filaVersion);
}

/* Versiones de la carga, con «planes» (la versión de cada plan a la vista al guardar). */
function metaVersionesCarga_(ciclo, dpto, vigente) {
  return metaVersiones_(REPO_CARGA_, ciclo, dpto, vigente).map(function (v) {
    let planes = {};
    try { planes = v.planes ? JSON.parse(v.planes) : {}; } catch (e) { planes = {}; }
    return Object.assign({}, v, { planes: planes });
  });
}

/* Carga vigente de cada departamento: {DIMA: {version, asignaciones, usuario, fecha}, …}. */
function cargasVigentes_(ciclo) {
  const filas = leerIndice_(REPO_CARGA_).filter(function (f) { return f.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(REPO_CARGA_, ciclo, filas);
  const res = {};
  Dominio.DPTOS.forEach(function (d) {
    const f = buscarEnIndice_(REPO_CARGA_, filas, ciclo, d);
    res[d] = { version: vigente_(f).version, usuario: f ? f.actualizado_por : "", fecha: f ? f.actualizado_en : "", asignaciones: contenidos[d] || [] };
  });
  return res;
}

function soloAsignaciones_(cargas) {
  const r = {};
  Object.keys(cargas).forEach(function (d) { r[d] = cargas[d].asignaciones; });
  return r;
}

/* Debe llamarse dentro de conCandado_. datos: {tipo, usuario, fecha, motivo, planes,
   asignaciones}. Devuelve el número de la versión nueva. */
function registrarVersionCarga_(ciclo, dpto, fila, datos) {
  return registrarVersion_(REPO_CARGA_, ciclo, dpto, fila, {
    usuario: datos.usuario, fecha: datos.fecha, contenido: datos.asignaciones,
    meta: { tipo: datos.tipo, motivo: datos.motivo || "", planes: JSON.stringify(datos.planes || {}) }
  });
}

/* Grupos de cada plan que ya tienen docente: {ADM: {grupoId: ["Apellido, Nombre (DIMA)"]}}. */
function docentesPorGrupo_(ciclo, filasTablero) {
  const unidades = Dominio.unidadesDelCiclo(filasTablero.map(function (f) { return { sig: f.sig, estado: f.estado, contenido: f.contenido }; }));
  if (!unidades.length) return {};
  const cargas = soloAsignaciones_(cargasVigentes_(ciclo));
  const vig = Dominio.asignacionesVigentes(unidades, cargas);
  const res = {};
  vig.porUnidad.forEach(function (asigs, id) {
    const u = vig.idx.porId.get(id);
    const nombres = asigs.filter(function (a) { return String(a.docente || "").trim(); })
      .map(function (a) { return a.docente + " (" + a.dptoCarga + ")"; })
      .filter(function (x, i, l) { return l.indexOf(x) === i; });
    if (!nombres.length) return;
    u.miembros.forEach(function (m) { (res[m.carrera] = res[m.carrera] || {})[m.grupoId] = nombres; });
  });
  return res;
}

/* Lo que no cuadra entre los planes y la última carga guardada de un departamento:
   planes que cambiaron después y asignaciones que se quedaron sin sección. */
function avisosDeCarga_(dpto, planes, meta, sinSeccion) {
  const avisos = [];
  const vistos = meta ? meta.planes || {} : {};
  if (meta) planes.forEach(function (p) {
    const antes = parseInt(vistos[p.sig], 10) || 0;
    if (p.version > antes && antes > 0)
      avisos.push(Dominio.aviso("PLAN_CAMBIADO", "El plan de " + Dominio.nombreCarrera(p.sig) + " cambió después del último guardado de esta carga (v" +
                  antes + " → v" + p.version + (p.usuario ? ", " + p.usuario : "") + "). Revisa sus secciones.",
                  { carrera: p.sig, antes: antes, ahora: p.version, usuario: p.usuario || "" }));
  });
  const n = (sinSeccion[dpto] || []).length;
  if (n) avisos.push(Dominio.aviso("SIN_SECCION", n === 1 ? "1 asignación se quedó sin sección en el plan: reasígnala o quítala."
                                                      : n + " asignaciones se quedaron sin sección en el plan: reasígnalas o quítalas.", { cuantas: n }));
  return avisos;
}

/* El DNI solo lo recibe el director del departamento: el de sus docentes en el catálogo
   y el de las asignaciones de su propia carga. Los demás identifican a los docentes por
   su nombre. */
function sinDni_(x) {
  const c = Object.assign({}, x);
  delete c.dni;
  if (Array.isArray(c.historial)) c.historial = c.historial.map(function (h) { const y = Object.assign({}, h); delete y.dni; return y; });
  return c;
}

function catalogoVisible_(docentes, u, dpto) {
  const puede = puedeEditarCarga_(u, dpto);
  return docentes.map(function (doc) { return puede && doc.dpto === dpto ? doc : sinDni_(doc); });
}

function cargasVisibles_(cargas, u, dpto) {
  const puede = puedeEditarCarga_(u, dpto);
  const r = {};
  Object.keys(cargas).forEach(function (k) {
    r[k] = Object.assign({}, cargas[k], { asignaciones: puede && k === dpto ? cargas[k].asignaciones : cargas[k].asignaciones.map(sinDni_) });
  });
  return r;
}

/* ============================================================
   Funciones que llama el navegador
   ============================================================ */

function obtenerEstadoDocentes(ciclo, dpto) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo || config_().cicloXlsx);
    const d = validarDpto_(dpto || u.departamento || "DIMA");
    const catalogo = leerCatalogoDocentes_(false);
    const planes = planesDelCiclo_(c);
    const unidades = Dominio.unidadesDelCiclo(planes);
    const cargas = cargasVigentes_(c);
    const vig = Dominio.asignacionesVigentes(unidades, soloAsignaciones_(cargas));
    const metas = cargas[d].version ? metaVersionesCarga_(c, d, cargas[d].version) : [];
    const b = bloqueoDe_(c, Dominio.REF.carga(d));
    return {
      ciclo: c, departamento: d, departamentoNombre: Dominio.nombreDpto(d),
      puedeEditar: puedeEditarCarga_(u, d),
      catalogo: catalogoVisible_(catalogo.docentes, u, d), columnasCatalogo: catalogo.columnas,
      unidades: unidades, cargas: cargasVisibles_(cargas, u, d),
      planes: planes.map(function (p) { return { sig: p.sig, estado: p.estado, version: p.version }; }),
      avisos: (catalogo.avisos || []).concat(avisosDeCarga_(d, planes, metas[metas.length - 1] || null, vig.sinSeccion)),
      bloqueo: b ? datosBloqueo_(b) : null
    };
  });
}

/* Toma el bloqueo de la carga. Si la edita otra cuenta, falla con BLOQUEADO. */
function abrirEdicionCarga(ciclo, dpto, versionConocida) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(u, d);
    return conCandado_(function () {
      const r = tomarBloqueo_(c, Dominio.REF.carga(d), u.correo);
      if (!r.ok) falloBloqueado_("La carga de " + d, r.bloqueo);
      const v = vigente_(filaCarga_(c, d));
      const res = { version: v.version, expira: r.expira, recuperacion: leerRecuperacion_(c, Dominio.REF.carga(d), u.correo) };
      if (versionConocida == null || parseInt(versionConocida, 10) !== v.version)
        res.asignaciones = v.version ? contenidoCarga_(c, d, v.version, v.filaVersion) : [];
      return res;
    });
  });
}

function renovarBloqueoCarga(ciclo, dpto) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(u, d);
    return renovarBloqueo_(c, Dominio.REF.carga(d), u.correo);
  });
}

function liberarBloqueoCarga(ciclo, dpto) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    return soltarBloqueo_(c, Dominio.REF.carga(d), u.correo);
  });
}

/* Quita de la carga las asignaciones de secciones que hoy piden docente a otro
   departamento cuando ese departamento ya tiene las suyas: ya no le corresponden. */
function depurarCarga_(dpto, asignaciones, unidades, cargas) {
  const idx = Dominio.indiceUnidades(unidades);
  return asignaciones.filter(function (a) {
    const u = Dominio.unidadDe(idx, a);
    if (!u || u.dpto === dpto) return true;
    return !(cargas[u.dpto] || []).some(function (x) { const v = Dominio.unidadDe(idx, x); return v && v.id === u.id; });
  });
}

function guardarCarga(ciclo, dpto, datos) {
  return responder_(function () { return guardarCarga_(ciclo, dpto, datos); });
}

/* datos: {asignaciones, versionBase, tipo («guardar» o «autoguardado»), motivo,
   motivoExceso, forzar}. Nadie puede pasar de 40 h lectivas (A07): si un docente lo
   haría, no se guarda. Un docente con cargo que pase de 24 h exige motivoExceso. */
function guardarCarga_(ciclo, dpto, datos) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
  exigirCarga_(u, d);
  if (!datos) fallo_("DATO_INVALIDO", "No llegó la carga que se quería guardar.");
  const recibidas = Dominio.sanearAsignaciones(datos.asignaciones);
  const T = Dominio.TIPO_VERSION;
  const tipo = datos.tipo === T.AUTOGUARDADO || T.esRestauracion(datos.tipo) ? datos.tipo : T.GUARDAR_CARGA;

  return conCandado_(function () {
    const b = bloqueoDe_(c, Dominio.REF.carga(d));
    if (b && b.correo !== u.correo)
      fallo_("BLOQUEADO", "La carga de " + d + " la está editando " + b.correo + ", así que no se guardó.");
    const fila = filaCarga_(c, d);
    const vigente = vigente_(fila).version;
    if (!datos.forzar && vigente > (parseInt(datos.versionBase, 10) || 0)) {
      const ultima = metaVersionesCarga_(c, d, vigente).filter(function (v) { return v.n === vigente; })[0];
      fallo_("CONFLICTO", "Mientras editabas se guardó la versión v" + vigente + " de la carga.",
             ultima ? { n: ultima.n, tipo: ultima.tipo, usuario: ultima.usuario, fecha: ultima.fecha } : { n: vigente });
    }

    const planes = planesDelCiclo_(c);
    const unidades = Dominio.unidadesDelCiclo(planes);
    const cargas = soloAsignaciones_(cargasVigentes_(c));
    const asignaciones = depurarCarga_(d, recibidas, unidades, cargas);
    const catalogo = leerCatalogoDocentes_(false).docentes;
    const nuevas = Object.assign({}, cargas);
    nuevas[d] = asignaciones;
    const exc = Dominio.excesosAlGuardar(Dominio.calcularBalance(catalogo, unidades, cargas), Dominio.calcularBalance(catalogo, unidades, nuevas));
    if (exc.bloqueos.length)
      fallo_("EXCESO_HORAS", "No se guardó: " + exc.bloqueos.map(function (x) { return x.docente + " (" + x.horas + " h)"; }).join(", ") +
                      (exc.bloqueos.length === 1 ? " superaría" : " superarían") + " las " + Dominio.LIMITES.MAXIMO + " h lectivas semanales (A07).");
    const motivoExceso = String(datos.motivoExceso || "").trim().slice(0, 300);
    if (exc.severos.length && !motivoExceso)
      fallo_("FALTA_MOTIVO", "Falta el motivo: " + exc.severos.map(function (x) { return x.docente + " (" + x.horas + " h)"; }).join(", ") +
                      " tiene cargo administrativo y pasaría de " + Dominio.LIMITES.CARGO_SEVERO + " h (A12).");

    const fecha = new Date().toISOString();
    const motivo = [String(datos.motivo || "").trim().slice(0, 300), motivoExceso ? "Exceso de carga con cargo: " + motivoExceso : ""].filter(Boolean).join(" · ");
    const vistos = {};
    planes.forEach(function (p) { if (p.version) vistos[p.sig] = p.version; });
    const n = registrarVersionCarga_(c, d, fila, { tipo: tipo, usuario: u.correo, fecha: fecha, motivo: motivo.slice(0, 500), planes: vistos, asignaciones: asignaciones });
    borrarRecuperacion_(c, Dominio.REF.carga(d), u.correo);
    const r = b ? tomarBloqueo_(c, Dominio.REF.carga(d), u.correo) : null;
    return { version: n, fecha: fecha, asignaciones: asignaciones, expira: r && r.ok ? r.expira : null };
  });
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
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    const lista = contenidoCarga_(c, d, parseInt(n, 10), 0);
    return puedeEditarCarga_(u, d) ? lista : lista.map(sinDni_);
  });
}

/* Restaurar no borra el historial: crea una versión nueva con el contenido recuperado,
   con las mismas reglas de un guardado. */
function restaurarCarga(ciclo, dpto, n) {
  return responder_(function () {
    const u = exigirUsuario_();
    const c = validarCiclo_(ciclo), d = validarDpto_(dpto);
    exigirCarga_(u, d);
    const k = parseInt(n, 10);
    const vigente = vigente_(filaCarga_(c, d)).version;
    if (!(k >= 1 && k <= vigente)) fallo_("NO_ENCONTRADO", "La versión v" + n + " no existe.");
    const asignaciones = contenidoCarga_(c, d, k, 0);
    return guardarCarga_(c, d, { asignaciones: asignaciones, versionBase: vigente, tipo: Dominio.TIPO_VERSION.restauracion(k), motivoExceso: Dominio.TIPO_VERSION.restauracion(k) });
  });
}
