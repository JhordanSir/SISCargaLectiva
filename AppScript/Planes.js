/* Planes de ciclo en el libro (P110, P111). El contenido vigente de cada carrera es su
   hoja: cada guardado la escribe, añade una versión a _SYS_VERSIONES con el contenido
   completo del plan y actualiza General y las hojas por departamento. La fila del plan en
   _SYS_PLANES_ESTADO guarda su estado, su versión vigente, sus totales, en qué fila de
   _SYS_VERSIONES está esa versión y el bloqueo. Lo editado a mano en la hoja se interpreta
   al leerla y se consolida como versión con consolidarHoja() («Sincronizar y versionar
   hoja actual»). El contenido de una versión nunca cambia: también se guarda en la caché. */

var TIPOS_GUARDADO_ = ["guardar borrador", "registrar", "guardar cambios", "autoguardado"];
var SEGUNDOS_CACHE_VERSION_ = 21600;   // el máximo que admite CacheService
var MAX_TEXTO_CACHE_ = 45000;          // holgura frente al límite de 100 KB por valor

function leerPlanes_() {
  return leerTabla_("_SYS_PLANES_ESTADO");
}

function buscarPlan_(planes, ciclo, sig) {
  return planes.filter(function (p) { return p.ciclo === ciclo && p.carrera === sig; })[0] || null;
}

/* Escribe la fila del plan con los cambios; si no existe, la crea en Sin Iniciar. */
function actualizarPlan_(ciclo, sig, fila, cambios) {
  const campos = TABLAS_._SYS_PLANES_ESTADO;
  const base = fila || { ciclo: ciclo, carrera: sig, estado: Dominio.ESTADOS.SIN, version: "0" };
  const nuevo = Object.assign({}, base, cambios);
  const valores = campos.map(function (c) { return nuevo[c] == null ? "" : String(nuevo[c]); });
  if (fila) escribirFila_("_SYS_PLANES_ESTADO", fila._fila, valores);
  else nuevo._fila = agregarFila_("_SYS_PLANES_ESTADO", valores);
  return nuevo;
}

function estadoDePlan_(fila) {
  return {
    estado: fila && fila.estado ? fila.estado : Dominio.ESTADOS.SIN,
    version: fila ? parseInt(fila.version, 10) || 0 : 0,
    filaVersion: fila ? parseInt(fila.fila_version, 10) || 0 : 0
  };
}

/* Un plan Registrado nunca vuelve a Borrador. */
function resolverEstado_(actual, pedido) {
  if (actual === Dominio.ESTADOS.REGISTRADO) return Dominio.ESTADOS.REGISTRADO;
  return pedido === Dominio.ESTADOS.REGISTRADO ? Dominio.ESTADOS.REGISTRADO : Dominio.ESTADOS.BORRADOR;
}

function claveVersion_(ciclo, sig, n) {
  return claveCache_("v", ciclo + "|" + sig + "|" + n);
}

function cachearTexto_(clave, texto) {
  if (texto.length > MAX_TEXTO_CACHE_) return;
  try {
    cache_().put(clave, texto, SEGUNDOS_CACHE_VERSION_);
  } catch (e) {
    /* No cabe: se leerá del libro. */
  }
}

/* Debe llamarse dentro de conCandado_. Añade la versión, actualiza la fila del plan y la
   anota en la bitácora. */
function registrarVersion_(ciclo, sig, datos) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  const n = (fila ? parseInt(fila.version, 10) || 0 : 0) + 1;
  const texto = JSON.stringify(datos.asignaturas);
  const filaVersion = agregarFila_("_SYS_VERSIONES",
    [ciclo, sig, n, datos.estado, datos.tipo, datos.usuario, datos.fecha, datos.motivo || ""].concat(trocear_(texto)));
  actualizarPlan_(ciclo, sig, fila, {
    estado: datos.estado, version: n, actualizado_por: datos.usuario, actualizado_en: datos.fecha,
    totales: JSON.stringify(Dominio.totales(datos.asignaturas)), fila_version: filaVersion
  });
  cachearTexto_(claveVersion_(ciclo, sig, n), texto);
  anotarBitacora_(datos.usuario, ciclo, sig, datos.tipo, n, datos.detalle || datos.motivo || "");
  return n;
}

