// @ts-check
/* Derivación de una asignatura a otro departamento: la excepción a que el docente lo asigne
   el departamento de la carrera. Las entradas son de cada pantalla: consultaDerivar
   (cu001/vistas/consulta, CU-001 FA-005 a FA-008) y asignacionEdicionDerivar
   (cu002/vistas/asignacion-edicion, CU-002 FA-079 a FA-083). Se anota en
   asignatura.derivado (la columna DPTO no cambia); derivarla al departamento de la carrera
   quita la derivación (CU-001 FA-006, CU-002 FA-080). Crea una versión nueva del plan con
   el mismo estado, de tipo «cambio de departamento». Las asignaciones de docentes la siguen. */

/**
 * CU-001 FA-005 y CU-002 FA-079: valida lo que llega del navegador y deriva la asignatura
 * del grupo grupoId al departamento «nuevo», con un motivo opcional.
 * @param {string} ciclo
 * @param {Sigla} sig Carrera del plan (en una sección fusionada, la del grupo principal).
 * @param {string} grupoId
 * @param {Dpto} nuevo
 * @param {string=} motivo
 * @returns {{version: number, estado: string, totales: Totales, contenido: Asignatura[], sinCambios?: boolean}}
 */
function derivarDesdeEntrada_(ciclo, sig, grupoId, nuevo, motivo) {
  const usuario = exigirUsuario_();
  const c = validarCiclo_(ciclo), s = validarCarrera_(sig), d = validarDpto_(nuevo);
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(grupoId || ""))) fallo_("DATO_INVALIDO", "Grupo no válido.");
  return derivarAsignatura_(usuario, c, s, String(grupoId), d, String(motivo || "").slice(0, 300));
}

/**
 * Solo lo hace el director del departamento que hoy asigna la asignatura (CU-001 FA-005 y
 * su actor «Director de departamento»; el coordinador no deriva). Si otra cuenta edita el
 * plan, no se guarda (CU-001 FA-008, CU-002 FA-083).
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {Sigla} sig
 * @param {string} grupoId
 * @param {Dpto} nuevo
 * @param {string} motivo
 * @returns {{version: number, estado: string, totales: Totales, contenido: Asignatura[], sinCambios?: boolean}}
 */
function derivarAsignatura_(usuario, ciclo, sig, grupoId, nuevo, motivo) {
  return conCandado_(function () {
    const fila = filaPlan_(ciclo, sig);
    const p = estadoDePlan_(fila);
    if (!p.version) fallo_("NO_ENCONTRADO", "El plan de " + Dominio.nombreCarrera(sig) + " no tiene asignaturas.");
    const asignaturas = contenidoPlan_(ciclo, sig, p.version, p.filaVersion);
    const a = asignaturas.filter(function (x) { return x.grupos.some(function (g) { return g.id === grupoId; }); })[0];
    if (!a) fallo_("NO_ENCONTRADO", "La asignatura ya no está en el plan de " + Dominio.nombreCarrera(sig) + ". Actualiza la pantalla.");
    const propio = Dominio.dptoDeCarrera(sig);
    const actual = Dominio.DPTOS.indexOf(a.derivado) >= 0 ? a.derivado : propio;
    if (usuario.rol !== "director")
      fallo_("SIN_PERMISO", "El coordinador de carrera no deriva cursos: lo hace el director del departamento que los asigna.");
    if (!usuario.departamento || usuario.departamento !== actual)
      fallo_("SIN_PERMISO", "Solo puedes derivar los cursos que asigna tu departamento (" + (usuario.departamento || "sin departamento") + ").");
    if (actual === nuevo) return { version: p.version, estado: p.estado, totales: Dominio.totales(asignaturas), contenido: asignaturas, sinCambios: true };
    exigirSinBloqueoAjeno_(ciclo, sig, usuario, "el cambio de departamento no se guardó");
    if (nuevo === propio) delete a.derivado; else a.derivado = nuevo;
    const version = registrarVersionPlan_(ciclo, sig, fila, {
      estado: p.estado, tipo: Dominio.TIPO_VERSION.CAMBIO_DPTO, usuario: usuario.correo, fecha: Dominio.isoPeru(),
      motivo: (a.codigo + " " + a.nombre + ": " + actual + " → " + nuevo + (nuevo === propio ? " (vuelve al departamento de la carrera)" : "") +
               (motivo ? ". " + motivo : "")).slice(0, 500),
      asignaturas: asignaturas
    });
    return { version: version, estado: p.estado, totales: Dominio.totales(asignaturas), contenido: asignaturas };
  });
}
