// @ts-check
/* Advertencias de las pestañas de datos de la hoja del sistema, celda por celda. Son
   funciones puras (no usan servicios de Google): reciben las celdas tal como se ven
   (valoresPestana_) y devuelven los avisos. Leen las pestañas con lo mismo que la app: los
   nombres de carrera y departamento, las columnas de la oferta y de la carga y los límites
   de horas de Dominio, y el catálogo de catalogoDesdeFilas_. Las horas de cada docente se
   estiman sobre las celdas, antes de aplicar la carga en la app.
   Niveles: «error» (la app descarta o rechaza el dato), «advertencia» (la app lo acepta,
   pero conviene revisarlo) y «observacion» (no cambia lo que hace la app). */

/** @type {NivelHoja[]} De más a menos grave. */
var NIVELES_HOJA_ = ["error", "advertencia", "observacion"];

/**
 * Añade un aviso de una celda a la lista.
 * @param {AvisoCelda[]} lista
 * @param {string} hoja Nombre completo de la pestaña.
 * @param {number} fila Desde 1.
 * @param {number} col Desde 1.
 * @param {NivelHoja} nivel
 * @param {string} codigo
 * @param {string} mensaje
 * @returns {void}
 */
function avisarCelda_(lista, hoja, fila, col, nivel, codigo, mensaje) {
  lista.push({ hoja: hoja, fila: fila, col: col, nivel: nivel, codigo: codigo, mensaje: mensaje });
}

/**
 * @param {*} v
 * @returns {boolean}
 */
function celdaVacia_(v) { return String(v == null ? "" : v).trim() === ""; }

/**
 * @param {Array<*>} f
 * @returns {boolean}
 */
function filaVacia_(f) { return !f || f.every(celdaVacia_); }

/**
 * «4», «1.5» o «1,5».
 * @param {*} v
 * @returns {boolean}
 */
function esNumeroCelda_(v) { return /^-?\d+([.,]\d+)?$/.test(String(v).trim()); }

/**
 * @param {*} v
 * @returns {boolean}
 */
function esEnteroCelda_(v) { return /^-?\d+$/.test(String(v).trim()); }

/* ============================================================
   Oferta por carrera: pestañas «Oferta - …», una por carrera
   ============================================================ */

/**
 * Filas de la oferta tal como las lee la app: columnas de Dominio.deducirColumnas y grupo
 * de la columna GRUPO o de SEMESTRE («1-2» = semestre 1, grupo 2). r: índice de la fila.
 * @param {string[][]} valores
 * @param {string} original Nombre de la pestaña sin el prefijo.
 * @returns {{filaCab: number, mapa: Object<string, number>, sigla: (Sigla|null), filas: Array<Object>}|null} null si no hay fila de cabeceras.
 */
function leerOfertaHoja_(valores, original) {
  if (!Dominio.ubicarCabeceras(valores)) return null;
  const columnas = Dominio.deducirColumnas(valores);
  const mapa = columnas.mapa;
  const val = function (f, k) { return mapa[k] !== undefined && f[mapa[k]] != null ? String(f[mapa[k]]).trim() : ""; };
  const filas = [];
  for (let r = columnas.filaCab + 1; r < valores.length; r++) {
    const f = valores[r] || [];
    if (filaVacia_(f)) continue;
    const ds = Dominio.descomponerSemestre(val(f, "SEMESTRE"));
    const grupoCol = val(f, "GRUPO");
    filas.push({
      r: r, codigo: val(f, "CODIGO"), nombre: val(f, "ASIGNATURA"), carrera: val(f, "CARRERA"),
      semestre: val(f, "SEMESTRE"), semOk: !isNaN(ds.sem),
      grupo: grupoCol !== "" ? grupoCol : String(!isNaN(ds.grupo) ? ds.grupo : 1), grupoCol: grupoCol,
      ht: val(f, "HT"), hp: val(f, "HP"), th: val(f, "TOTAL HORAS"), dpto: val(f, "DPTO"), obs: val(f, "OBSERVACIONES")
    });
  }
  return { filaCab: columnas.filaCab, mapa: mapa, sigla: Dominio.siglaDeCarrera(original) || siglaMayoritaria_(valores), filas: filas };
}

