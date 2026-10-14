/* Planes de ciclo en el libro (P110, P111). El contenido vigente de cada carrera es su
   hoja: cada guardado la escribe, añade una versión a _SYS_VERSIONES con el contenido
   completo del plan y actualiza General y las hojas por departamento. La fila del plan en
   _SYS_PLANES_ESTADO guarda su estado, su versión vigente, sus totales, en qué fila de
   _SYS_VERSIONES está esa versión, el bloqueo y si la hoja tiene cambios que todavía no
   son una versión. Lo editado a mano en la hoja se interpreta al momento (Edicion.js) y se
   versiona con consolidarHoja() («Sincronizar y versionar hoja actual»), con
   terminarEdicionHoja() o con el autoguardado al vencer el bloqueo (P111, P138). El
   contenido de una versión nunca cambia: también se guarda en la caché. */

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

/* Debe llamarse dentro de conCandado_. Añade la versión, actualiza la fila del plan (la
   hoja ya no tiene cambios sin versionar) y la anota en la bitácora. */
function registrarVersion_(ciclo, sig, datos) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  const n = (fila ? parseInt(fila.version, 10) || 0 : 0) + 1;
  const asignaturas = sinTransitorios(datos.asignaturas);
  const texto = JSON.stringify(asignaturas);
  const filaVersion = agregarFila_("_SYS_VERSIONES",
    [ciclo, sig, n, datos.estado, datos.tipo, datos.usuario, datos.fecha, datos.motivo || ""].concat(trocear_(texto)));
  actualizarPlan_(ciclo, sig, fila, {
    estado: datos.estado, version: n, actualizado_por: datos.usuario, actualizado_en: datos.fecha,
    totales: JSON.stringify(Dominio.totales(asignaturas)), fila_version: filaVersion,
    hoja_cambiada_en: "", hoja_cambiada_por: ""
  });
  cachearTexto_(claveVersion_(ciclo, sig, n), texto);
  anotarBitacora_(datos.usuario, ciclo, sig, datos.tipo, n, datos.detalle || datos.motivo || "");
  return n;
}

/* Debe llamarse dentro de conCandado_. La hoja tiene cambios que todavía no son una versión. */
function marcarHojaCambiada_(ciclo, sig, correo) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  if (fila && fila.hoja_cambiada_en) return;
  actualizarPlan_(ciclo, sig, fila, { hoja_cambiada_en: new Date().toISOString(), hoja_cambiada_por: correo || "" });
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

/* El contenido de la versión vigente de una carrera ([] si no tiene). */
function contenidoVigente_(ciclo, sig) {
  const p = estadoDePlan_(buscarPlan_(leerPlanes_(), ciclo, sig));
  return p.version ? contenidoVersion_(ciclo, sig, p.version, p.filaVersion) : [];
}

function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

function horaCorta_(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso || "") : Utilities.formatDate(d, Session.getScriptTimeZone(), "HH:mm");
}

/* ============================================================
   Lo editado a mano en las hojas
   ============================================================ */

/* ¿Tiene la hoja cambios que no son una versión? Los aceptados al editar (la marca del
   plan) y los que todavía no se procesaron (filas editadas o vaciadas). */
function cambiosSinVersionar_(fila, lectura) {
  return !!(fila && fila.hoja_cambiada_en) || !!(lectura && (lectura.editadas || lectura.vaciadas.length));
}

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

/* Carreras del ciclo cuyo bloqueo tiene otra persona (P139). */
function ocupacion_(ciclo, correo) {
  const ocupadas = {};
  leerPlanes_().forEach(function (p) {
    if (p.ciclo !== ciclo) return;
    const b = bloqueoDeFila_(p);
    if (vigente_(b) && b.correo !== correo) ocupadas[p.carrera] = b;
  });
  return { ocupadas: ocupadas, libre: function (sig) { return !ocupadas[sig]; } };
}

function notaEspera_(carreras, ocupadas) {
  return carreras.map(function (s) {
    const b = ocupadas && ocupadas[s];
    return s + (b ? " la edita " + b.correo + " desde las " + horaCorta_(b.desde) : " está en edición");
  }).join("; ") + ": la fusión se crea al sincronizar esta hoja cuando se libere.";
}

