/* CU-002 en el libro: el balance de la carga docente del ciclo con sus reglas A07 a A13,
   los consolidados por departamento (RF-098) y las marcas de General que solo se editan
   desde la web (P124). El catálogo es la hoja General del ciclo (P126). La asignación en la
   grilla de la carrera y en su hoja llega en las fases 3 y 4 del plan. */

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
    escribirGeneral_(c, catalogo, leerPlanesCiclo_(c).planes);
    anotarBitacora_(u.correo, c, "", "marca de docente", "",
                    f.nombre + ": tiempo completo en otra universidad " + (f.tcOtraUniv ? "sí" : "no") + "; cargo «" + (f.cargo || "") + "».");
    return { id: f.id, nombre: f.nombre, tcOtraUniv: f.tcOtraUniv, cargo: f.cargo };
  });
}
