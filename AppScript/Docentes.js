/* CU-002 en el libro: el balance de la carga docente del ciclo con sus reglas A07 a A13,
   los consolidados por departamento (RF-098), las marcas de General que solo se editan
   desde la web (P124) y el reemplazo docente (RF-094, P142). El catálogo es la hoja General
   del ciclo (P126). La asignación se hace en la columna DOCENTE de la hoja de cada carrera
   (Edicion.js); en la grilla de la web, en la fase 4 del plan. */

function obtenerCargaDocente(ciclo) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo || config_().cicloActual);
  const C = dominioCarga_();
  const lectura = leerPlanesCiclo_(c);
  const catalogo = leerGeneral_(c);
  const ev = C.evaluarCiclo(lectura.planes, catalogo, config_().reglas);
  const departamentos = {};
  Dominio.DPTOS.forEach(function (d) { departamentos[d] = C.consolidadoDepartamento(lectura.planes, catalogo, d); });
  return {
    ciclo: c,
    usuario: u,
    reglas: ev.reglas,
    docentes: ev.docentes.map(function (d) {
      return { id: d.id, nombre: d.ficha ? d.ficha.nombre : d.texto, ficha: d.ficha, horas: d.horas, porCarrera: d.porCarrera,
               advertencias: d.advertencias.map(function (a) { return { codigo: a.codigo, bloquea: a.bloquea, mensaje: a.mensaje }; }) };
    }),
    pendientes: ev.pendientes,
    departamentos: departamentos
  };
}

/* Marca a un docente de General con tiempo completo en otra universidad (A08) o con un
   cargo directivo (A12). Solo un Director, y solo desde la web: la hoja General la protege. */
function marcarDocente(ciclo, id, marcas) {
  const u = exigirUsuario_();
  exigirDirector_(u);
  const c = validarCiclo_(ciclo);
  if (!marcas) throw new Error("Faltan las marcas del docente.");
  return conCandado_(function () {
    const catalogo = leerGeneral_(c);
    const f = catalogo.filter(function (x) { return x.id === String(id); })[0];
    if (!f) throw new Error("No hay ningún docente con el identificador «" + id + "» en " + nombreHojaGeneral(c) + ".");
    if (marcas.tcOtraUniv != null) f.tcOtraUniv = !!marcas.tcOtraUniv;
    if (marcas.cargo != null) f.cargo = String(marcas.cargo).trim().slice(0, 100);
    actualizarReportes_(c, leerPlanesCiclo_(c).planes, catalogo);
    anotarBitacora_(u.correo, c, "", "marca de docente", "",
                    f.nombre + ": tiempo completo en otra universidad " + (f.tcOtraUniv ? "sí" : "no") + "; cargo «" + (f.cargo || "") + "».");
    return { id: f.id, nombre: f.nombre, tcOtraUniv: f.tcOtraUniv, cargo: f.cargo };
  });
}

/* ============================================================
   Reemplazo docente (RF-094, P142)
   ============================================================ */

/* Un docente asignado se reconoce por su identificador de General o, sin él, por su nombre. */
function claveDocente_(x) {
  return x.id || ("?:" + dominioCarga_().claveNombre(x.texto));
}

function dictaAlguien_(x) {
  return !!(x && !x.vacante && !x.sinDocente && String(x.texto || "").trim());
}

function refDeGrupo_(planes, sig, id) {
  const lista = planes[sig] || [];
  for (let ci = 0; ci < lista.length; ci++) {
    const gi = lista[ci].grupos.findIndex(function (g) { return g.id === id; });
    if (gi >= 0) return { sig: sig, ci: ci, gi: gi, a: lista[ci], g: lista[ci].grupos[gi] };
  }
  return null;
}

/* La ventana de reemplazo para la fila «fila» de la hoja de «sig»: los docentes de esa
   fila y, de cada uno, sus asignaturas del ciclo que piden cobertura a los departamentos
   del Director, con la de la fila ya marcada (P142). */