/* Interpreta lo editado a mano en las hojas de «carreras»: las anotaciones de fusión
   nuevas (P118) y los cambios de DOCENTE, con sus reglas (P122). Una fusión que alcanza
   una carrera que edita otra persona espera (P139): su anotación no se da por aceptada y
   queda con una nota. opciones: { libre, ocupadas } de ocupacion_() y «reintentar», para
   volver a probar las fusiones que esperaban (al sincronizar). Modifica lectura.planes y
   el catálogo (altas «por completar»). Devuelve las carreras cuyas hojas cambian: las
   editadas y las que una fusión nueva alcanza. */
function conciliar_(lectura, carreras, catalogo, usuario, opciones) {
  const C = dominioCarga_();
  const op = opciones || {};
  const obs = [];
  carreras.forEach(function (sig) {
    const l = lectura.lecturas[sig];
    if (l) l.obsCambiadas.forEach(function (a) { if (op.reintentar || !a.esperaFusion) obs.push(a); });
  });
  const fus = obs.length
    ? Dominio.fusionesDesdeObservaciones(lectura.planes, { solo: function (a) { return obs.indexOf(a) >= 0; }, libre: op.libre })
    : { secciones: [], avisos: [], enEspera: [] };
  const esperan = [];
  fus.enEspera.forEach(function (e) {
    e.anotaciones.forEach(function (r) {
      const a = lectura.planes[r.sig][r.ci];
      if (obs.indexOf(a) < 0 || esperan.indexOf(a) >= 0) return;
      a.esperaFusion = { texto: a.obs, nota: notaEspera_(e.carreras, op.ocupadas) };
      esperan.push(a);
    });
  });
  obs.forEach(function (a) { if (esperan.indexOf(a) < 0) delete a.esperaFusion; });
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
    tocadas: tocadas, fusiones: fus.secciones,
    esperas: esperan.map(function (a) { return { codigo: a.codigo, nombre: a.nombre, nota: a.esperaFusion.nota }; }),
    aceptados: doc.aceptados, rechazados: doc.rechazados, altas: doc.altas, avisos: fus.avisos.concat(doc.avisos)
  };
}

/* Grupos de la versión vigente, por identificador. */
function idsDeVersion_(ciclo, sig) {
  const ids = [];
  contenidoVigente_(ciclo, sig).forEach(function (a) { a.grupos.forEach(function (g) { ids.push(g.id); }); });
  return ids;
}

/* Grupos eliminados a mano en la hoja de «sig» (P140, P143): los que se vaciaron (sus filas
   conservan SIS) y, con opciones.filasEliminadas, los que se fueron con su fila entera
   (según los grupos que tenía la hoja la última vez que el sistema la escribió o, si no se
   recuerdan, según la versión vigente). La eliminación siempre se acepta, como en la web
   (RN-15): si era el único grupo de su asignatura, la asignatura sale del plan; si estaba
   fusionado y su sección se queda con un solo grupo, la fusión se deshace también en las
   otras carreras (FA-022). Un subgrupo vaciado de un grupo que sigue en la hoja solo reduce
   el desdoble. Modifica lectura.planes. Devuelve los grupos eliminados (A06 marca los que
   eran el único grupo de su asignatura o estaban fusionados), las filas vaciadas que hay
   que limpiar y las otras carreras cuyo plan cambió. */
