/* Planes de ciclo: tablero, consulta, edición, guardado con versiones e historial.
   Cada guardado añade una fila a Versiones con el contenido completo del plan. La fila
   del plan en Planes guarda su estado, su versión vigente, sus totales y en qué fila de
   Versiones está esa versión. El contenido de una versión nunca cambia, así que también
   se guarda en la caché del script y casi nunca hace falta leerlo de la hoja. */

var TIPOS_GUARDADO_ = ["guardar borrador", "registrar", "guardar cambios", "autoguardado"];
var SEGUNDOS_CACHE_VERSION_ = 21600;   // el máximo que admite CacheService
var MAX_TEXTO_CACHE_ = 45000;          // holgura frente al límite de 100 KB por valor

function leerPlanes_() {
  return leerTabla_("Planes");
}

function buscarPlan_(planes, ciclo, sig) {
  return planes.filter(function (p) { return p.ciclo === ciclo && p.carrera === sig; })[0] || null;
}

function estadoDePlan_(fila) {
  return {
    estado: fila && fila.estado ? fila.estado : Dominio.ESTADOS.SIN,
    version: fila ? parseInt(fila.version, 10) || 0 : 0,
    totales: fila && fila.totales ? JSON.parse(fila.totales) : null,
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
    /* No cabe: se leerá de la hoja. */
  }
}

/* Debe llamarse dentro de conCandado_. Añade la versión y actualiza la fila del plan. */
function registrarVersion_(ciclo, sig, fila, datos) {
  const n = (fila ? parseInt(fila.version, 10) || 0 : 0) + 1;
  const texto = JSON.stringify(datos.asignaturas);
  const filaVersion = agregarFila_("Versiones",
    [ciclo, sig, n, datos.estado, datos.tipo, datos.usuario, datos.fecha, datos.motivo || ""].concat(trocear_(texto)));
  const valores = [ciclo, sig, datos.estado, n, datos.usuario, datos.fecha,
    datos.firma_xlsx != null ? datos.firma_xlsx : (fila ? fila.firma_xlsx : ""),
    JSON.stringify(Dominio.totales(datos.asignaturas)), filaVersion];
  if (fila) escribirFila_("Planes", fila._fila, valores);
  else agregarFila_("Planes", valores);
  cachearTexto_(claveVersion_(ciclo, sig, n), texto);
  return n;
}

function metaVersiones_(ciclo, sig) {
  return leerTabla_("Versiones", 8)
    .filter(function (v) { return v.ciclo === ciclo && v.carrera === sig; })
    .map(function (v) {
      return { n: parseInt(v.n, 10), estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo, _fila: v._fila };
    })
    .sort(function (a, b) { return a.n - b.n; });
}

function unirContenido_(valores) {
  return valores.slice(TABLAS_.Versiones.indexOf("contenido"))
    .map(function (c) { return c == null ? "" : String(c); }).join("");
}

function esLaVersion_(valores, ciclo, sig, n) {
  return String(valores[0]) === ciclo && String(valores[1]) === sig && parseInt(valores[2], 10) === n;
}

/* Texto JSON de una versión. filaVersion evita recorrer Versiones; si no coincide
   (o no se conoce), se busca la fila. */
function textoDeVersion_(ciclo, sig, n, filaVersion) {
  const h = hojaBd_("Versiones");
  const ancho = Math.max(TABLAS_.Versiones.length, h.getLastColumn());
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

/* Contenido vigente de varios planes de un ciclo: primero de la caché y, lo que falte,
   de la hoja, en un solo bloque si sus filas están cerca (como tras leer los xlsx). */
function contenidosVigentes_(ciclo, filasPlan) {
  const res = {};
  const conVersion = filasPlan.filter(function (f) { return estadoDePlan_(f).version > 0; });
  if (!conVersion.length) return res;

  const claves = conVersion.map(function (f) { return claveVersion_(ciclo, f.carrera, estadoDePlan_(f).version); });
  const enCache = cache_().getAll(claves);
  const faltan = [];
  conVersion.forEach(function (f, i) {
    if (enCache[claves[i]] != null) res[f.carrera] = JSON.parse(enCache[claves[i]]);
    else faltan.push(f);
  });
  if (!faltan.length) return res;

  const h = hojaBd_("Versiones");
  const ancho = Math.max(TABLAS_.Versiones.length, h.getLastColumn());
  const ultima = h.getLastRow();
  const filas = faltan.map(function (f) { return estadoDePlan_(f).filaVersion; }).filter(function (n) { return n > 1 && n <= ultima; });
  let bloque = null, desde = 0;
  if (filas.length) {
    desde = Math.min.apply(null, filas);
    const alto = Math.max.apply(null, filas) - desde + 1;
    if (alto <= Math.max(10, filas.length * 3)) bloque = h.getRange(desde, 1, alto, ancho).getValues();
  }
  faltan.forEach(function (f) {
    const p = estadoDePlan_(f);
    const valores = bloque && p.filaVersion >= desde && p.filaVersion - desde < bloque.length ? bloque[p.filaVersion - desde] : null;
    const texto = valores && esLaVersion_(valores, ciclo, f.carrera, p.version)
      ? unirContenido_(valores)
      : textoDeVersion_(ciclo, f.carrera, p.version, p.filaVersion);
    cachearTexto_(claveVersion_(ciclo, f.carrera, p.version), texto);
    res[f.carrera] = JSON.parse(texto || "[]");
  });
  return res;
}

/* Filas del tablero de un ciclo, con el contenido vigente de cada plan: así el navegador
   consulta un plan o empieza a editarlo sin volver a pedirlo. */
function leerTablero_(ciclo) {
  const planes = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  const bloqueos = bloqueosVigentes_();
  const contenidos = contenidosVigentes_(ciclo, planes);
  return Dominio.CARRERAS.map(function (car) {
    const p = estadoDePlan_(buscarPlan_(planes, ciclo, car.sig));
    const b = bloqueos.filter(function (x) { return x.ciclo === ciclo && x.carrera === car.sig; })[0];
    return {
      sig: car.sig, nombre: car.nombre, estado: p.estado, version: p.version, totales: p.totales,
      bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null,
      contenido: contenidos[car.sig] || []
    };
  });
}

function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

/* ============================================================
   Funciones que llama el navegador (google.script.run)
   ============================================================ */

/* opciones.releer: mira los xlsx de Drive ahora, sin esperar al siguiente intervalo. */
function obtenerTablero(ciclo, opciones) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const avisos = sincronizarFuentes_(!!(opciones && opciones.releer));
  return { avisos: avisos, filas: leerTablero_(c) };
}

