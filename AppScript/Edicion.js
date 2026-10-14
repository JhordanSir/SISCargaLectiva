/* Edición directa en las hojas de carrera (RF-081 a RF-083, RF-100; P111, P122, P138 a
   P140). Tres disparadores instalables, que crea instalar() y que corren como la cuenta
   propietaria, así que pueden escribir lo que la hoja protege:
   - onSheetEdit(e): cada edición. Comprueba la cuenta, su rol y el bloqueo de la carrera;
     la primera edición toma el bloqueo y la hoja queda solo para esa persona. Si no puede
     editar, o si otra persona tiene el bloqueo, lo escrito vuelve a su último valor
     aceptado, con una nota. Si puede, se interpreta: TH, SEMESTRE y GRUPO, DOCENTE con sus
     reglas, fusiones anotadas, grupos vaciados, notas y colores, General y las hojas por
     departamento. La versión se crea después, al sincronizar (Planes.js).
   - onSheetChange(e): una fila eliminada entera (P140).
   - revisarBloqueos(): cada 5 minutos, autoguarda y suelta los bloqueos vencidos. */

var DISPARADORES_ = [
  { funcion: "onSheetEdit", tipo: "edicion" },
  { funcion: "onSheetChange", tipo: "cambio" },
  { funcion: "revisarBloqueos", tipo: "tiempo", minutos: 5 }
];

/* Crea los disparadores que falten. Lo llama instalar(), desde la cuenta propietaria. */
function instalarDisparadores_(libro) {
  const existentes = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  const creados = [];
  DISPARADORES_.forEach(function (d) {
    if (existentes.indexOf(d.funcion) >= 0) return;
    const b = ScriptApp.newTrigger(d.funcion);
    if (d.tipo === "edicion") b.forSpreadsheet(libro).onEdit().create();
    else if (d.tipo === "cambio") b.forSpreadsheet(libro).onChange().create();
    else b.timeBased().everyMinutes(d.minutos).create();
    creados.push(d.funcion);
  });
  return creados;
}

/* La cuenta que editó. Si Google no la informa, solo puede ser quien tiene el bloqueo,
   porque la protección no deja escribir a nadie más. */
function correoDeEvento_(e, ciclo, sig) {
  let correo = "";
  try { correo = e && e.user ? String(e.user.getEmail ? e.user.getEmail() : e.user) : ""; } catch (err) { correo = ""; }
  if (!correo) correo = String(Session.getActiveUser().getEmail() || "");
  if (!correo) { const b = bloqueoDe_(ciclo, sig); if (b) correo = b.correo; }
  return correo.trim().toLowerCase();
}

function onSheetEdit(e) {
  if (!e || !e.range) return null;
  const h = e.range.getSheet();
  const id = hojaDeCarrera_(h.getName());
  if (!id) return null;
  const rango = { fila: e.range.getRow(), col: e.range.getColumn(), filas: e.range.getNumRows(), cols: e.range.getNumColumns() };
  if (rango.fila + rango.filas - 1 < PRIMERA_FILA_) return null;
  const unaCelda = rango.filas === 1 && rango.cols === 1;
  return conCandado_(function () {
    const correo = correoDeEvento_(e, id.ciclo, id.sig);
    return procesarEdicionHoja_(id.ciclo, id.sig, correo, { rango: rango, anterior: unaCelda ? e.oldValue : undefined });
  });
}

function onSheetChange(e) {
  if (!e || e.changeType !== "REMOVE_ROW") return null;
  const libro = e.source || SpreadsheetApp.getActiveSpreadsheet();
  const h = libro.getActiveSheet();
  const id = h ? hojaDeCarrera_(h.getName()) : null;
  if (!id) return null;
  return conCandado_(function () {
    const correo = correoDeEvento_(e, id.ciclo, id.sig);
    return procesarEdicionHoja_(id.ciclo, id.sig, correo, { filasEliminadas: true });
  });
}