function datosReemplazo(ciclo, sig, fila) {
  const u = exigirUsuario_();
  exigirDirector_(u);
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  const C = dominioCarga_();
  const lectura = leerPlanesCiclo_(c);
  const l = lectura.lecturas[s];
  if (!l) throw new Error("El ciclo " + c + " no tiene la hoja de " + Dominio.nombreCarrera(s) + ".");
  const n = parseInt(fila, 10);
  let elegida = null;
  Object.keys(l.ubicaciones).forEach(function (id) {
    l.ubicaciones[id].forEach(function (x) { if (x.fila === n) elegida = { id: id, sub: x.sub }; });
  });
  if (!elegida) throw new Error("La fila " + fila + " no tiene ningún grupo. Elige en la hoja la fila del curso cuyo docente cambia.");
  const ref = refDeGrupo_(lectura.planes, s, elegida.id);
  const bloques = bloquesDeGrupo_(ref.g);
  const bloque = bloques.filter(function (b) { return b.sub === elegida.sub; })[0] || bloques[0];
  const asig = ref.g.asignacion || {};
  const catalogo = leerGeneral_(c);
  const nombreDe = {};
  catalogo.forEach(function (f) { nombreDe[f.id] = f.nombre; });

  const titulares = [];
  bloque.claves.forEach(function (k) {
    const x = asig[k];
    if (!dictaAlguien_(x)) return;
    const clave = claveDocente_(x);
    if (titulares.some(function (t) { return t.clave === clave; })) return;
    const items = [];
    Object.keys(lectura.planes).forEach(function (sg) {
      (lectura.planes[sg] || []).forEach(function (a) {
        if (!puedeAsignar_(u, a.dpto)) return;
        a.grupos.forEach(function (g) {
          const comps = Object.keys(g.asignacion || {}).filter(function (kk) {
            const y = g.asignacion[kk];
            return dictaAlguien_(y) && claveDocente_(y) === clave;
          });
          if (!comps.length) return;
          const lugar = (lectura.lecturas[sg].ubicaciones[g.id] || [])[0];
          items.push({
            sig: sg, hoja: nombreHojaCarrera(sg, c), id: g.id, codigo: a.codigo, nombre: a.nombre, grupo: g.n,
            componentes: comps, fila: lugar ? lugar.fila : null,
            marcada: sg === s && g.id === elegida.id
          });
        });
      });
    });
    titulares.push({ clave: clave, texto: x.texto, nombre: x.id ? nombreDe[x.id] || x.texto : x.texto, items: items });
  });
  if (!titulares.length) throw new Error("La fila " + fila + " no tiene un docente asignado: no hay a quién reemplazar.");
  return {
    ciclo: c, sig: s, fila: n, codigo: ref.a.codigo, nombre: ref.a.nombre, grupo: ref.g.n,
    titulares: titulares, motivos: C.MOTIVOS_REEMPLAZO,
    catalogo: catalogo.map(function (f) { return { id: f.id, nombre: f.nombre }; })
                      .sort(function (x, y) { return Dominio.normalizar(x.nombre).localeCompare(Dominio.normalizar(y.nombre)); })
  };
}

/* datos: { titular (su clave), reemplazante (texto), motivo, resolucion, fechaEfectiva,
   items: [{ sig, id, componentes }] }. Todas las asignaturas marcadas cambian juntas: si
   A07, A08 o A11 impiden alguna, no cambia ninguna (P119, P142). El cambio se guarda
   enseguida como versión de cada carrera afectada, con el detalle en la bitácora
   (CU-002, FA-002A). */