function obtenerPlan(ciclo, sig) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
  const b = bloqueoDe_(c, s);
  return {
    estado: p.estado,
    version: p.version,
    asignaturas: p.version ? contenidoVersion_(c, s, p.version, p.filaVersion) : [],
    bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null
  };
}

/* versionConocida: la versión que el navegador ya tiene. Si sigue siendo la vigente,
   no se devuelve el contenido. */
function abrirEdicion(ciclo, sig, versionConocida) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const r = tomarBloqueo_(c, s, u.correo);
    if (!r.ok) return { bloqueado: { correo: r.bloqueo.correo, desde: r.bloqueo.desde, expira: r.bloqueo.expira } };
    const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    const res = { estado: p.estado, version: p.version, expira: r.expira };
    if (versionConocida == null || parseInt(versionConocida, 10) !== p.version)
      res.asignaturas = p.version ? contenidoVersion_(c, s, p.version, p.filaVersion) : [];
    return res;
  });
}

/* datos: {asignaturas, estado, tipo, motivo, versionBase, forzar}. Si se guardó otra
   versión después de versionBase, devuelve {conflicto} para que el navegador advierta;
   con forzar se guarda igualmente (advertir, no prohibir). */
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
    const fila = buscarPlan_(leerPlanes_(), c, s);
    const p = estadoDePlan_(fila);
    if (!datos.forzar && p.version > (parseInt(datos.versionBase, 10) || 0)) {
      const ultima = metaVersiones_(c, s).filter(function (v) { return v.n === p.version; })[0];
      return { conflicto: ultima ? sinFila_(ultima) : { n: p.version } };
    }
    const estado = resolverEstado_(p.estado, datos.estado);
    const fecha = new Date().toISOString();
    const n = registrarVersion_(c, s, fila, {
      estado: estado, tipo: datos.tipo, usuario: u.correo, fecha: fecha,
      motivo: String(datos.motivo || "").slice(0, 500), asignaturas: datos.asignaturas
    });
    const r = b ? tomarBloqueo_(c, s, u.correo) : null;
    return { version: n, estado: estado, fecha: fecha, expira: r && r.ok ? r.expira : null };
  });
}

function obtenerHistorial(ciclo, sig) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  return metaVersiones_(c, s).map(sinFila_);
}

/* Restaurar no borra el historial: crea una versión nueva con el contenido recuperado. */
function restaurarVersion(ciclo, sig, n) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  const k = parseInt(n, 10);

  return conCandado_(function () {
    const b = bloqueoDe_(c, s);
    if (b && b.correo !== u.correo) throw new Error("El plan lo está editando " + b.correo + ", así que no se restauró.");
    const fila = buscarPlan_(leerPlanes_(), c, s);
    const p = estadoDePlan_(fila);
    if (!(k >= 1 && k <= p.version)) throw new Error("La versión v" + n + " no existe.");
    const asignaturas = contenidoVersion_(c, s, k, 0);
    const estado = resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR);
    const version = registrarVersion_(c, s, fila, {
      estado: estado, tipo: "restauración de v" + k, usuario: u.correo,
      fecha: new Date().toISOString(), motivo: "", asignaturas: asignaturas
    });
    const r = b ? tomarBloqueo_(c, s, u.correo) : null;
    return { version: version, estado: estado, asignaturas: asignaturas, expira: r && r.ok ? r.expira : null };
  });
}