function metaVersiones_(ciclo, sig) {
  return leerTabla_("_SYS_VERSIONES", 8)
    .filter(function (v) { return v.ciclo === ciclo && v.carrera === sig; })
    .map(function (v) {
      return { n: parseInt(v.n, 10), estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo, _fila: v._fila };
    })
    .sort(function (a, b) { return a.n - b.n; });
}

function unirContenido_(valores) {
  return valores.slice(TABLAS_._SYS_VERSIONES.indexOf("contenido"))
    .map(function (c) { return c == null ? "" : String(c); }).join("");
}

function esLaVersion_(valores, ciclo, sig, n) {
  return String(valores[0]) === ciclo && String(valores[1]) === sig && parseInt(valores[2], 10) === n;
}

/* Texto JSON de una versión. filaVersion evita recorrer _SYS_VERSIONES; si no coincide
   (o no se conoce), se busca la fila. */
function textoDeVersion_(ciclo, sig, n, filaVersion) {
  const h = hojaSys_("_SYS_VERSIONES");
  const ancho = Math.max(TABLAS_._SYS_VERSIONES.length, h.getLastColumn());
  if (filaVersion > 1 && filaVersion <= h.getLastRow()) {
    const valores = h.getRange(filaVersion, 1, 1, ancho).getValues()[0];
    if (esLaVersion_(valores, ciclo, sig, n)) return unirContenido_(valores);
  }
  const v = metaVersiones_(ciclo, sig).filter(function (x) { return x.n === n; })[0];
  if (!v) throw new Error("No se encontró la versión v" + n + " del plan.");
  return unirContenido_(h.getRange(v._fila, 1, 1, ancho).getValues()[0]);
}

function contenidoVersion_(ciclo, sig, n, filaVersion) {
  const clave = claveVersion_(ciclo, sig, n);
  const guardado = cache_().get(clave);
  if (guardado != null) return JSON.parse(guardado);
  const texto = textoDeVersion_(ciclo, sig, n, filaVersion || 0);
  cachearTexto_(clave, texto);
  return JSON.parse(texto || "[]");
}

function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

/* ============================================================
   Lo editado a mano en las hojas
   ============================================================ */

function avisosDeLectura_(ciclo, lectura) {
  const avisos = [];
  Object.keys(lectura.lecturas).forEach(function (sig) {
    const l = lectura.lecturas[sig];
    if (!l) return;
    const hoja = "Hoja «" + nombreHojaCarrera(sig, ciclo) + "»: ";
    l.avisos.forEach(function (a) { avisos.push(hoja + a); });
    if (l.editadas)
      avisos.push(hoja + (l.editadas === 1 ? "1 fila editada" : l.editadas + " filas editadas") +
                  " a mano sin consolidar. Se versionan con «Sincronizar y versionar hoja actual».");
  });
  return avisos;
}

/* Interpreta lo editado a mano en las hojas de «carreras»: las anotaciones de fusión
   nuevas (P118) y los cambios de DOCENTE, con sus reglas (P122). Modifica lectura.planes y
   el catálogo (altas «por completar»). Devuelve las carreras cuyas hojas cambian: las
   editadas y las que una fusión nueva alcanza. */
function conciliar_(lectura, carreras, catalogo, usuario) {
  const C = dominioCarga_();
  const obs = [];
  carreras.forEach(function (sig) {
    const l = lectura.lecturas[sig];
    if (l) l.obsCambiadas.forEach(function (a) { obs.push(a); });
  });
  const fus = obs.length
    ? Dominio.fusionesDesdeObservaciones(lectura.planes, { solo: function (a) { return obs.indexOf(a) >= 0; } })
    : { secciones: [], avisos: [] };
  const tocadas = carreras.slice();
  fus.secciones.forEach(function (s) {
    s.miembros.forEach(function (m) { if (tocadas.indexOf(m.sig) < 0) tocadas.push(m.sig); });
  });
  const cambios = [];
  tocadas.forEach(function (sig) {
    const l = lectura.lecturas[sig];
    if (l) l.cambiosDocente.forEach(function (cb) { cambios.push(cb); });
  });
  const doc = C.aplicarCambiosDocente(lectura.planes, cambios, catalogo, usuario, config_().reglas);
  return {
    tocadas: tocadas, fusiones: fus.secciones, aceptados: doc.aceptados, rechazados: doc.rechazados, altas: doc.altas,
    avisos: fus.avisos.concat(doc.avisos)
  };
}

