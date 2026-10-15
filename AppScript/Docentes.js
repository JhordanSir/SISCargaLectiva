/* Módulo de asignación docente: carga de docentes y gestión de asignaciones por departamento.
   Lee el catálogo de profesores desde CargaDeDocentes.xlsx en Drive, obtiene las asignaturas
   solicitadas en los planes registrados de todas las carreras, y persiste las asignaciones
   en la pestaña 'Asignaciones' de la hoja del sistema con concurrencia controlada. */

var SEGUNDOS_CACHE_DOCENTES_ = 3600; // 1 hora de caché para el catálogo de profesores

/* ============================================================
   1. Catálogo Maestro de Docentes (CargaDeDocentes.xlsx en Drive)
   ============================================================ */

function leerCatalogoDocentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("cat_docentes", cfg.carpetaId);
  if (!forzar) {
    const cached = leerDeCache_(clave);
    if (cached && Array.isArray(cached) && cached.length) return cached;
  }

  const carpeta = abrirCarpeta_(cfg.carpetaId);
  if (!carpeta) return [];

  const avisos = [];
  const fuentes = localizarXlsx_(carpeta, avisos);
  if (!fuentes.docentes) {
    return [];
  }

  try {
    const libro = leerLibroXlsx(descomprimirXlsx_(fuentes.docentes.getBlob()));
    const hojaGen = libro.find(function (h) { return /general/i.test(h.nombre); }) || libro[0];
    if (!hojaGen || !hojaGen.filas || hojaGen.filas.length < 2) return [];

    const cabecera = hojaGen.filas[0].map(Dominio.normalizar);
    let colDni = -1, colPat = -1, colMat = -1, colNom = -1, colCond = -1, colCat = -1, colDpto = -1, colDedic = -1;

    cabecera.forEach(function (c, j) {
      if (c === "DNI") colDni = j;
      if (c.indexOf("APELLIDO PAT") >= 0 || c.indexOf("PATERNO") >= 0) colPat = j;
      if (c.indexOf("APELLIDO MAT") >= 0 || c.indexOf("MATERNO") >= 0) colMat = j;
      if (c === "NOMBRES" || c === "NOMBRE") colNom = j;
      if (c.indexOf("CONDICION") >= 0) colCond = j;
      if (c.indexOf("CATEGORIA") >= 0) colCat = j;
      if (c.indexOf("DEPARTAMENTO") >= 0 || c === "DPTO") colDpto = j;
      if (c.indexOf("DEDIC") >= 0) colDedic = j;
    });

    if (colDni < 0) colDni = 1;
    if (colPat < 0) colPat = 2;
    if (colMat < 0) colMat = 3;
    if (colNom < 0) colNom = 4;
    if (colCond < 0) colCond = 5;
    if (colCat < 0) colCat = 6;
    if (colDpto < 0) colDpto = 8;
    if (colDedic < 0) colDedic = 9;

    const lista = [];
    for (let r = 1; r < hojaGen.filas.length; r++) {
      const fila = hojaGen.filas[r];
      if (!fila || !fila.length) continue;
      const dni = fila[colDni] ? String(fila[colDni]).trim() : "";
      const pat = fila[colPat] ? String(fila[colPat]).trim() : "";
      const mat = fila[colMat] ? String(fila[colMat]).trim() : "";
      const nom = fila[colNom] ? String(fila[colNom]).trim() : "";
      if (!nom && !pat) continue;

      const nombreCompleto = (pat + " " + mat).trim() + (nom ? ", " + nom : "");
      const dptoRaw = fila[colDpto] ? String(fila[colDpto]).trim() : "";
      const dptoSigla = Dominio.normalizarDpto(dptoRaw) || dptoRaw;
      const condicion = fila[colCond] ? String(fila[colCond]).trim() : "Contratado";
      const categoria = fila[colCat] ? String(fila[colCat]).trim() : "AUXILIAR";
      const dedicacion = fila[colDedic] ? String(fila[colDedic]).trim().toUpperCase() : "TP";

      lista.push({
        dni: dni,
        paterno: pat,
        materno: mat,
        nombres: nom,
        nombreCompleto: nombreCompleto,
        condicion: condicion,
        categoria: categoria,
        dpto: dptoSigla,
        dptoNombre: Dominio.nombreDpto(dptoSigla),
        dedicacion: dedicacion.indexOf("TC") >= 0 ? "TC" : "TP"
      });
    }

    if (lista.length) {
      guardarEnCache_(clave, lista, SEGUNDOS_CACHE_DOCENTES_);
    }
    return lista;
  } catch (e) {
    return [];
  }
}

/* ============================================================
   2. Asignaciones Persistidas en la BD (Pestaña 'Asignaciones')
   ============================================================ */

function leerAsignacionesCiclo_(ciclo) {
  const todas = leerTabla_("Asignaciones");
  return todas.filter(function (a) { return a.ciclo === ciclo; });
}

function leerAsignacionesDpto_(ciclo, dpto) {
  const asignaciones = leerAsignacionesCiclo_(ciclo);
  if (!dpto || dpto === "TODOS") return asignaciones;
  const dptoNorm = Dominio.normalizarDpto(dpto) || dpto;
  return asignaciones.filter(function (a) {
    return (Dominio.normalizarDpto(a.departamento) || a.departamento) === dptoNorm;
  });
}

/* ============================================================
   3. Extracción de Asignaturas de Planes Registrados
   ============================================================ */