/**
 * Avisos de las pestañas de oferta (juntas, para ver las carreras repetidas).
 * @param {PestanaRevisada[]} pestanas
 * @returns {AvisoCelda[]}
 */
function revisarOfertaHoja_(pestanas) {
  const lista = [], vistas = {};
  pestanas.forEach(function (h) {
    const o = leerOfertaHoja_(h.valores, h.original);
    if (!o) {
      if (!h.valores.every(filaVacia_)) avisarCelda_(lista, h.nombre, 1, 1, "error", "SIN_CABECERA", "No se reconoce la fila de cabeceras: la app deduce las columnas por su contenido.");
      return;
    }
    const colDe = function (k) { return o.mapa[k] !== undefined ? o.mapa[k] + 1 : 1; };
    const filaCab = o.filaCab + 1;
    if (!o.sigla) {
      avisarCelda_(lista, h.nombre, filaCab, 1, "error", "HOJA_DESCONOCIDA", "La pestaña «" + h.nombre + "» no corresponde a ninguna carrera conocida: la app no la lee.");
      return;
    }
    if (vistas[o.sigla]) {
      avisarCelda_(lista, h.nombre, filaCab, 1, "error", "HOJA_REPETIDA", "Repite la carrera " + o.sigla + " de la pestaña «" + vistas[o.sigla] + "»: la app solo lee la primera.");
      return;
    }
    vistas[o.sigla] = h.nombre;
    const claves = {};
    o.filas.forEach(function (x) {
      const fila = x.r + 1;
      if (!x.codigo && !x.nombre) avisarCelda_(lista, h.nombre, fila, colDe("CODIGO"), "observacion", "SIN_CURSO", "Fila sin código ni asignatura: la app la toma como una asignatura aparte.");
      else if (!x.codigo) avisarCelda_(lista, h.nombre, fila, colDe("CODIGO"), "observacion", "SIN_CODIGO", "Sin código: la app agrupa esta fila por el nombre de la asignatura.");
      if (x.carrera && Dominio.siglaDeCarrera(x.carrera) !== o.sigla) {
        avisarCelda_(lista, h.nombre, fila, colDe("CARRERA"), "advertencia", "OTRA_CARRERA", "La fila dice «" + x.carrera + "», que no es " + o.sigla + ": la app la ignora en este plan.");
        return;
      }
      const clave = (x.codigo || x.nombre) + "|" + x.grupo;
      if (x.codigo || x.nombre) {
        if (claves[clave]) avisarCelda_(lista, h.nombre, fila, colDe("CODIGO"), "error", "FILA_REPETIDA", "Código " + (x.codigo || x.nombre) + " con grupo " + x.grupo + " repetido (fila " + claves[clave] + "): la app no lee esta fila.");
        else claves[clave] = fila;
      }
      if (celdaVacia_(x.semestre)) avisarCelda_(lista, h.nombre, fila, colDe("SEMESTRE"), "advertencia", "SIN_SEMESTRE", "Sin semestre: la app la pone en el bloque «Sin semestre».");
      else if (!x.semOk) avisarCelda_(lista, h.nombre, fila, colDe("SEMESTRE"), "advertencia", "SEMESTRE_TEXTO", "Semestre «" + x.semestre + "» no reconocido: la app crea un bloque con ese texto. Usa 5 o 1-2.");
      ["HT", "HP"].forEach(function (k) {
        const v = k === "HT" ? x.ht : x.hp;
        if (!celdaVacia_(v) && !esNumeroCelda_(v)) avisarCelda_(lista, h.nombre, fila, colDe(k), "advertencia", k + "_TEXTO", k + " «" + v + "» no es un número: la app conserva el texto y suma " + Dominio.num(v) + " h.");
      });
      if (esNumeroCelda_(x.ht) && esNumeroCelda_(x.hp) && esNumeroCelda_(x.th) && Math.abs(Dominio.num(x.th) - Dominio.num(x.ht) - Dominio.num(x.hp)) > 0.001)
        avisarCelda_(lista, h.nombre, fila, colDe("TOTAL HORAS"), "observacion", "TOTAL_DISTINTO", "El total (" + x.th + ") no es HT + HP (" + (Dominio.num(x.ht) + Dominio.num(x.hp)) + "): la app usa HT + HP.");
      if (!celdaVacia_(x.dpto) && !Dominio.normalizarDpto(x.dpto))
        avisarCelda_(lista, h.nombre, fila, colDe("DPTO"), "advertencia", "DPTO_DESCONOCIDO", "Departamento «" + x.dpto + "» no reconocido (" + Dominio.DPTOS.join(", ") + ").");
      if (x.grupoCol !== "" && !esEnteroCelda_(x.grupoCol))
        avisarCelda_(lista, h.nombre, fila, colDe("GRUPO"), "advertencia", "GRUPO_TEXTO", "Grupo «" + x.grupoCol + "» no es un número entero.");
    });
  });
  return lista;
}