/* Debe llamarse dentro de conCandado_. Consolida lo editado a mano en la hoja de «sig» (y en
   las que alcance una fusión nueva): escribe las hojas con lo aceptado, versiona cada plan
   cuyo contenido cambió y actualiza los reportes. */
function consolidar_(ciclo, sig, usuario, motivo) {
  const lectura = leerPlanesCiclo_(ciclo);
  if (!lectura.lecturas[sig]) throw new Error("El ciclo " + ciclo + " no tiene la hoja de " + Dominio.nombreCarrera(sig) + ". Siembra el ciclo primero.");
  const editadas = lectura.lecturas[sig].editadas;
  const catalogo = leerGeneral_(ciclo);
  const r = conciliar_(lectura, [sig], catalogo, usuario);
  const fecha = new Date().toISOString();
  const versiones = {};
  r.tocadas.forEach(function (s) {
    escribirHojaCarrera_(ciclo, s, lectura.planes[s], lectura.planes);
    const fila = buscarPlan_(leerPlanes_(), ciclo, s);
    const p = estadoDePlan_(fila);
    const previo = p.version ? contenidoVersion_(ciclo, s, p.version, p.filaVersion) : [];
    if (Dominio.contenidoCanonico(previo) === Dominio.contenidoCanonico(lectura.planes[s])) return;
    versiones[s] = registrarVersion_(ciclo, s, {
      estado: resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR),
      tipo: s === sig ? "sincronización desde la hoja" : "fusión desde " + sig,
      usuario: usuario.correo, fecha: fecha, motivo: s === sig ? String(motivo || "").slice(0, 500) : "",
      asignaturas: lectura.planes[s],
      detalle: JSON.stringify({ editadas: s === sig ? editadas : 0, aceptados: r.aceptados.length, rechazados: r.rechazados.length,
                                fusiones: r.fusiones.length, motivo: s === sig ? motivo || "" : "" })
    });
  });
  actualizarReportes_(ciclo, lectura.planes, catalogo);
  return { lectura: lectura, versiones: versiones, editadas: editadas, conciliacion: r };
}

/* Vuelve a aplicar, con las reglas de hoy, los docentes de un contenido que se restaura:
   lo que A07, A08 o A11 impedirían queda pendiente, con nota (P122). */
function reaplicarDocentes_(planes, sig, asignaturas, catalogo) {
  const C = dominioCarga_();
  const guardadas = [];
  asignaturas.forEach(function (a) { a.grupos.forEach(function (g) { guardadas.push([g, g.asignacion]); g.asignacion = null; }); });
  planes[sig] = asignaturas;
  const rechazados = [];
  guardadas.forEach(function (x) {
    const g = x[0], asig = x[1];
    if (!asig) return;
    const ci = asignaturas.findIndex(function (a) { return a.grupos.indexOf(g) >= 0; });
    const ref = { sig: sig, ci: ci, gi: asignaturas[ci].grupos.indexOf(g) };
    const r = C.asignar(planes, ref, asig, catalogo, config_().reglas);
    if (r.ok) return;
    g.rechazos = (g.rechazos || []).concat([{ componentes: Object.keys(asig), texto: dominioCarga_().escribirCeldaDocente({ ht: g.ht, hp: g.hp, desdoble: g.desdoble, asignacion: asig }),
                                              codigo: r.bloqueos[0].codigo, motivo: r.bloqueos[0].mensaje }]);
    rechazados.push({ codigo: asignaturas[ci].codigo, grupo: g.n, regla: r.bloqueos[0].codigo, motivo: r.bloqueos[0].mensaje });
  });
  return rechazados;
}

