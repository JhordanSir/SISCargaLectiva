// @ts-check
/* CU-001 FA-101 a FA-103: fusiones con otras carreras al guardar, la parte que lee y
   escribe la hoja. La reconciliación (qué cambia en cada plan) es
   Dominio.reconciliarFusiones, sin acceso a la hoja. Los planes de las otras carreras no se
   tocan si otra cuenta los está editando: en ese caso no se guarda nada y se avisa. */

/**
 * Debe llamarse dentro de conCandado_. antes: contenido vigente del plan; despues: el que
 * se va a guardar (se ajusta aquí); disueltas: marcas que el usuario deshizo.
 * opciones.sinBloqueo: no comprueba los bloqueos ajenos (lectura automática del xlsx).
 * Devuelve {asignaturas, otros: [{sig, asignaturas, motivo}]}.
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {Asignatura[]} antes
 * @param {Asignatura[]} despues
 * @param {string[]} disueltas
 * @param {Usuario|null} usuario
 * @param {{sinBloqueo?: boolean}=} opciones
 * @returns {{asignaturas: Asignatura[], otros: Array<{sig: Sigla, asignaturas: Asignatura[], motivo: string}>}}
 */
function prepararFusiones_(ciclo, sig, antes, despues, disueltas, usuario, opciones) {
  if (!Dominio.marcasAfectadas(antes, despues, disueltas).length) return { asignaturas: despues, otros: [] };

  const filas = leerPlanes_().filter(function (p) { return p.ciclo === ciclo && p.carrera !== sig; });
  const r = Dominio.reconciliarFusiones(sig, antes, despues, disueltas, contenidosVigentes_(REPO_PLAN_, ciclo, filas));
  const tocados = Object.keys(r.cambios);
  if (!(opciones && opciones.sinBloqueo)) {
    tocados.forEach(function (s) {
      const b = bloqueoDe_(ciclo, Dominio.REF.plan(s));
      if (b && b.correo !== usuario.correo)
        fallo_("BLOQUEADO", "No se guardó: la fusión cambia el plan de " + Dominio.nombreCarrera(s) + ", que está editando " +
                        b.correo + ". Espera a que termine o deshaz esa fusión.");
    });
  }
  return {
    asignaturas: r.asignaturas,
    otros: tocados.map(function (s) { return { sig: s, asignaturas: r.cambios[s].asignaturas, motivo: r.cambios[s].motivos.join("; ") }; })
  };
}

/**
 * Guarda en los planes de otras carreras los cambios de fusión. Debe llamarse dentro de
 * conCandado_. Devuelve la fila del tablero de cada plan tocado.
 * @param {string} ciclo
 * @param {Array<{sig: Sigla, asignaturas: Asignatura[], motivo: string}>} otros
 * @param {string} usuario Correo o «xlsx: …».
 * @param {string} fecha
 * @returns {Array<{sig: Sigla, version: number, estado: string, totales: Totales, contenido: Asignatura[]}>}
 */
function guardarFusionesAjenas_(ciclo, otros, usuario, fecha) {
  if (!otros.length) return [];
  const filas = leerPlanes_();
  return otros.map(function (o) {
    const fila = buscarPlan_(filas, ciclo, o.sig);
    const p = estadoDePlan_(fila);
    const estado = p.estado === Dominio.ESTADOS.SIN ? Dominio.ESTADOS.BORRADOR : p.estado;
    const n = registrarVersionPlan_(ciclo, o.sig, fila, {
      estado: estado, tipo: Dominio.TIPO_VERSION.FUSION, usuario: usuario, fecha: fecha, motivo: o.motivo, asignaturas: o.asignaturas
    });
    return { sig: o.sig, version: n, estado: estado, totales: Dominio.totales(o.asignaturas), contenido: o.asignaturas };
  });
}