function resolverEliminados_(ciclo, sig, lectura, opciones) {
  const l = lectura.lecturas[sig];
  const res = { aceptados: [], blanquear: [], tocadas: [] };
  if (!l) return res;
  const vaciadasPorId = {};
  l.vaciadas.forEach(function (v) { (vaciadasPorId[v.sis.id] = vaciadasPorId[v.sis.id] || []).push(v); });
  const candidatos = [];
  Object.keys(vaciadasPorId).forEach(function (id) {
    vaciadasPorId[id].forEach(function (v) { res.blanquear.push(v.fila); });
    if (!l.ubicaciones[id]) candidatos.push({ id: id, vaciadas: vaciadasPorId[id] });
  });
  if (opciones && opciones.filasEliminadas) {
    const antes = leerIdsHoja_(ciclo, sig) || idsDeVersion_(ciclo, sig);
    antes.forEach(function (id) { if (!l.ubicaciones[id] && !vaciadasPorId[id]) candidatos.push({ id: id, vaciadas: null }); });
  }
  if (!candidatos.length) return res;

  /* Cada grupo eliminado con su asignatura: de los valores aceptados de sus filas vaciadas
     o, si no se tienen, de la versión vigente. */
  let version = null;
  const deVersion = function (id) {
    if (!version) version = contenidoVigente_(ciclo, sig);
    for (let i = 0; i < version.length; i++) {
      const g = version[i].grupos.filter(function (x) { return x.id === id; })[0];
      if (g) return { a: version[i], g: g };
    }
    return null;
  };
  const claveDe = function (a) { return a.codigo || a.nombre; };
  candidatos.forEach(function (c) {
    let par = null;
    if (c.vaciadas && c.vaciadas.every(function (v) { return v.sis.v; })) {
      const filas = c.vaciadas.map(function (v) {
        const valores = COLUMNAS_HOJA_.map(function () { return ""; });
        COLUMNAS_FIRMA_.forEach(function (columna, k) { valores[col_(columna)] = v.sis.v[k]; });
        valores[col_("SUBGRUPO")] = v.sis.sub || "";
        valores[col_("SIS")] = JSON.stringify(v.sis);
        return valores;
      });
      const p = planDeFilas(sig, filas);
      if (p.asignaturas.length) par = { a: p.asignaturas[0], g: p.asignaturas[0].grupos[0] };
    }
    par = par || deVersion(c.id);
    if (!par) { res.aceptados.push({ id: c.id, a06: false }); return; }
    const a = par.a, g = par.g;
    const queda = l.asignaturas.some(function (x) { return claveDe(x) === claveDe(a) && x.grupos.length; });
    res.aceptados.push({ id: g.id, codigo: a.codigo, nombre: a.nombre, grupo: g.n, fusion: g.fusion || null,
                         a06: !!g.fusion || !queda, filas: c.vaciadas ? c.vaciadas.map(function (v) { return v.fila; }) : [] });
  });

  /* Una sección que se queda con un solo grupo se deshace en las carreras que alcanzaba. */
  res.aceptados.forEach(function (x) {
    if (!x.fusion) return;
    const otras = Dominio.gruposDeFusion(lectura.planes, x.fusion).map(function (y) { return y.sig; });
    Dominio.limpiarFusionHuerfanaEnCiclo(lectura.planes, x.fusion);
    otras.forEach(function (s) { if (s !== sig && res.tocadas.indexOf(s) < 0) res.tocadas.push(s); });
  });
  return res;
}

/* Debe llamarse dentro de conCandado_. Consolida lo editado a mano en la hoja de «sig» (y en
   las que alcance una fusión nueva): resuelve los grupos eliminados, vuelve a probar las
   fusiones que esperaban, escribe las hojas enteras con lo aceptado, versiona cada plan
   cuyo contenido cambió y actualiza los reportes. opciones.tipo: el de la versión
   («autoguardado» al vencer el bloqueo). */