/* Debe llamarse dentro de conCandado_. */
function procesarEdicionHoja_(ciclo, sig, correo, evento) {
  const nombre = nombreHojaCarrera(sig, ciclo);
  const u = correo ? usuarioDeCorreo_(correo) : { denegado: "No se pudo identificar la cuenta que editó." };
  let motivo = null;
  if (u.denegado) motivo = u.denegado;
  else if (u.carreras.indexOf(sig) < 0) motivo = "Tu cuenta no puede editar la hoja de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarla.";
  else {
    const b = bloqueoDe_(ciclo, sig);
    if (b && b.correo !== u.correo)
      motivo = "No se guardó: " + sig + " la edita " + b.correo + " desde las " + horaCorta_(b.desde) + ".";
  }
  if (motivo) {
    if (evento.filasEliminadas) {
      /* Solo se añaden al final las filas que se fueron: lo demás de la hoja es de quien
         tiene el bloqueo y se procesa con sus ediciones. */
      const lectura = leerPlanesCiclo_(ciclo);
      const res = restaurarEliminados_(ciclo, sig, lectura);
      if (res.restaurados.length)
        escribirCambiosHoja_(ciclo, sig, lectura.planes[sig], lectura.planes, lectura.lecturas[sig], { soloAnexar: true });
      return { revertido: motivo, restaurados: res.restaurados };
    }
    revertirEdicion_(ciclo, sig, evento, motivo);
    return { revertido: motivo, hoja: nombre };
  }
  tomarBloqueo_(ciclo, sig, u.correo);
  return procesarHoja_(ciclo, sig, u, { filasEliminadas: !!evento.filasEliminadas });
}

/* Lo escrito por quien no podía vuelve a su último valor aceptado (P122, P138): el valor
   anterior de la celda si es una sola o, si no, los valores aceptados que guarda SIS.
   Una fila nueva se vacía. La primera celda lleva una nota con el motivo. */
function revertirEdicion_(ciclo, sig, evento, motivo) {
  const h = hojaCarrera_(ciclo, sig);
  const r = evento.rango;
  if (!h || !r) return;
  const desde = Math.max(r.fila, PRIMERA_FILA_), hasta = r.fila + r.filas - 1;
  const n = hasta - desde + 1;
  if (n < 1) return;
  const actuales = h.getRange(desde, 1, n, COLUMNAS_HOJA_.length).getDisplayValues();
  for (let i = 0; i < n; i++) {
    const sis = leerSis_(actuales[i][col_("SIS")]);
    for (let c = r.col; c < r.col + r.cols; c++) {
      const j = c - 1, columna = COLUMNAS_HOJA_[j];
      const k = COLUMNAS_FIRMA_.indexOf(columna);
      if (k < 0) continue;
      let valor;
      if (r.filas === 1 && r.cols === 1 && evento.anterior !== undefined) valor = evento.anterior == null ? "" : evento.anterior;
      else valor = sis && sis.v ? sis.v[k] : "";
      if (String(valor) === String(actuales[i][j])) continue;
      const celda = h.getRange(desde + i, c);
      if (columna !== "HT" && columna !== "HP") celda.setNumberFormat("@");
      celda.setValue(valor);
    }
  }
  h.getRange(desde, Math.max(r.col, 1)).setNote(NOTA_SISTEMA_ + motivo);
}

/* Interpreta lo editado en la hoja de «sig» por «u», que ya tiene el bloqueo, y escribe solo
   lo que cambia. opciones.filasEliminadas: también busca grupos cuya fila se eliminó. Las fusiones
   nuevas escriben en las otras carreras, que quedan versionadas («fusión desde SIG»); la de
   «sig» se versiona al sincronizar. Lo mismo vale para las carreras cuya fusión se deshace
   porque se eliminó un grupo (P143). Debe llamarse dentro de conCandado_. */