/**
 * Cursos de la oferta por carrera|C|código|grupo y carrera|N|nombre|grupo, para cruzarlos
 * con la carga por departamento.
 * @param {PestanaRevisada[]} pestanas
 * @returns {Object<string, {ht: string, hp: string, obs: string}>}
 */
function indiceOfertaHoja_(pestanas) {
  /** @type {Object<string, {ht: string, hp: string, obs: string}>} */
  const idx = {};
  pestanas.forEach(function (h) {
    const o = leerOfertaHoja_(h.valores, h.original);
    if (!o || !o.sigla) return;
    o.filas.forEach(function (x) {
      const n = String(x.grupo).trim();
      if (x.codigo) idx[o.sigla + "|C|" + x.codigo + "|" + n] = x;
      if (x.nombre) idx[o.sigla + "|N|" + Dominio.normalizar(x.nombre) + "|" + n] = x;
    });
  });
  return idx;
}

/* ============================================================
   Catálogo de docentes: pestaña «Docentes - General»
   ============================================================ */

/**
 * Avisos del catálogo, leído con catalogoDesdeFilas_ como lo lee la app.
 * @param {PestanaRevisada} pestana
 * @returns {AvisoCelda[]}
 */
function revisarCatalogoHoja_(pestana) {
  const lista = [];
  const cat = catalogoDesdeFilas_(pestana.valores);
  if (!cat) {
    if (!pestana.valores.every(filaVacia_))
      avisarCelda_(lista, pestana.nombre, 1, 1, "error", "CATALOGO_SIN_CABECERAS", "No se reconocen las cabeceras (NOMBRES con APELLIDO PATERNO o DNI): la app no tendrá catálogo de docentes.");
    return lista;
  }
  const c = cat.col, dnis = {}, L = Dominio.LIMITES;
  const colDe = function (k) { return c[k] !== undefined ? c[k] + 1 : 1; };
  cat.docentes.forEach(function (d) {
    const fila = d.r + 1;
    if (!d.pat && !d.nom) {
      const resumen = /TOTAL/i.test([d.dni, d.dptoTexto, d.dedicTexto, d.condicion].join(" "));
      if (!resumen && (d.dni || d.dptoTexto || d.dedicTexto || d.condicion))
        avisarCelda_(lista, pestana.nombre, fila, colDe("pat"), "advertencia", "SIN_NOMBRE", "Fila con datos pero sin apellidos ni nombres: la app la salta.");
      return;
    }
    if (!d.dni) avisarCelda_(lista, pestana.nombre, fila, colDe("dni"), "advertencia", "SIN_DNI", "Docente sin DNI: la app lo reconoce solo por su nombre.");
    else if (dnis[d.dni]) avisarCelda_(lista, pestana.nombre, fila, colDe("dni"), "error", "DNI_REPETIDO", "DNI " + d.dni + " repetido (fila " + dnis[d.dni] + ").");
    else dnis[d.dni] = fila;
    if (c.dpto !== undefined && (!d.dptoTexto || !Dominio.normalizarDpto(d.dptoTexto)))
      avisarCelda_(lista, pestana.nombre, fila, colDe("dpto"), "advertencia", "DPTO_DESCONOCIDO", d.dptoTexto ? "Departamento «" + d.dptoTexto + "» no reconocido." : "Sin departamento.");
    if (c.dedic !== undefined && !d.dedicacion)
      avisarCelda_(lista, pestana.nombre, fila, colDe("dedic"), "advertencia", "DEDICACION", "Sin dedicación (TC o TP): la app no revisa sus mínimos de horas.");
    else if (c.dedic !== undefined && !d.dedicClara)
      avisarCelda_(lista, pestana.nombre, fila, colDe("dedic"), "advertencia", "DEDICACION", "Dedicación «" + d.dedicTexto + "» no reconocida: la app la toma como tiempo parcial (TP).");
    if (c.lectivas !== undefined && esNumeroCelda_(d.lectivas)) {
      const h = Dominio.num(d.lectivas), ord = /ORDINARIO/.test(Dominio.normalizar(d.condicion));
      if (h > L.MAXIMO) avisarCelda_(lista, pestana.nombre, fila, colDe("lectivas"), "error", "A07", "A07 · " + h + " h lectivas: supera el máximo de " + L.MAXIMO + " h.");
      else if (ord && h > L.ORDINARIO) avisarCelda_(lista, pestana.nombre, fila, colDe("lectivas"), "advertencia", "A09", "A09 · Ordinario con " + h + " h: supera " + L.ORDINARIO + " h.");
      else if (d.dedicacion === "TP" && h > 0 && h < L.MINIMO_TP) avisarCelda_(lista, pestana.nombre, fila, colDe("lectivas"), "advertencia", "A10", "A10 · Tiempo parcial con " + h + " h: menos de " + L.MINIMO_TP + " h.");
    }
  });
  return lista;
}