function consolidar_(ciclo, sig, usuario, motivo, opciones) {
  const op = opciones || {};
  const lectura = leerPlanesCiclo_(ciclo);
  if (!lectura.lecturas[sig]) throw new Error("El ciclo " + ciclo + " no tiene la hoja de " + Dominio.nombreCarrera(sig) + ". Siembra el ciclo primero.");
  const editadas = lectura.lecturas[sig].editadas;
  const catalogo = leerGeneral_(ciclo);
  const eliminados = resolverEliminados_(ciclo, sig, lectura, { filasEliminadas: true });
  const ocupacion = ocupacion_(ciclo, usuario.correo);
  const r = conciliar_(lectura, [sig], catalogo, usuario, { libre: ocupacion.libre, ocupadas: ocupacion.ocupadas, reintentar: true });
  eliminados.tocadas.forEach(function (s) { if (r.tocadas.indexOf(s) < 0) r.tocadas.push(s); });
  const fecha = new Date().toISOString();
  const versiones = {};
  r.tocadas.forEach(function (s) {
    escribirHojaCarrera_(ciclo, s, lectura.planes[s], lectura.planes);
    const fila = buscarPlan_(leerPlanes_(), ciclo, s);
    const p = estadoDePlan_(fila);
    const previo = p.version ? contenidoVersion_(ciclo, s, p.version, p.filaVersion) : [];
    if (Dominio.contenidoCanonico(previo) === Dominio.contenidoCanonico(lectura.planes[s])) {
      if (fila && fila.hoja_cambiada_en) actualizarPlan_(ciclo, s, fila, { hoja_cambiada_en: "", hoja_cambiada_por: "" });
      return;
    }
    versiones[s] = registrarVersion_(ciclo, s, {
      estado: resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR),
      tipo: s === sig ? (op.tipo || "sincronización desde la hoja") : "fusión desde " + sig,
      usuario: usuario.correo, fecha: fecha, motivo: s === sig ? String(motivo || "").slice(0, 500) : "",
      asignaturas: lectura.planes[s],
      detalle: JSON.stringify({ editadas: s === sig ? editadas : 0, aceptados: r.aceptados.length, rechazados: r.rechazados.length,
                                fusiones: r.fusiones.length, esperas: r.esperas.length, eliminados: eliminados.aceptados.length, motivo: s === sig ? motivo || "" : "" })
    });
  });
  actualizarReportes_(ciclo, lectura.planes, catalogo);
  return { lectura: lectura, versiones: versiones, editadas: editadas, conciliacion: r, eliminados: eliminados };
}