/* El plan que manda el navegador solo cambia la oferta (CU-001): las asignaciones de
   docentes, sus rechazos y su historial son los que ya están en la hoja (RNF-02). Un grupo
   nuevo llega sin docente. */
function conservarDocentes_(asignaturas, vigentes) {
  const porId = {};
  (vigentes || []).forEach(function (a) { a.grupos.forEach(function (g) { porId[g.id] = g; }); });
  asignaturas.forEach(function (a) {
    a.grupos.forEach(function (g) {
      const v = porId[g.id];
      g.asignacion = v ? v.asignacion || null : null;
      if (v && v.rechazos) g.rechazos = v.rechazos; else delete g.rechazos;
    });
  });
  return asignaturas;
}

/* ============================================================
   Tablero
   ============================================================ */

/* Filas del tablero de un ciclo, con el contenido de cada plan: así el navegador consulta
   un plan o empieza a editarlo sin volver a pedirlo. «editadas» cuenta las filas editadas a
   mano que todavía no se consolidaron. */
function filasTablero_(ciclo, lectura) {
  const planes = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  return Dominio.CARRERAS.map(function (car) {
    const fila = buscarPlan_(planes, ciclo, car.sig);
    const p = estadoDePlan_(fila);
    const b = bloqueoDeFila_(fila);
    const l = lectura.lecturas[car.sig];
    const contenido = l ? l.asignaturas : [];
    return {
      sig: car.sig, nombre: car.nombre, hoja: nombreHojaCarrera(car.sig, ciclo), estado: p.estado, version: p.version,
      totales: Dominio.totales(contenido), bloqueo: vigente_(b) ? b : null, contenido: contenido, editadas: l ? l.editadas : 0
    };
  });
}

/* ============================================================
   Funciones que llama el navegador (google.script.run)
   ============================================================ */

/* El tablero se lee de las hojas cada vez: lo editado a mano se ve enseguida. */
function obtenerTablero(ciclo) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const lectura = leerPlanesCiclo_(c);
  return { avisos: avisosDeLectura_(c, lectura), filas: filasTablero_(c, lectura) };
}

function obtenerPlan(ciclo, sig) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
  const l = leerHojaCarrera_(c, s);
  const b = bloqueoDe_(c, s);
  return {
    estado: p.estado, version: p.version, asignaturas: l ? l.asignaturas : [],
    bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null,
    editadas: l ? l.editadas : 0
  };
}

/* versionConocida: la versión que el navegador ya tiene. Si sigue siendo la vigente y la
   hoja no se editó a mano, no se devuelve el contenido. */
function abrirEdicion(ciclo, sig, versionConocida) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const r = tomarBloqueo_(c, s, u.correo);
    if (!r.ok) return { bloqueado: { correo: r.bloqueo.correo, desde: r.bloqueo.desde, expira: r.bloqueo.expira } };
    const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    const l = leerHojaCarrera_(c, s);
    const res = { estado: p.estado, version: p.version, expira: r.expira, editadas: l ? l.editadas : 0 };
    if (versionConocida == null || parseInt(versionConocida, 10) !== p.version || res.editadas)
      res.asignaturas = l ? l.asignaturas : [];
    return res;
  });
}

/* datos: {asignaturas, estado, tipo, motivo, versionBase, forzar}. Si se guardó otra
   versión después de versionBase, o si la hoja se editó a mano, devuelve {conflicto} para
   que el navegador advierta; con forzar se guarda igualmente (advertir, no prohibir), y lo
   editado a mano se consolida antes como versión para que quede en el historial. */