/* ============================================================
   Carga por departamento: pestañas «Carga - …», el docente una vez y sus cursos debajo,
   con filas de TOTAL
   ============================================================ */

/**
 * Cursos y subtotales de una pestaña de carga, con las columnas de Dominio.ubicarColumnasCarga.
 * La columna TOTAL solo sirve aquí, para revisar los subtotales: la app no la usa.
 * @param {string[][]} valores
 * @returns {{conCabecera: boolean, col: Object<string, number>, cursos: Array<Object>, totales: Array<Object>}}
 */
function leerCargaHoja_(valores) {
  const u = Dominio.ubicarColumnasCarga(valores);
  const cabecera = (valores[u.cab] || []).map(Dominio.normalizar);
  const textoDocente = cabecera[u.col.DOCENTE] || "";
  const conCabecera = textoDocente.indexOf("DOCENTE") >= 0 || textoDocente.indexOf("PROFESOR") >= 0;
  /** @type {Object<string, number>} */
  const col = Object.assign({}, u.col);
  if (conCabecera) cabecera.forEach(function (c, j) { if (col.TOTAL === undefined && c.indexOf("TOTAL") >= 0) col.TOTAL = j; });
  const val = function (f, k) { return col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : ""; };
  const cursos = [], totales = [];
  let docente = "", filaDocente = 0, bloque = null;
  for (let r = (conCabecera ? u.cab : -1) + 1; r < valores.length; r++) {
    const f = valores[r] || [];
    if (filaVacia_(f)) continue;
    /* Como la app: una fila con «TOTAL…» no es curso ni cambia el docente. El subtotal de
       cada docente es la fila que sigue a sus cursos con solo un número (o «TOTAL» y un
       número); las de «TOTAL HORAS … POR SEMANA» y similares resumen el departamento. */
    const textos = f.filter(function (c) { return !celdaVacia_(c) && !esNumeroCelda_(c); }).map(Dominio.normalizar);
    const esTotal = textos.some(function (t) { return t.indexOf("TOTAL") === 0; });
    const subtotal = !val(f, "CODIGO") && !val(f, "ASIGNATURA") && !val(f, "DOCENTE") && (textos.length === 0 || (textos.length === 1 && textos[0] === "TOTAL"));
    if (esTotal || subtotal) {
      if (subtotal && bloque && bloque.n) {
        let jNum = col.TOTAL !== undefined && esNumeroCelda_(val(f, "TOTAL")) ? col.TOTAL : -1;
        for (let j = f.length - 1; jNum < 0 && j >= 0; j--) if (esNumeroCelda_(f[j])) jNum = j;
        if (jNum >= 0) totales.push({ r: r, docente: bloque.docente, suma: Math.round(bloque.suma * 100) / 100, total: Dominio.num(f[jNum]), col: jNum });
      }
      bloque = null;
      continue;
    }
    if (val(f, "DOCENTE")) { docente = val(f, "DOCENTE"); filaDocente = r; bloque = { docente: docente, suma: 0, n: 0 }; }
    const codigo = val(f, "CODIGO"), nombre = val(f, "ASIGNATURA");
    if (!docente || (!codigo && !nombre)) continue;
    const ds = Dominio.descomponerSemestre(val(f, "SEMESTRE"));
    const grupoCol = val(f, "GRUPO");
    const ht = Dominio.num(val(f, "HT")), hp = Dominio.num(val(f, "HP"));
    /* El subtotal suma la columna TOTAL de cada curso (una fusión deja vacía la fila repetida); sin ella, HT + HP. */
    if (bloque) { bloque.suma += col.TOTAL !== undefined ? Dominio.num(val(f, "TOTAL")) : ht + hp; bloque.n++; }
    cursos.push({
      r: r, docente: docente, filaDocente: filaDocente, carreraTexto: val(f, "CARRERA"), carrera: Dominio.siglaDeCarrera(val(f, "CARRERA")),
      codigo: codigo, nombre: nombre, sem: !isNaN(ds.sem) ? ds.sem : null,
      grupo: grupoCol !== "" ? String(Dominio.num(grupoCol) || grupoCol) : String(!isNaN(ds.grupo) ? ds.grupo : 1),
      ht: ht, hp: hp, condicion: val(f, "CONDICION")
    });
  }
  return { conCabecera: conCabecera, col: col, cursos: cursos, totales: totales };
}