function resumenConsolidacion_(ciclo, sig, r) {
  return {
    version: r.versiones[sig] || estadoDePlan_(buscarPlan_(leerPlanes_(), ciclo, sig)).version,
    nueva: !!r.versiones[sig], editadas: r.editadas, versiones: r.versiones,
    aceptados: r.conciliacion.aceptados, rechazados: r.conciliacion.rechazados,
    fusiones: r.conciliacion.fusiones.length, esperas: r.conciliacion.esperas, altas: r.conciliacion.altas.length,
    eliminados: r.eliminados.aceptados, avisos: r.conciliacion.avisos
  };
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
   docentes, sus rechazos y su historial son los que ya están en la hoja (RNF-02), y una
   fusión anotada que espera (P139) sigue esperando si su anotación no cambió. Un grupo
   nuevo llega sin docente. */
function conservarDeHoja_(asignaturas, vigentes) {
  const porId = {}, porClave = {};
  (vigentes || []).forEach(function (a) {
    a.grupos.forEach(function (g) { porId[g.id] = g; });
    porClave[a.codigo || a.nombre] = a;
  });
  asignaturas.forEach(function (a) {
    CAMPOS_TRANSITORIOS_.forEach(function (k) { delete a[k]; });
    const v = porClave[a.codigo || a.nombre];
    if (v && v.esperaFusion && v.obs === a.obs) { a.esperaFusion = v.esperaFusion; a.obsAceptada = v.obsAceptada; }
    a.grupos.forEach(function (g) {
      const x = porId[g.id];
      g.asignacion = x ? x.asignacion || null : null;
      if (x && x.rechazos) g.rechazos = x.rechazos; else delete g.rechazos;
    });
  });
  return asignaturas;
}

/* ============================================================
   Tablero
   ============================================================ */

/* Filas del tablero de un ciclo, con el contenido de cada plan: así el navegador consulta
   un plan o empieza a editarlo sin volver a pedirlo. «editadas» cuenta las filas editadas a
   mano que todavía no se procesaron; «pendiente», si la hoja tiene cambios que todavía no
   son una versión. */
function filasTablero_(ciclo, lectura) {
  const planes = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  return Dominio.CARRERAS.map(function (car) {
    const fila = buscarPlan_(planes, ciclo, car.sig);
    const p = estadoDePlan_(fila);
    const b = bloqueoDeFila_(fila);
    const l = lectura.lecturas[car.sig];
    const contenido = l ? sinTransitorios(l.asignaturas) : [];
    return {
      sig: car.sig, nombre: car.nombre, hoja: nombreHojaCarrera(car.sig, ciclo), estado: p.estado, version: p.version,
      totales: Dominio.totales(contenido), bloqueo: vigente_(b) ? b : null, contenido: contenido, editadas: l ? l.editadas : 0,
      pendiente: cambiosSinVersionar_(fila, l)
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
  const fila = buscarPlan_(leerPlanes_(), c, s);
  const p = estadoDePlan_(fila);
  const l = leerHojaCarrera_(c, s);
  const b = bloqueoDe_(c, s);
  return {
    estado: p.estado, version: p.version, asignaturas: l ? sinTransitorios(l.asignaturas) : [],
    bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null,
    editadas: l ? l.editadas : 0, pendiente: cambiosSinVersionar_(fila, l)
  };
}

/* versionConocida: la versión que el navegador ya tiene. Si sigue siendo la vigente y la
   hoja no tiene cambios sin versionar, no se devuelve el contenido. */
function abrirEdicion(ciclo, sig, versionConocida) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const r = tomarBloqueo_(c, s, u.correo);
    if (!r.ok) return { bloqueado: { correo: r.bloqueo.correo, desde: r.bloqueo.desde, expira: r.bloqueo.expira } };
    const fila = buscarPlan_(leerPlanes_(), c, s);
    const p = estadoDePlan_(fila);
    const l = leerHojaCarrera_(c, s);
    const res = { estado: p.estado, version: p.version, expira: r.expira, editadas: l ? l.editadas : 0, pendiente: cambiosSinVersionar_(fila, l) };
    if (versionConocida == null || parseInt(versionConocida, 10) !== p.version || res.pendiente)
      res.asignaturas = l ? sinTransitorios(l.asignaturas) : [];
    return res;
  });
}

/* datos: {asignaturas, estado, tipo, motivo, versionBase, forzar}. Si se guardó otra
   versión después de versionBase, o si la hoja tiene cambios sin versionar, devuelve
   {conflicto} para que el navegador advierta; con forzar se guarda igualmente (advertir,
   no prohibir), y lo de la hoja se consolida antes como versión para que quede en el
   historial. */
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
    let fila = buscarPlan_(leerPlanes_(), c, s);
    let p = estadoDePlan_(fila);
    if (!datos.forzar && p.version > (parseInt(datos.versionBase, 10) || 0)) {
      const ultima = metaVersiones_(c, s).filter(function (v) { return v.n === p.version; })[0];
      return { conflicto: ultima ? sinFila_(ultima) : { n: p.version } };
    }
    let lectura = leerPlanesCiclo_(c);
    const l = lectura.lecturas[s];
    if (cambiosSinVersionar_(fila, l)) {
      if (!datos.forzar) {
        const editadas = l ? l.editadas : 0;
        return { conflicto: { n: p.version,
                              tipo: editadas ? (editadas === 1 ? "1 fila editada" : editadas + " filas editadas") + " a mano en la hoja"
                                             : "cambios en la hoja sin versionar",
                              usuario: fila && fila.hoja_cambiada_por || "", fecha: fila && fila.hoja_cambiada_en || "" } };
      }
      consolidar_(c, s, u, "Antes de guardar desde la web");
      lectura = leerPlanesCiclo_(c);
      fila = buscarPlan_(leerPlanes_(), c, s);
      p = estadoDePlan_(fila);
    }
    const asignaturas = conservarDeHoja_(datos.asignaturas, lectura.planes[s]);
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

/* «Sincronizar y versionar hoja actual» (P111, P138): lo editado a mano en la hoja de la
   carrera pasa por las reglas y, si el contenido cambió, queda como una versión nueva. El
   bloqueo se mantiene, como al guardar en la web. */
function consolidarHoja(ciclo, sig, motivo) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo) throw new Error("La hoja la está editando " + b.correo + ", así que no se consolidó.");
    const r = consolidar_(c, s, u, motivo);
    if (b) tomarBloqueo_(c, s, u.correo);
    return Object.assign(resumenConsolidacion_(c, s, r), { conBloqueo: !!b });
  });
}

/* «Terminar edición» (P138): consolida como consolidarHoja() y suelta el bloqueo, con lo
   que la hoja vuelve a sus Coordinadores y a los Directores. */
function terminarEdicionHoja(ciclo, sig, motivo) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo) throw new Error("La hoja la está editando " + b.correo + ", así que no se terminó su edición.");
    const r = consolidar_(c, s, u, motivo);
    const liberado = soltarBloqueo_(c, s, u.correo);
    return Object.assign(resumenConsolidacion_(c, s, r), { liberado: liberado });
  });
}