function procesarHoja_(ciclo, sig, u, opciones) {
  const op = opciones || {};
  const lectura = leerPlanesCiclo_(ciclo);
  const l = lectura.lecturas[sig];
  if (!l) return null;
  const eliminados = resolverEliminados_(ciclo, sig, lectura, { filasEliminadas: op.filasEliminadas });
  const fusionesNuevas = l.obsCambiadas.filter(function (a) { return !a.esperaFusion; });
  const hay = l.editadas || l.cambiosDocente.length || fusionesNuevas.length || eliminados.aceptados.length || eliminados.blanquear.length;
  if (!hay) return { cambios: false, aceptados: [], rechazados: [], esperas: [], fusiones: 0, eliminados: [] };

  const catalogo = leerGeneral_(ciclo);
  const ocupacion = ocupacion_(ciclo, u.correo);
  const r = conciliar_(lectura, [sig], catalogo, u, { libre: ocupacion.libre, ocupadas: ocupacion.ocupadas, reintentar: false });
  eliminados.tocadas.forEach(function (s) { if (r.tocadas.indexOf(s) < 0) r.tocadas.push(s); });
  escribirCambiosHoja_(ciclo, sig, lectura.planes[sig], lectura.planes, l, { blanquear: eliminados.blanquear });
  const fecha = new Date().toISOString();
  const versiones = {};
  r.tocadas.forEach(function (s) {
    if (s === sig) return;
    escribirCambiosHoja_(ciclo, s, lectura.planes[s], lectura.planes, lectura.lecturas[s], {});
    const p = estadoDePlan_(buscarPlan_(leerPlanes_(), ciclo, s));
    versiones[s] = registrarVersion_(ciclo, s, {
      estado: resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR), tipo: "fusión desde " + sig, usuario: u.correo, fecha: fecha,
      motivo: "", asignaturas: lectura.planes[s], detalle: JSON.stringify({ fusiones: r.fusiones.length, eliminados: eliminados.aceptados.length })
    });
  });
  actualizarReportes_(ciclo, lectura.planes, catalogo, { siCambian: true });
  if (u.correo) marcarHojaCambiada_(ciclo, sig, u.correo);
  return {
    cambios: true, aceptados: r.aceptados, rechazados: r.rechazados, altas: r.altas.length, fusiones: r.fusiones.length,
    esperas: r.esperas, versiones: versiones, eliminados: eliminados.aceptados, avisos: r.avisos
  };
}

/* Quien eliminó filas no podía editar la hoja: vuelven todos los grupos que se fueron. */
function restaurarEliminados_(ciclo, sig, lectura) {
  const l = lectura.lecturas[sig];
  const antes = leerIdsHoja_(ciclo, sig) || idsDeVersion_(ciclo, sig);
  const version = contenidoVigente_(ciclo, sig);
  const res = { restaurados: [], aceptados: [], blanquear: [] };
  antes.forEach(function (id) {
    if (l.ubicaciones[id]) return;
    for (let i = 0; i < version.length; i++) {
      const g = version[i].grupos.filter(function (x) { return x.id === id; })[0];
      if (!g) continue;
      const a = version[i];
      let destino = l.asignaturas.filter(function (x) { return (x.codigo || x.nombre) === (a.codigo || a.nombre); })[0];
      if (!destino) {
        destino = { sem: a.sem, malla: a.malla, codigo: a.codigo, nombre: a.nombre, dpto: a.dpto, obs: a.obs, grupos: [] };
        lectura.planes[sig].push(destino);
      }
      destino.grupos.push(g);
      destino.notaSistema = "Se restauró la fila del grupo " + g.n + ": la cuenta que la eliminó no puede editar esta hoja.";
      res.restaurados.push({ id: id, codigo: a.codigo, nombre: a.nombre, grupo: g.n, filas: [] });
      break;
    }
  });
  Dominio.ordenarAsignaturas(lectura.planes[sig]);
  return res;
}

/* Cada 5 minutos (P138): los bloqueos vencidos se autoguardan, si su hoja tiene cambios sin
   versionar, y se sueltan, con lo que la hoja vuelve a sus Coordinadores y Directores. */
function revisarBloqueos() {
  const ahora = Date.now();
  const vencidos = leerPlanes_().filter(function (p) {
    return p.bloqueo_correo && !(Date.parse(p.bloqueo_expira) > ahora);
  });
  const res = [];
  vencidos.forEach(function (p) {
    try {
      res.push(conCandado_(function () { return caducarConAutoguardado_(p.ciclo, p.carrera); }));
    } catch (err) {
      console.error("revisarBloqueos " + p.ciclo + " " + p.carrera + ": " + err.message);
    }
  });
  return res;
}

/* Debe llamarse dentro de conCandado_. */
function caducarConAutoguardado_(ciclo, sig) {
  const fila = buscarPlan_(leerPlanes_(), ciclo, sig);
  const b = bloqueoDeFila_(fila);
  if (!b || vigente_(b)) return { ciclo: ciclo, sig: sig, caducado: false };
  let version = null;
  const l = leerHojaCarrera_(ciclo, sig);
  if (l && cambiosSinVersionar_(fila, l)) {
    const u = usuarioDeCorreo_(b.correo);
    const quien = u.denegado ? { correo: b.correo, rol: "", departamento: "", carreras: [] } : u;
    const r = consolidar_(ciclo, sig, quien, "Autoguardado al vencer el bloqueo", { tipo: "autoguardado" });
    version = r.versiones[sig] || null;
  }
  caducarBloqueo_(ciclo, sig);
  return { ciclo: ciclo, sig: sig, caducado: true, version: version };
}
