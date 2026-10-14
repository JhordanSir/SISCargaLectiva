/* Datos del panel lateral de la carrera (RF-101, P141): totales de la hoja, bloqueo,
   versiones y alertas A05 a A15 con su fila. Panel.html los pide a través de la aplicación
   web (Menu.js), que corre como la cuenta propietaria (RNF-13). */

function datosPanel(ciclo, sig) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig);
  const lectura = leerPlanesCiclo_(c);
  const l = lectura.lecturas[s];
  const fila = buscarPlan_(leerPlanes_(), c, s);
  const p = estadoDePlan_(fila);
  const b = bloqueoDeFila_(fila);
  const catalogo = leerGeneral_(c);
  return {
    ciclo: c, sig: s, nombre: Dominio.nombreCarrera(s), hoja: nombreHojaCarrera(s, c),
    estado: p.estado, version: p.version, pendiente: cambiosSinVersionar_(fila, l), existe: !!l,
    bloqueo: vigente_(b) ? { correo: b.correo, desde: b.desde, expira: b.expira, propio: b.correo === u.correo } : null,
    totales: Dominio.totales(l ? l.asignaturas : []),
    alertas: l ? alertasDeCarrera_(c, s, lectura, catalogo) : [],
    versiones: metaVersiones_(c, s).map(sinFila_).reverse().slice(0, 50),
    permisos: { editar: u.carreras.indexOf(s) >= 0, reemplazar: u.rol === "director" },
    usuario: { correo: u.correo, rol: u.rol, departamento: u.departamento || "" },
    urlWeb: urlWeb_()
  };
}

/* Alertas de una carrera, por fila de su hoja. Las de los docentes (A07 a A12) son las de
   quienes dictan en esta carrera, aunque sus horas sumen en varias. */
function alertasDeCarrera_(ciclo, sig, lectura, catalogo) {
  const C = dominioCarga_();
  const l = lectura.lecturas[sig];
  const planes = lectura.planes;
  const res = [];
  const filaDe = function (g) { const x = g && (l.ubicaciones[g.id] || [])[0]; return x ? x.fila : null; };
  const donde = function (a, g) { return a.codigo + " «" + a.nombre + "»" + (g && String(g.n) !== "1" ? " (grupo " + g.n + ")" : ""); };
  const agregar = function (codigo, texto, fila) { res.push({ codigo: codigo, texto: texto, fila: fila || null }); };

  l.avisos.forEach(function (t) { const m = t.match(/^Fila (\d+)/); agregar("Hoja", t, m ? parseInt(m[1], 10) : null); });

  /* A05: un grupo fusionado que difiere de su principal en nombre, código u horas propias. */
  planes[sig].forEach(function (a) {
    a.grupos.forEach(function (g) {
      if (!g.fusion || g.fusionPrincipal === true) return;
      const pr = Dominio.principalDeFusion(planes, g.fusion);
      if (!pr || pr.g === g) return;
      const propias = g.previas || { ht: g.ht, hp: g.hp };
      const difs = [];
      if (pr.a.nombre !== a.nombre) difs.push("nombre");
      if (pr.a.codigo !== a.codigo) difs.push("código");
      if (Dominio.num(propias.ht) !== Dominio.num(pr.g.ht) || Dominio.num(propias.hp) !== Dominio.num(pr.g.hp)) difs.push("horas");
      if (difs.length) agregar("A05", donde(a, g) + " difiere del grupo principal (" + pr.sig + " " + pr.a.codigo + ") en " + difs.join(", ") + ".", filaDe(g));
    });
  });

  /* Grupos que se eliminaron en la hoja y todavía están en la versión (P140, P143). A06: era
     el único grupo de su asignatura o estaba fusionado. */
  contenidoVigente_(ciclo, sig).forEach(function (a) {
    a.grupos.forEach(function (g) {
      if (l.ubicaciones[g.id]) return;
      const queda = l.asignaturas.some(function (x) { return (x.codigo || x.nombre) === (a.codigo || a.nombre) && x.grupos.length; });
      const motivo = g.fusion ? " y estaba fusionado" : !queda ? "; era el único grupo de la asignatura" : "";
      agregar(g.fusion || !queda ? "A06" : "Eliminado",
              donde(a, g) + " se eliminó en la hoja" + motivo + ". Al sincronizar, la versión nueva ya no lo incluye.", null);
    });
  });

  /* A07, A08 y A11 que no se aceptaron. */
  planes[sig].forEach(function (a) {
    a.grupos.forEach(function (g) {
      (g.rechazos || []).forEach(function (r) { agregar(r.codigo, donde(a, g) + ": no se aceptó «" + r.texto + "». " + r.motivo, filaDe(g)); });
    });
  });

  /* Advertencias de los docentes que dictan en esta carrera. */
  C.evaluarCiclo(planes, catalogo, config_().reglas).docentes.forEach(function (d) {
    const propios = (d.items || []).filter(function (it) { return it.sig === sig; });
    if (!propios.length) return;
    d.advertencias.forEach(function (adv) {
      const it = (adv.items || []).filter(function (x) { return x.sig === sig; })[0] || propios[0];
      const a = planes[sig][it.ci];
      agregar(adv.codigo, (d.ficha ? d.ficha.nombre : d.texto) + ": " + adv.mensaje, a ? filaDe(a.grupos[it.gi]) : null);
    });
  });

  /* A13: grupos sin docente. */
  C.sinDocente(planes[sig]).forEach(function (x) {
    const a = planes[sig][x.ci], g = a.grupos[x.gi];
    const todos = Dominio.componentes(g).length === x.componentes.length;
    agregar("A13", donde(a, g) + " no tiene docente" + (todos ? "" : " en " + x.componentes.join(", ")) + ".", filaDe(g));
  });

  /* A14 y A15: anotaciones de fusión que no se pueden resolver del todo. */
  const copia = JSON.parse(JSON.stringify(planes));
  planes[sig].forEach(function (a, ci) {
    if (!Dominio.leerFusionTexto(a.obs)) return;
    const x = copia[sig][ci];
    Dominio.fusionesDesdeObservaciones(copia, { solo: function (y) { return y === x; } }).avisos.forEach(function (t) {
      agregar(/no coinciden/.test(t) ? "A15" : "A14", t, filaDe(a.grupos[0]));
    });
  });

  /* Fusiones que esperan a que otra carrera se libere (P139). */
  planes[sig].forEach(function (a) {
    if (a.esperaFusion) agregar("Fusión", donde(a) + ": " + a.esperaFusion.nota, filaDe(a.grupos[0]));
  });

  return res.sort(function (x, y) { return (x.fila || 1e9) - (y.fila || 1e9); });
}