function registrarReemplazo(ciclo, datos) {
  const u = exigirUsuario_();
  exigirDirector_(u);
  const c = validarCiclo_(ciclo);
  const C = dominioCarga_();
  if (!datos) throw new Error("Faltan los datos del reemplazo.");
  const motivo = String(datos.motivo || "");
  if (C.MOTIVOS_REEMPLAZO.indexOf(motivo) < 0) throw new Error("Elige el motivo del reemplazo: " + C.MOTIVOS_REEMPLAZO.join(", ") + ".");
  const resolucion = String(datos.resolucion || "").trim().slice(0, 100);
  if (!resolucion) throw new Error("Falta el número de resolución del Decanato.");
  const fechaEfectiva = String(datos.fechaEfectiva || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEfectiva)) throw new Error("Falta la fecha efectiva del reemplazo.");
  const texto = String(datos.reemplazante || "").trim();
  if (!texto) throw new Error("Elige al docente reemplazante.");
  const items = Array.isArray(datos.items) ? datos.items : [];
  if (!items.length) throw new Error("Marca al menos una asignatura.");
  items.forEach(function (it) { validarCarrera_(it.sig); });

  return conCandado_(function () {
    let lectura = leerPlanesCiclo_(c);
    const estados = leerPlanes_();
    /* Las carreras que el reemplazo puede tocar: las marcadas y las de las secciones fusionadas
       de sus grupos. Lo que tengan sin versionar en sus hojas se consolida antes, para que el
       reemplazo no lo pise. */
    const alcance = items.map(function (it) { return it.sig; }).filter(function (x, i, l) { return l.indexOf(x) === i; });
    items.forEach(function (it) {
      const ref = refDeGrupo_(lectura.planes, it.sig, it.id);
      if (ref && ref.g.fusion)
        Dominio.gruposDeFusion(lectura.planes, ref.g.fusion).forEach(function (x) { if (alcance.indexOf(x.sig) < 0) alcance.push(x.sig); });
    });
    const conCambios = alcance.filter(function (s) { return cambiosSinVersionar_(buscarPlan_(estados, c, s), lectura.lecturas[s]); });
    const ocupacion = ocupacion_(c, u.correo);
    const ocupadas = alcance.filter(function (s) { return !ocupacion.libre(s); });
    if (ocupadas.length) throw new Error(mensajeOcupadas_(ocupadas, ocupacion));
    conCambios.forEach(function (s) { consolidar_(c, s, u, "Antes del reemplazo docente"); });
    if (conCambios.length) lectura = leerPlanesCiclo_(c);

    const catalogo = leerGeneral_(c);
    const altas = [];
    const reemplazante = C.asignacionDeParte({ texto: texto }, catalogo, altas);
    if (reemplazante.vinculo === "ambiguo") throw new Error("«" + texto + "» se parece a varios docentes de General: elige uno de la lista.");
    if (!dictaAlguien_(reemplazante)) throw new Error("El reemplazante tiene que ser un docente.");

    const antes = JSON.parse(JSON.stringify(lectura.planes));
    const planes = JSON.parse(JSON.stringify(lectura.planes));
    const historial = { motivo: motivo, resolucion: resolucion, fechaEfectiva: fechaEfectiva, usuario: u.correo, fecha: new Date().toISOString() };
    const hechos = [];
    let saliente = "";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const ref = refDeGrupo_(planes, it.sig, it.id);
      if (!ref) throw new Error("Una asignatura marcada ya no está en la hoja de " + it.sig + ". Vuelve a abrir el reemplazo.");
      if (!puedeAsignar_(u, ref.a.dpto))
        throw new Error(it.sig + " " + ref.a.codigo + " pide docente a " + (ref.a.dpto || "ningún departamento") + ", que no es tu departamento (P114).");
      const asig = ref.g.asignacion || {};
      const claves = (it.componentes || []).filter(function (k) { return dictaAlguien_(asig[k]) && claveDocente_(asig[k]) === datos.titular; });
      if (!claves.length)
        throw new Error("En " + it.sig + " " + ref.a.codigo + " (grupo " + ref.g.n + ") ya no dicta el titular. Vuelve a abrir el reemplazo.");
      saliente = saliente || asig[claves[0]].texto;
      const r = C.reemplazar(planes, { sig: it.sig, ci: ref.ci, gi: ref.gi }, claves, reemplazante, historial, catalogo, config_().reglas);
      if (!r.ok) return { ok: false, asignatura: it.sig + " " + ref.a.codigo + " «" + ref.a.nombre + "» (grupo " + ref.g.n + ")",
                          bloqueos: r.bloqueos.map(function (b) { return { codigo: b.codigo, mensaje: b.mensaje }; }) };
      hechos.push({ sig: it.sig, codigo: ref.a.codigo, nombre: ref.a.nombre, grupo: ref.g.n, componentes: claves });
    }

    /* Una sección fusionada cambia en todas sus carreras: cada una tiene que estar libre. */
    const afectadas = Object.keys(planes).filter(function (s) {
      return Dominio.contenidoCanonico(planes[s]) !== Dominio.contenidoCanonico(antes[s]);
    });
    const ocupadas2 = afectadas.filter(function (s) { return !ocupacion.libre(s); });
    if (ocupadas2.length) throw new Error(mensajeOcupadas_(ocupadas2, ocupacion));
    const fecha = new Date().toISOString();
    const versiones = {};
    afectadas.forEach(function (s) {
      escribirCambiosHoja_(c, s, planes[s], planes, lectura.lecturas[s], {});
      const p = estadoDePlan_(buscarPlan_(leerPlanes_(), c, s));
      versiones[s] = registrarVersion_(c, s, {
        estado: resolverEstado_(p.estado, Dominio.ESTADOS.BORRADOR), tipo: "reemplazo docente", usuario: u.correo, fecha: fecha,
        motivo: motivo + " · resolución " + resolucion, asignaturas: planes[s],
        detalle: JSON.stringify({ saliente: saliente, reemplazante: reemplazante.texto, motivo: motivo, resolucion: resolucion,
                                  fechaEfectiva: fechaEfectiva, asignaturas: hechos.filter(function (h) { return h.sig === s; }) })
      });
    });
    actualizarReportes_(c, planes, catalogo);
    return { ok: true, versiones: versiones, hechos: hechos, saliente: saliente, reemplazante: reemplazante.texto,
             alta: altas.length ? altas[0].nombre : null };
  });
}

function mensajeOcupadas_(carreras, ocupacion) {
  return carreras.map(function (s) { return s + " la edita " + ocupacion.ocupadas[s].correo; }).join("; ") +
         ": el reemplazo no se registró. Vuelve a intentarlo cuando termine su edición.";
}