/**
 * Horas que la app le cuenta a una fila: las de su sección en la oferta (teoría si la fila
 * trae HT, práctica si trae HP; sin horas, toda la sección). Sin oferta, las de la fila.
 * @param {{ht: number, hp: number}} x
 * @param {{ht: string, hp: string}|null} enOferta
 * @returns {number}
 */
function horasDeFilaCarga_(x, enOferta) {
  if (!enOferta) return x.ht + x.hp;
  const t = Dominio.num(enOferta.ht), p = Dominio.num(enOferta.hp);
  if (!x.ht && !x.hp) return t + p;
  return (x.ht > 0 ? t : 0) + (x.hp > 0 ? p : 0);
}

/**
 * Avisos de las pestañas de carga: cursos que la app no encontrará y los límites de horas
 * de cada docente (A07 a A15).
 * @param {PestanaRevisada[]} pestanas
 * @param {{oferta: Object<string, {ht: string, hp: string, obs: string}>, catalogo: FilaCatalogo[]}} ctx
 * @returns {AvisoCelda[]}
 */
function revisarCargaHoja_(pestanas, ctx) {
  const lista = [], porClave = {}, catalogo = {}, L = Dominio.LIMITES;
  ctx.catalogo.forEach(function (d) { catalogo[Dominio.claveDocente(d.nombreCompleto)] = d; });
  const hayCatalogo = ctx.catalogo.length > 0;
  const hayOferta = Object.keys(ctx.oferta).length > 0;

  pestanas.forEach(function (h) {
    const c = leerCargaHoja_(h.valores);
    if (!c.conCabecera) {
      if (!h.valores.every(filaVacia_)) avisarCelda_(lista, h.nombre, 1, 1, "advertencia", "SIN_CABECERA", "No se reconoce la cabecera (DOCENTE con CÓDIGO o ASIGNATURA): la app usa las columnas habituales.");
      return;
    }
    const colDe = function (k) { return c.col[k] !== undefined ? c.col[k] + 1 : 1; };
    const avisadoCatalogo = {};
    c.cursos.forEach(function (x) {
      const fila = x.r + 1;
      const clave = Dominio.claveDocente(x.docente);
      if (!x.carreraTexto && !x.codigo) {
        avisarCelda_(lista, h.nombre, fila, colDe("ASIGNATURA"), "observacion", "FILA_SUELTA", "«" + x.nombre + "» no tiene carrera ni código: la app la lee como un curso de " + x.docente + " y no la aplica.");
        return;
      }
      if (hayCatalogo && !catalogo[clave] && !avisadoCatalogo[x.filaDocente]) {
        avisadoCatalogo[x.filaDocente] = true;
        avisarCelda_(lista, h.nombre, x.filaDocente + 1, colDe("DOCENTE"), "advertencia", "FUERA_CATALOGO", "«" + x.docente + "» no está en el catálogo de docentes: al aplicar la carga habrá que elegirlo a mano.");
      }
      if (!x.carrera) {
        avisarCelda_(lista, h.nombre, fila, colDe("CARRERA"), "advertencia", "CARRERA_DESCONOCIDA", (x.carreraTexto ? "Carrera «" + x.carreraTexto + "» desconocida" : "Sin carrera") + ": la app no la asocia a ninguna sección.");
        return;
      }
      const enOferta = (x.codigo && ctx.oferta[x.carrera + "|C|" + x.codigo + "|" + x.grupo]) || (x.nombre && ctx.oferta[x.carrera + "|N|" + Dominio.normalizar(x.nombre) + "|" + x.grupo]) || null;
      if (hayOferta && !enOferta) {
        avisarCelda_(lista, h.nombre, fila, colDe("CODIGO"), "advertencia", "FUERA_OFERTA", x.carrera + " " + (x.codigo || x.nombre) + " (grupo " + x.grupo + ") no está en la oferta: la app no encuentra su sección.");
        return;
      }
      const p = porClave[clave] || (porClave[clave] = { docente: x.docente, horas: 0, celdas: [], cursos: [], internacional: true, fusiones: {} });
      /* Una fusión es una sola sección: la app no cuenta dos veces sus horas. */
      const fusion = enOferta && /FUSI/i.test(enOferta.obs) ? Dominio.normalizar(x.nombre) : "";
      if (!fusion || !p.fusiones[fusion]) p.horas += horasDeFilaCarga_(x, enOferta);
      if (fusion) p.fusiones[fusion] = true;
      if (!p.celdas.some(function (z) { return z.hoja === h.nombre && z.fila === x.filaDocente + 1; }))
        p.celdas.push({ hoja: h.nombre, fila: x.filaDocente + 1, col: colDe("DOCENTE") });
      p.cursos.push({ hoja: h.nombre, fila: fila, col: colDe("CODIGO"), carrera: x.carrera, sem: x.sem, codigo: x.codigo });
      if (!/INTERNACIONAL|VIRTUAL/i.test(enOferta ? enOferta.obs : x.condicion)) p.internacional = false;
    });
    c.totales.forEach(function (t) {
      if (Math.abs(t.suma - t.total) > 0.001)
        avisarCelda_(lista, h.nombre, t.r + 1, t.col + 1, "observacion", "TOTAL_DISTINTO", "El TOTAL (" + t.total + ") no es la suma de los cursos de " + t.docente + " (" + t.suma + " h).");
    });
  });

  Object.keys(porClave).forEach(function (k) {
    const p = porClave[k], d = catalogo[k] || null, h = Math.round(p.horas * 100) / 100;
    const marcar = function (nivel, codigo, mensaje) { p.celdas.forEach(function (z) { avisarCelda_(lista, z.hoja, z.fila, z.col, nivel, codigo, mensaje); }); };
    if (h > L.MAXIMO) marcar("error", "A07", "A07 · " + p.docente + " suma " + h + " h lectivas: supera las " + L.MAXIMO + " h y la app no guardará su carga.");
    if (d && d.tcOtra && h > L.TC_OTRA) marcar("advertencia", "A08", "A08 · Tiempo completo en otra universidad con " + h + " h: supera " + L.TC_OTRA + " h.");
    if (d && /ORDINARIO/.test(Dominio.normalizar(d.condicion)) && h > L.ORDINARIO) marcar("advertencia", "A09", "A09 · Ordinario con " + h + " h: supera " + L.ORDINARIO + " h.");
    if (d && d.dedicacion === "TP" && h > 0 && h < L.MINIMO_TP && !p.internacional) marcar("advertencia", "A10", "A10 · Tiempo parcial con " + h + " h: menos de " + L.MINIMO_TP + " h.");
    if (d && d.cargo && h > L.CARGO_SEVERO) marcar("error", "A12", "A12 · Con cargo (" + d.cargo + ") y " + h + " h: pasa de " + L.CARGO_SEVERO + " h; la app pedirá un motivo.");
    else if (d && d.cargo && h > L.CARGO) marcar("advertencia", "A12", "A12 · Con cargo (" + d.cargo + ") y " + h + " h: pasa de las " + L.CARGO + " h recomendadas.");
    if (d && d.dedicacion === "TC" && d.noLectivas !== null && h + d.noLectivas < L.JORNADA_TC) marcar("advertencia", "A15", "A15 · Tiempo completo: " + h + " h lectivas + " + d.noLectivas + " h no lectivas no cubren sus " + L.JORNADA_TC + " h.");
    /* A11: dos cursos distintos en el mismo semestre de una carrera. */
    const porSem = {};
    p.cursos.forEach(function (cu) {
      if (!cu.carrera || cu.sem == null || !cu.codigo) return;
      const s = cu.carrera + "|" + cu.sem;
      (porSem[s] = porSem[s] || []).push(cu);
    });
    Object.keys(porSem).forEach(function (s) {
      const l = porSem[s], codigos = [];
      l.forEach(function (cu) { if (codigos.indexOf(cu.codigo) < 0) codigos.push(cu.codigo); });
      if (codigos.length > 1) {
        const partes = s.split("|");
        l.forEach(function (cu) { avisarCelda_(lista, cu.hoja, cu.fila, cu.col, "advertencia", "A11", "A11 · " + p.docente + " dicta " + codigos.length + " cursos distintos en " + partes[0] + ", semestre " + partes[1] + " (" + codigos.join(", ") + ")."); });
      }
    });
  });
  return lista;
}

