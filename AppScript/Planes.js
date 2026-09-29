/* Planes de ciclo: tablero, consulta, edición, guardado con versiones e historial.
   Cada guardado añade una fila a Versiones con el contenido completo del plan, y la
   fila del plan en Planes guarda su estado, su versión vigente y sus totales. */

var TIPOS_GUARDADO_ = ["guardar borrador", "registrar", "guardar cambios", "autoguardado"];

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
    totales: fila && fila.totales ? JSON.parse(fila.totales) : null
  };
}

/* Un plan Registrado nunca vuelve a Borrador. */
function resolverEstado_(actual, pedido) {
  if (actual === Dominio.ESTADOS.REGISTRADO) return Dominio.ESTADOS.REGISTRADO;
  return pedido === Dominio.ESTADOS.REGISTRADO ? Dominio.ESTADOS.REGISTRADO : Dominio.ESTADOS.BORRADOR;
}

/* Debe llamarse dentro de conCandado_. Añade la versión y actualiza la fila del plan. */
function registrarVersion_(ciclo, sig, fila, datos) {
  const n = (fila ? parseInt(fila.version, 10) || 0 : 0) + 1;
  agregarFila_("Versiones", [ciclo, sig, n, datos.estado, datos.tipo, datos.usuario, datos.fecha, datos.motivo || ""]
    .concat(trocear_(JSON.stringify(datos.asignaturas))));
  const valores = [ciclo, sig, datos.estado, n, datos.usuario, datos.fecha,
    datos.firma_xlsx != null ? datos.firma_xlsx : (fila ? fila.firma_xlsx : ""),
    JSON.stringify(Dominio.totales(datos.asignaturas))];
  if (fila) escribirFila_("Planes", fila._fila, valores);
  else agregarFila_("Planes", valores);
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

function contenidoVersion_(ciclo, sig, n) {
  const v = metaVersiones_(ciclo, sig).filter(function (x) { return x.n === n; })[0];
  if (!v) throw new Error("No se encontró la versión v" + n + " del plan.");
  const h = hojaBd_("Versiones");
  const primera = TABLAS_.Versiones.indexOf("contenido") + 1;
  const celdas = h.getRange(v._fila, primera, 1, Math.max(1, h.getLastColumn() - primera + 1)).getValues()[0];
  return JSON.parse(celdas.map(function (c) { return c == null ? "" : String(c); }).join("") || "[]");
}

function sinFila_(v) {
  return { n: v.n, estado: v.estado, tipo: v.tipo, usuario: v.usuario, fecha: v.fecha, motivo: v.motivo };
}

/* ============================================================
   Funciones que llama el navegador (google.script.run)
   ============================================================ */

function obtenerTablero(ciclo) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const avisos = sincronizarFuentes_();
  const planes = leerPlanes_();
  const bloqueos = bloqueosVigentes_();
  return {
    avisos: avisos,
    filas: Dominio.CARRERAS.map(function (car) {
      const p = estadoDePlan_(buscarPlan_(planes, c, car.sig));
      const b = bloqueos.filter(function (x) { return x.ciclo === c && x.carrera === car.sig; })[0];
      return {
        sig: car.sig, nombre: car.nombre, estado: p.estado, version: p.version, totales: p.totales,
        bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null
      };
    })
  };
}

function obtenerPlan(ciclo, sig) {
  exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
  const b = bloqueoDe_(c, s);
  return {
    estado: p.estado,
    version: p.version,
    asignaturas: p.version ? contenidoVersion_(c, s, p.version) : [],
    bloqueo: b ? { correo: b.correo, desde: b.desde, expira: b.expira } : null
  };
}

function abrirEdicion(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  exigirEdicion_(u, s);
  return conCandado_(function () {
    const r = tomarBloqueo_(c, s, u.correo);
    if (!r.ok) return { bloqueado: { correo: r.bloqueo.correo, desde: r.bloqueo.desde } };
    const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
    return {
      estado: p.estado,
      version: p.version,
      asignaturas: p.version ? contenidoVersion_(c, s, p.version) : [],
      expira: r.expira
    };
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
    const asignaturas = contenidoVersion_(c, s, k);
    const estado = resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR);
    const version = registrarVersion_(c, s, fila, {
      estado: estado, tipo: "restauración de v" + k, usuario: u.correo,
      fecha: new Date().toISOString(), motivo: "", asignaturas: asignaturas
    });
    const r = b ? tomarBloqueo_(c, s, u.correo) : null;
    return { version: version, estado: estado, asignaturas: asignaturas, expira: r && r.ok ? r.expira : null };
  });
}