function guardarPlan(ciclo, sig, datos) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  if (!datos || TIPOS_GUARDADO_.indexOf(datos.tipo) < 0) throw new Error("Tipo de guardado desconocido.");
  if (!Array.isArray(datos.asignaturas)) throw new Error("El plan recibido no tiene la lista de asignaturas.");

  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo)
      throw new Error("El plan lo está editando " + b.correo + ", así que no se guardó. Vuelve a abrirlo cuando termine.");
    let p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    if (!datos.forzar && p.version > (parseInt(datos.versionBase, 10) || 0)) {
      const ultima = metaVersiones_(c, s).filter(function (v) { return v.n === p.version; })[0];
      return { conflicto: ultima ? sinFila_(ultima) : { n: p.version } };
    }
    let lectura = leerPlanesCiclo_(c);
    const editadas = lectura.lecturas[s] ? lectura.lecturas[s].editadas : 0;
    if (editadas) {
      if (!datos.forzar)
        return { conflicto: { n: p.version, tipo: (editadas === 1 ? "1 fila editada" : editadas + " filas editadas") + " a mano en la hoja", usuario: "", fecha: "" } };
      consolidar_(c, s, u, "Antes de guardar desde la web");
      lectura = leerPlanesCiclo_(c);
      p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    }
    const asignaturas = conservarDocentes_(datos.asignaturas, lectura.planes[s]);
    lectura.planes[s] = asignaturas;
    const estado = resolverEstado_(p.estado, datos.estado);
    const fecha = new Date().toISOString();
    escribirHojaCarrera_(c, s, asignaturas, lectura.planes);
    const n = registrarVersion_(c, s, {
      estado: estado, tipo: datos.tipo, usuario: u.correo, fecha: fecha,
      motivo: String(datos.motivo || "").slice(0, 500), asignaturas: asignaturas
    });
    actualizarReportes_(c, lectura.planes, leerGeneral_(c));
    const r = b ? tomarBloqueo_(c, s, u.correo) : null;
    return { version: n, estado: estado, fecha: fecha, expira: r && r.ok ? r.expira : null };
  });
}

function obtenerHistorial(ciclo, sig) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  return metaVersiones_(c, s).map(sinFila_);
}

/* Restaurar no borra el historial: crea una versión nueva con el contenido recuperado. Los
   docentes de ese contenido pasan otra vez por las reglas (P122). */
function restaurarVersion(ciclo, sig, n) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  const k = parseInt(n, 10);

  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo) throw new Error("El plan lo está editando " + b.correo + ", así que no se restauró.");
    const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    if (!(k >= 1 && k <= p.version)) throw new Error("La versión v" + n + " no existe.");
    const lectura = leerPlanesCiclo_(c);
    const catalogo = leerGeneral_(c);
    const asignaturas = contenidoVersion_(c, s, k, 0);
    const rechazados = reaplicarDocentes_(lectura.planes, s, asignaturas, catalogo);
    const estado = resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR);
    escribirHojaCarrera_(c, s, asignaturas, lectura.planes);
    const version = registrarVersion_(c, s, {
      estado: estado, tipo: "restauración de v" + k, usuario: u.correo, fecha: new Date().toISOString(), motivo: "",
      asignaturas: asignaturas, detalle: rechazados.length ? JSON.stringify({ rechazados: rechazados }) : ""
    });
    actualizarReportes_(c, lectura.planes, catalogo);
    const r = b ? tomarBloqueo_(c, s, u.correo) : null;
    return { version: version, estado: estado, asignaturas: asignaturas, rechazados: rechazados, expira: r && r.ok ? r.expira : null };
  });
}

/* «Sincronizar y versionar hoja actual» (P111): lo editado a mano en la hoja de la carrera
   pasa por las reglas y, si el contenido cambió, queda como una versión nueva. */
function consolidarHoja(ciclo, sig, motivo) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo) throw new Error("La hoja la está editando " + b.correo + ", así que no se consolidó.");
    const r = consolidar_(c, s, u, motivo);
    return {
      version: r.versiones[s] || estadoDePlan_(buscarPlan_(leerPlanes_(), c, s)).version,
      nueva: !!r.versiones[s], editadas: r.editadas, versiones: r.versiones,
      aceptados: r.conciliacion.aceptados, rechazados: r.conciliacion.rechazados,
      fusiones: r.conciliacion.fusiones.length, altas: r.conciliacion.altas.length, avisos: r.conciliacion.avisos
    };
  });
}