/* ============================================================
   Usuarios: la tabla de cuentas y roles
   ============================================================ */

/**
 * Avisos de la pestaña Usuarios, con las reglas con que la app reconoce cada cuenta
 * (comun/Acceso.js).
 * @param {PestanaRevisada} pestana
 * @param {string} dominio Dominio de las cuentas (SIS_DOMINIO).
 * @returns {AvisoCelda[]}
 */
function revisarUsuariosHoja_(pestana, dominio) {
  const lista = [], vistos = {}, v = pestana.valores, h = pestana.nombre;
  const dom = String(dominio || "").toLowerCase();
  const tokens = function (t) { return t.split(/[,;\/\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
  for (let r = 1; r < v.length; r++) {
    const f = v[r] || [];
    if (filaVacia_(f.slice(0, 4))) continue;
    const fila = r + 1;
    const correo = String(f[0] || "").trim().toLowerCase(), rol = rolNormalizado_(f[1]), carreras = String(f[2] || "").trim(), dpto = String(f[3] || "").trim();
    if (!correo) { avisarCelda_(lista, h, fila, 1, "error", "SIN_CORREO", "Fila sin correo: la app no la usa."); continue; }
    if (!/^[^@\s]+@[^@\s]+$/.test(correo) || correo.split("@")[1] !== dom)
      avisarCelda_(lista, h, fila, 1, "error", "FUERA_DOMINIO", "«" + correo + "» no es una cuenta @" + dom + ": la app le niega el acceso.");
    if (vistos[correo]) avisarCelda_(lista, h, fila, 1, "error", "CORREO_REPETIDO", "Correo repetido (fila " + vistos[correo] + "): la app usa la primera fila.");
    else vistos[correo] = fila;
    if (!rol) { avisarCelda_(lista, h, fila, 2, "error", "ROL", (String(f[1] || "").trim() ? "Rol «" + f[1] + "» no válido" : "Sin rol") + " (director o coordinador): la app le niega el acceso."); continue; }
    if (rol === "director") {
      const validos = [];
      tokens(dpto).forEach(function (t) {
        const sd = Dominio.normalizarDpto(t);
        if (!sd) avisarCelda_(lista, h, fila, 4, "advertencia", "DPTO_DESCONOCIDO", "Departamento «" + t + "» no reconocido (" + Dominio.DPTOS.join(", ") + "): la app lo ignora.");
        else if (validos.indexOf(sd) < 0) validos.push(sd);
      });
      if (!validos.length) avisarCelda_(lista, h, fila, 4, "advertencia", "SIN_DEPARTAMENTO", "Director sin departamento válido: entra a la app, pero no puede asignar docentes.");
      else if (validos.length > 1) avisarCelda_(lista, h, fila, 4, "observacion", "VARIOS_DPTOS", "Varios departamentos: la app solo usa el primero (" + validos[0] + ").");
      if (carreras) avisarCelda_(lista, h, fila, 3, "observacion", "CARRERAS_DIRECTOR", "Un director no coordina carreras: la app ignora esta columna.");
    } else {
      const siglas = [];
      tokens(carreras).forEach(function (t) {
        const sc = Dominio.siglaDeCarrera(t);
        if (!sc) avisarCelda_(lista, h, fila, 3, "advertencia", "CARRERA_DESCONOCIDA", "Carrera «" + t + "» desconocida (" + Dominio.CARRERAS.map(function (c) { return c.sig; }).join(", ") + "): la app la ignora.");
        else if (siglas.indexOf(sc) < 0) siglas.push(sc);
      });
      if (!siglas.length) avisarCelda_(lista, h, fila, 3, "advertencia", "SIN_CARRERAS", "Coordinador sin carreras válidas: solo podrá consultar.");
      if (dpto) avisarCelda_(lista, h, fila, 4, "observacion", "DPTO_COORDINADOR", "Un coordinador no tiene departamento: la app ignora esta columna.");
    }
  }
  return lista;
}

/**
 * Ordena los avisos (en el sitio) por nivel, pestaña, fila y columna, y devuelve la lista.
 * @param {AvisoCelda[]} lista
 * @returns {AvisoCelda[]}
 */
function ordenarAvisosHoja_(lista) {
  return lista.sort(function (a, b) {
    return NIVELES_HOJA_.indexOf(a.nivel) - NIVELES_HOJA_.indexOf(b.nivel) ||
      (a.hoja < b.hoja ? -1 : a.hoja > b.hoja ? 1 : 0) || a.fila - b.fila || a.col - b.col;
  });
}