function obtenerCursosDepartamento_(ciclo, dpto) {
  const planes = leerPlanes_().filter(function (p) { return p.ciclo === ciclo; });
  const contenidos = contenidosVigentes_(ciclo, planes);
  const dptoNorm = Dominio.normalizarDpto(dpto);
  const cursos = [];

  Object.keys(contenidos).forEach(function (sigla) {
    const asignaturas = contenidos[sigla] || [];
    asignaturas.forEach(function (asig) {
      const asigDpto = Dominio.normalizarDpto(asig.dpto);
      if (dpto && dpto !== "TODOS" && asigDpto !== dptoNorm) return;

      (asig.grupos || []).forEach(function (g) {
        const ht = Dominio.num(g.ht);
        const hp = Dominio.num(g.hp);
        const th = ht + hp;
        const subgrupos = g.desdoble ? (parseInt(g.desdoble, 10) || 2) : 1;

        cursos.push({
          carrera: sigla,
          carreraNombre: Dominio.nombreCarrera(sigla),
          malla: asig.malla || "",
          sem: asig.sem || "",
          codigo: asig.codigo || "",
          nombre: asig.nombre || "",
          dpto: asigDpto || asig.dpto || "",
          obs: asig.obs || "",
          grupo: g.n,
          ht: ht,
          hp: hp,
          th: th,
          desdoble: g.desdoble || null,
          subgrupos: subgrupos,
          fusion: g.fusion || null
        });
      });
    });
  });

  return cursos;
}

/* ============================================================
   4. Bloqueo de Edición por Departamento
   ============================================================ */

function claveBloqueoDpto_(dpto) {
  return "DPTO:" + (Dominio.normalizarDpto(dpto) || dpto);
}

function bloqueoDeDpto_(ciclo, dpto) {
  return bloqueoDe_(ciclo, claveBloqueoDpto_(dpto));
}

function tomarBloqueoDpto(ciclo, dpto) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const d = Dominio.normalizarDpto(dpto) || dpto;
  return conCandado_(function () {
    const r = tomarBloqueo_(c, claveBloqueoDpto_(d), u.correo);
    return r.ok ? { ok: true, desde: r.desde, expira: r.expira } : { ok: false, bloqueo: r.bloqueo };
  });
}

function renovarBloqueoDpto(ciclo, dpto) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const d = Dominio.normalizarDpto(dpto) || dpto;
  return conCandado_(function () {
    const r = tomarBloqueo_(c, claveBloqueoDpto_(d), u.correo);
    return r.ok ? { expira: r.expira } : { perdido: { correo: r.bloqueo.correo } };
  });
}

function liberarBloqueoDpto(ciclo, dpto) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const d = Dominio.normalizarDpto(dpto) || dpto;
  return conCandado_(function () {
    const ref = claveBloqueoDpto_(d);
    leerBloqueos_()
      .filter(function (x) { return x.ciclo === c && x.carrera === ref && x.correo === u.correo; })
      .map(function (x) { return x._fila; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (fila) { borrarFila_("Bloqueos", fila); });
    return true;
  });
}

/* ============================================================
   5. Consulta y estado principal de la asignación docente
   ============================================================ */

function obtenerEstadoDocentes(ciclo, dpto) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo || config_().cicloXlsx);
  const d = Dominio.normalizarDpto(dpto) || "DIMA";

  const catalogo = leerCatalogoDocentes_();
  const cursos = obtenerCursosDepartamento_(c, d);
  const asignacionesDpto = leerAsignacionesDpto_(c, d);
  const todasAsignacionesCiclo = leerAsignacionesCiclo_(c);
  const bloqueo = bloqueoDeDpto_(c, d);

  const balance = Dominio.calcularBalanceDocente(catalogo, todasAsignacionesCiclo);

  return {
    estado: "ok",
    ciclo: c,
    departamento: d,
    departamentoNombre: Dominio.nombreDpto(d),
    dptosDisponibles: Dominio.DPTOS.map(function (k) { return { sigla: k, nombre: Dominio.nombreDpto(k) }; }),
    catalogo: catalogo,
    cursos: cursos,
    asignaciones: asignacionesDpto,
    balance: balance,
    bloqueo: bloqueo,
    usuario: u
  };
}

/* ============================================================
   6. Guardado Atómico de Asignaciones
   ============================================================ */

function guardarAsignaciones(ciclo, dpto, listaAsignaciones, motivo) {
  const u = exigirUsuario_();
  const c = validarCiclo_(ciclo);
  const d = Dominio.normalizarDpto(dpto) || dpto;

  return conCandado_(function () {
    const b = bloqueoDeDpto_(c, d);
    if (b && b.correo !== u.correo) {
      throw new Error("La carga del departamento " + d + " está siendo editada por " + b.correo + ".");
    }

    const todas = leerTabla_("Asignaciones");
    const dptoNorm = Dominio.normalizarDpto(d);

    const otras = todas.filter(function (a) {
      return !(a.ciclo === c && (Dominio.normalizarDpto(a.departamento) || a.departamento) === dptoNorm);
    });

    const ahora = new Date().toISOString();
    const nuevasFilas = (listaAsignaciones || []).map(function (a) {
      return [
        c,
        d,
        a.carrera || "",
        a.codigo || "",
        a.asignatura || "",
        String(a.grupo || "1"),
        a.componente || "Completo",
        a.docente || "",
        String(a.horas || "0"),
        a.condicion || "",
        a.reemplazo_de || "",
        a.fecha_asignacion || ahora
      ];
    });

    const valoresFinales = otras.map(function (a) {
      return [
        a.ciclo, a.departamento, a.carrera, a.codigo, a.asignatura,
        a.grupo, a.componente, a.docente, a.horas, a.condicion, a.reemplazo_de, a.fecha_asignacion
      ];
    }).concat(nuevasFilas);

    reemplazarFilas_("Asignaciones", valoresFinales);
    renovarBloqueoDpto(c, d);

    return {
      ok: true,
      guardadas: nuevasFilas.length,
      fecha: ahora,
      ciclo: c,
      departamento: d
    };
  });
}
