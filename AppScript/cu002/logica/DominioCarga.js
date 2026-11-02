// @ts-check
/* Dominio de CU-002 «Asignar docentes al plan de ciclo». Lo combina base/Dominio.js. Se
   usa en el servidor y, como texto, en el navegador (fuenteDominio_), así que no puede usar
   nada definido fuera de su fábrica. */

/**
 * CU-002 «Asignar docentes al plan de ciclo»: secciones, balance, advertencias y lectura
 * de CargaXDepartamento. C: lo que devuelve crearDominioComun_().
 * @param {ReturnType<typeof crearDominioComun_>} C
 * @returns Todas sus declaraciones.
 */
function crearDominioCarga_(C) {
  "use strict";

  const {
    descomponerSemestre, dptoDeCarrera, DPTOS, esInternacional, ESTADOS, normalizar, num, siglaDeCarrera
  } = C;

  /* ============================================================
     Asignación docente: secciones que se asignan, balance y advertencias
     ============================================================ */
  const DPTOS_INFO = {
    DIMA: { sigla: "DIMA", nombre: "Departamento de Ingeniería y Matemáticas", alias: ["INGENIERIA Y MATEMATICAS", "INGENIERIA", "MATEMATICAS", "DIMA"] },
    DAHUC: { sigla: "DAHUC", nombre: "Departamento de Humanidades y Comunicación", alias: ["HUMANIDADES Y COM.", "HUMANIDADES Y CIENCIAS SOCIALES", "HUMANIDADES", "COMUNICACION", "DAHUC", "DAHU"] },
    DACJ: { sigla: "DACJ", nombre: "Departamento de Ciencias Jurídicas", alias: ["CIENCIAS JURIDICAS", "DERECHO", "DACJ"] },
    DACTE: { sigla: "DACTE", nombre: "Departamento de Ciencias y Tecnologías Empresariales", alias: ["CS. Y TEC. EMPRESARIALES", "CIENCIAS Y TECNOLOGIAS EMPRESARIALES", "EMPRESARIALES", "DACTE"] }
  };

  /**
   * Sigla del departamento a partir de su sigla, nombre o alias; null si no se reconoce.
   * @param {*} s
   * @returns {Dpto|null}
   */
  function normalizarDpto(s) {
    if (!s) return null;
    const n = normalizar(s);
    if (!n) return null;
    for (const sigla of /** @type {Dpto[]} */ (Object.keys(DPTOS_INFO))) {
      if (sigla === n) return sigla;
      const alist = DPTOS_INFO[sigla].alias;
      for (let i = 0; i < alist.length; i++) {
        const al = normalizar(alist[i]);
        if (al === n || n.indexOf(al) >= 0 || (n.length >= 4 && al.indexOf(n) >= 0)) return sigla;
      }
    }
    return null;
  }

  /**
   * Nombre completo de un departamento (o la sigla, si no se conoce).
   * @param {string} sigla
   * @returns {string}
   */
  function nombreDpto(sigla) {
    const info = DPTOS_INFO[sigla];
    return info ? info.nombre : sigla;
  }

  /**
   * Nombre de docente normalizado para compararlo, sin comas ni puntos.
   * @param {*} nombre
   * @returns {string}
   */
  function claveDocente(nombre) {
    return normalizar(nombre).replace(/[,.\-–—]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Límites de carga lectiva semanal. MAXIMO no se puede superar (A07); los demás avisan. */
  const LIMITES = { MAXIMO: 40, TC_OTRA: 16, ORDINARIO: 24, CARGO: 20, CARGO_SEVERO: 24, MINIMO_TP: 8, JORNADA_TC: 40 };

  const PENDIENTE_INTERNACIONAL = "PENDIENTE INTERNACIONAL";
  const esPendienteInternacional = a => normalizar(a.condicion) === PENDIENTE_INTERNACIONAL && !String(a.docente || "").trim();

  /**
   * Partes de una sección que se asignan por separado. Sin desdoble: teoría y práctica.
   * Con desdoble de práctica ×n: la teoría común y n subgrupos de práctica (y al revés).
   * @param {number} ht
   * @param {number} hp
   * @param {string|null} desdoble
   * @returns {Componente[]}
   */
  function componentesDe(ht, hp, desdoble) {
    const d = String(desdoble || "").match(/^(PRA|TEO)\D*(\d+)/i);
    const tipo = d ? d[1].toUpperCase() : null;
    const n = d ? Math.max(2, parseInt(d[2], 10) || 2) : 0;
    /** @type {Componente[]} */
    const c = [];
    if (tipo === "TEO") for (let i = 1; i <= n; i++) c.push({ c: "T" + i, tipo: "T", nombre: "Teoría · subgrupo " + i, horas: ht });
    else if (ht > 0) c.push({ c: "T", tipo: "T", nombre: "Teoría", horas: ht });
    if (tipo === "PRA") for (let i = 1; i <= n; i++) c.push({ c: "P" + i, tipo: "P", nombre: "Práctica · subgrupo " + i, horas: hp });
    else if (hp > 0) c.push({ c: "P", tipo: "P", nombre: "Práctica", horas: hp });
    if (!c.length) c.push({ c: "C", tipo: "C", nombre: "Curso", horas: 0 });
    return c;
  }

  /**
   * Secciones que piden docente en un ciclo. Una sección es un grupo o, si está fusionado,
   * toda su fusión (aunque reúna grupos de varias carreras): se asigna una vez y sus horas
   * cuentan una vez. Toma los datos del grupo principal, también el departamento.
   * planes: [{sig, estado, contenido}]. Solo cuentan las secciones con algún grupo en un
   * plan Registrado.
   * @param {Array<{sig: Sigla, estado: string, contenido: Asignatura[]}>} planes
   * @returns {Seccion[]}
   */
  function unidadesDelCiclo(planes) {
    const grupos = [];
    (planes || []).forEach(p => (p.contenido || []).forEach(a => a.grupos.forEach(g =>
      grupos.push({ sig: p.sig, registrado: p.estado === ESTADOS.REGISTRADO, a: a, g: g }))));
    const porMarca = new Map();
    grupos.forEach(x => {
      if (!x.g.fusion) return;
      if (!porMarca.has(x.g.fusion)) porMarca.set(x.g.fusion, []);
      porMarca.get(x.g.fusion).push(x);
    });
    const unidades = [], vistas = new Set();
    grupos.forEach(x => {
      let miembros = [x];
      const m = x.g.fusion ? porMarca.get(x.g.fusion) : null;
      if (m && m.length >= 2) {
        if (vistas.has(x.g.fusion)) return;
        vistas.add(x.g.fusion);
        miembros = m;
      }
      if (!miembros.some(y => y.registrado)) return;
      const p = miembros.find(y => y.g.fusionPrincipal) || miembros[0];
      const ht = num(p.g.ht), hp = num(p.g.hp);
      const propio = dptoDeCarrera(p.sig);
      const derivado = DPTOS.includes(p.a.derivado) && p.a.derivado !== propio ? p.a.derivado : null;
      unidades.push({
        id: p.g.id, fusion: miembros.length > 1 ? x.g.fusion : null,
        carrera: p.sig, codigo: p.a.codigo, nombre: p.a.nombre, sem: p.a.sem, malla: p.a.malla, n: p.g.n,
        dpto: derivado || propio, derivada: !!derivado, dptoAsignatura: normalizarDpto(p.a.dpto) || String(p.a.dpto || "").trim(),
        obs: p.a.obs || "", intl: esInternacional(p.a),
        ht: ht, hp: hp, desdoble: p.g.desdoble || null,
        componentes: componentesDe(ht, hp, p.g.desdoble),
        miembros: miembros.map(y => ({ carrera: y.sig, grupoId: y.g.id, codigo: y.a.codigo, nombre: y.a.nombre, sem: y.a.sem, n: y.g.n, registrado: y.registrado }))
      });
    });
    return unidades;
  }

  /**
   * Índices de las secciones por grupo, por marca de fusión y por id.
   * @param {Seccion[]} unidades
   * @returns {{porGrupo: Map<string, Seccion>, porMarca: Map<string, Seccion>, porId: Map<string, Seccion>}}
   */
  function indiceUnidades(unidades) {
    const porGrupo = new Map(), porMarca = new Map(), porId = new Map();
    (unidades || []).forEach(u => {
      porId.set(u.id, u);
      u.miembros.forEach(m => porGrupo.set(m.grupoId, u));
      if (u.fusion) porMarca.set(u.fusion, u);
    });
    return { porGrupo: porGrupo, porMarca: porMarca, porId: porId };
  }

  /* La asignación guarda el grupo (unidad) y la fusión en la que estaba: si el grupo ya
     no existe pero la fusión sí, la sigue. Sin ninguno de los dos, queda sin sección. */
  const unidadDe = (idx, asig) => (asig.unidad && idx.porGrupo.get(asig.unidad)) || (asig.fusion && idx.porMarca.get(asig.fusion)) || null;

  /**
   * Asignaciones vigentes de cada sección a partir de las cargas de todas las carreras
   * ({ING: [asig…], …}). Una sección toma las asignaciones de la carga de su carrera (la del
   * grupo principal); si esa aún no tiene ninguna, conserva las que estén en otra carga, por
   * ejemplo si cambió el grupo principal de una fusión («heredadas»). Cada asignación lleva
   * en cargaDe la carga de la que sale.
   * @param {Seccion[]} unidades
   * @param {Object<string, Asignacion[]>} cargas
   * @returns {{idx: ReturnType<typeof indiceUnidades>, porUnidad: Map<string, Asignacion[]>, sinSeccion: Object<string, Asignacion[]>}}
   */
  function asignacionesVigentes(unidades, cargas) {
    const idx = indiceUnidades(unidades);
    const tmp = new Map();
    /** @type {Object<string, Asignacion[]>} */
    const sinSeccion = {};
    Object.keys(cargas || {}).forEach(d => (cargas[d] || []).forEach(asig => {
      const u = unidadDe(idx, asig);
      if (!u) { (sinSeccion[d] = sinSeccion[d] || []).push(asig); return; }
      let e = tmp.get(u.id);
      if (!e) tmp.set(u.id, e = { propias: [], ajenas: [] });
      (u.carrera === d ? e.propias : e.ajenas).push(Object.assign({}, asig, { cargaDe: d }));
    }));
    const porUnidad = new Map();
    tmp.forEach((e, id) => porUnidad.set(id, e.propias.length ? e.propias : e.ajenas.map(a => Object.assign(a, { heredada: true }))));
    return { idx: idx, porUnidad: porUnidad, sinSeccion: sinSeccion };
  }

  /**
   * Horas de una asignación: las que tiene escritas o, si no, las de su componente.
   * @param {Seccion|null} u
   * @param {Asignacion} asig
   * @returns {number}
   */
  function horasAsignacion(u, asig) {
    if (asig.horas !== null && asig.horas !== undefined && String(asig.horas).trim() !== "") return num(asig.horas);
    const c = u ? u.componentes.find(x => x.c === asig.componente) : null;
    return c ? c.horas : 0;
  }

  /**
   * Cobertura de una sección por componente: horas pedidas, horas asignadas y si cuadra.
   * @param {Seccion} u
   * @param {Asignacion[]} asigs
   * @returns {Array<{c: string, nombre: string, horas: number, asignadas: number, asignaciones: Asignacion[], cubierto: boolean, pendienteIntl: boolean, descuadre: boolean}>}
   */
  function coberturaUnidad(u, asigs) {
    return u.componentes.map(c => {
      const propias = (asigs || []).filter(a => a.componente === c.c);
      const pendienteIntl = propias.some(esPendienteInternacional);
      const conDocente = propias.filter(a => String(a.docente || "").trim());
      const asignadas = conDocente.reduce((s, a) => s + horasAsignacion(u, a), 0);
      return {
        c: c.c, nombre: c.nombre, horas: c.horas, asignadas: asignadas, asignaciones: propias,
        cubierto: pendienteIntl || conDocente.length > 0,
        pendienteIntl: pendienteIntl,
        descuadre: conDocente.length > 0 && !pendienteIntl && Math.abs(asignadas - c.horas) > 0.001
      };
    });
  }

  /**
   * ¿El docente del catálogo es el mismo que el de la asignación? Por DNI o por nombre.
   * @param {string} dni
   * @param {string} nombre
   * @returns {string} «D:<dni>» o «N:<nombre normalizado>».
   */
  function claveDeDocente(dni, nombre) {
    const d = String(dni || "").trim();
    return d ? "D:" + d : "N:" + claveDocente(nombre);
  }

  /**
   * Balance de cada docente en el ciclo, con todas sus asignaciones en los cuatro
   * departamentos, y sus advertencias:
   *   A07 bloqueo   más de 40 h lectivas (no se puede guardar)
   *   A08           TC en otra universidad con más de 16 h
   *   A09           ordinario con más de 24 h
   *   A10           tiempo parcial con menos de 8 h (se tolera si solo dicta cursos internacionales)
   *   A11           dos cursos distintos en el mismo semestre de una carrera
   *   A12           con cargo administrativo: más de 20 h; más de 24 h es severo y pide motivo
   *   A14           docente de otro departamento (préstamo)
   *   A15           TC que con lectivas y no lectivas no cubre sus 40 h
   * catalogo: docentes de CargaDeDocentes; cargas: {DIMA: [asig…], …}.
   * @param {DocenteCatalogo[]} catalogo
   * @param {Seccion[]} unidades
   * @param {Object<string, Asignacion[]>} cargas
   * @returns {{docentes: Array<Object>, vigentes: ReturnType<typeof asignacionesVigentes>}}
   */
  function calcularBalance(catalogo, unidades, cargas) {
    const vig = asignacionesVigentes(unidades, cargas);
    const docentes = new Map();
    const delCatalogo = new Map();
    (catalogo || []).forEach(d => {
      delCatalogo.set(claveDeDocente(d.dni, d.nombreCompleto), d);
      delCatalogo.set(claveDeDocente("", d.nombreCompleto), d);
    });
    const ficha = asig => {
      const cat = delCatalogo.get(claveDeDocente(asig.dni, asig.docente)) || delCatalogo.get(claveDeDocente("", asig.docente)) || null;
      const clave = cat ? claveDeDocente(cat.dni, cat.nombreCompleto) : claveDeDocente("", asig.docente);
      let d = docentes.get(clave);
      if (!d) docentes.set(clave, d = {
        clave: clave, nombre: cat ? cat.nombreCompleto : String(asig.docente).trim(), dni: cat ? cat.dni : (asig.dni || ""),
        dpto: cat ? (normalizarDpto(cat.dpto) || cat.dpto) : "", dedicacion: cat ? cat.dedicacion : "", condicion: cat ? cat.condicion : "",
        categoria: cat ? cat.categoria : "", cargo: cat ? (cat.cargo || "") : "", tcOtra: !!(cat && cat.tcOtra),
        noLectivas: cat && cat.noLectivas != null ? num(cat.noLectivas) : null, enCatalogo: !!cat,
        horas: 0, cursos: [], advertencias: []
      });
      return d;
    };
    vig.porUnidad.forEach((asigs, id) => {
      const u = vig.idx.porId.get(id);
      asigs.forEach(asig => {
        if (!String(asig.docente || "").trim()) return;
        const d = ficha(asig);
        const h = horasAsignacion(u, asig);
        d.horas += h;
        d.cursos.push({ unidad: u.id, componente: asig.componente, horas: h, carrera: u.carrera, codigo: u.codigo, nombre: u.nombre,
                        sem: u.sem, n: u.n, dpto: u.dpto, intl: u.intl, miembros: u.miembros });
      });
    });

    const adv = (d, codigo, nivel, mensaje) => d.advertencias.push({ codigo: codigo, nivel: nivel, mensaje: mensaje });
    docentes.forEach(d => {
      const h = Math.round(d.horas * 100) / 100;
      const ordinario = /ORDINARIO/.test(normalizar(d.condicion));
      if (h > LIMITES.MAXIMO) adv(d, "A07", "bloqueo", "Supera las " + LIMITES.MAXIMO + " h lectivas semanales (" + h + " h). No se puede guardar así.");
      if (d.tcOtra && h > LIMITES.TC_OTRA) adv(d, "A08", "alerta", "Tiene tiempo completo en otra universidad y supera " + LIMITES.TC_OTRA + " h (" + h + " h).");
      if (ordinario && h > LIMITES.ORDINARIO) adv(d, "A09", "alerta", "Docente ordinario con más de " + LIMITES.ORDINARIO + " h (" + h + " h).");
      if (d.dedicacion === "TP" && h > 0 && h < LIMITES.MINIMO_TP && !d.cursos.every(c => c.intl))
        adv(d, "A10", "alerta", "Tiempo parcial con menos de " + LIMITES.MINIMO_TP + " h (" + h + " h).");
      if (d.cargo && h > LIMITES.CARGO_SEVERO) adv(d, "A12", "severa", "Con cargo (" + d.cargo + ") supera " + LIMITES.CARGO_SEVERO + " h (" + h + " h): requiere un motivo para guardar.");
      else if (d.cargo && h > LIMITES.CARGO) adv(d, "A12", "alerta", "Con cargo (" + d.cargo + ") supera las " + LIMITES.CARGO + " h recomendadas (" + h + " h).");
      if (d.dedicacion === "TC" && d.noLectivas !== null && h + d.noLectivas < LIMITES.JORNADA_TC)
        adv(d, "A15", "alerta", "Tiempo completo: " + h + " h lectivas + " + d.noLectivas + " h no lectivas no cubren sus " + LIMITES.JORNADA_TC + " h.");
      const prestamos = [...new Set(d.cursos.filter(c => d.dpto && c.dpto && c.dpto !== d.dpto).map(c => c.dpto))];
      if (prestamos.length) adv(d, "A14", "info", "Es de " + d.dpto + " y dicta cursos pedidos a " + prestamos.join(", ") + ".");

      /* A11: dos cursos distintos (códigos distintos de secciones distintas) en el mismo
         semestre de una carrera. Dos grupos del mismo curso sí se permiten. */
      const porSem = new Map();
      d.cursos.forEach(c => c.miembros.forEach(m => {
        const k = m.carrera + "|" + m.sem;
        if (!porSem.has(k)) porSem.set(k, []);
        porSem.get(k).push({ codigo: String(m.codigo).trim(), unidad: c.unidad });
      }));
      porSem.forEach((l, k) => {
        const codigos = [...new Set(l.map(x => x.codigo))];
        const secciones = new Set(l.map(x => x.unidad));
        if (codigos.length > 1 && secciones.size > 1) {
          const [car, sem] = k.split("|");
          adv(d, "A11", "alerta", "Dicta " + codigos.length + " cursos distintos en " + car + ", semestre " + sem + " (" + codigos.join(", ") + ").");
        }
      });
    });
    return { docentes: [...docentes.values()], vigentes: vig };
  }

  /**
   * Lo que un guardado no puede hacer o debe justificar: comparar el balance de antes y el
   * de después. Un docente bloquea si pasa de 40 h y su carga creció; pide motivo si tiene
   * cargo, pasa de 24 h y su carga creció. Así se puede guardar otra cosa aunque un
   * docente ya estuviera por encima por un cambio del plan.
   * @param {{docentes: Array<Object>}} antes
   * @param {{docentes: Array<Object>}} despues
   * @returns {{bloqueos: Array<{docente: string, horas: number}>, severos: Array<{docente: string, horas: number, cargo: string}>}}
   */
  function excesosAlGuardar(antes, despues) {
    const previas = new Map((antes.docentes || []).map(d => [d.clave, d.horas]));
    const crecio = d => d.horas > (previas.get(d.clave) || 0) + 0.001;
    return {
      bloqueos: despues.docentes.filter(d => d.horas > LIMITES.MAXIMO && crecio(d)).map(d => ({ docente: d.nombre, horas: d.horas })),
      severos: despues.docentes.filter(d => d.cargo && d.horas > LIMITES.CARGO_SEVERO && crecio(d)).map(d => ({ docente: d.nombre, horas: d.horas, cargo: d.cargo }))
    };
  }

  /* ---------- carga masiva desde CargaXDepartamento ---------- */

  /**
   * Parecido entre dos nombres: la parte de sus palabras que comparten (0 a 1).
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  function similitudNombres(a, b) {
    const ta = new Set(claveDocente(a).split(" ").filter(x => x.length > 1));
    const tb = new Set(claveDocente(b).split(" ").filter(x => x.length > 1));
    if (!ta.size || !tb.size) return 0;
    let comunes = 0;
    ta.forEach(t => { if (tb.has(t)) comunes++; });
    return comunes / Math.max(ta.size, tb.size);
  }

  /**
   * Docentes del catálogo cuyo nombre más se parece, del más parecido al menos.
   * @param {string} nombre
   * @param {DocenteCatalogo[]} catalogo
   * @param {number=} cuantos 5 si no se indica.
   * @returns {DocenteCatalogo[]}
   */
  function sugerirDocentes(nombre, catalogo, cuantos) {
    return (catalogo || [])
      .map(d => ({ d: d, s: similitudNombres(nombre, d.nombreCompleto) }))
      .filter(x => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, cuantos || 5)
      .map(x => x.d);
  }

  /* Lee la hoja de un departamento tal como viene en CargaXDepartamento: el docente aparece
     una vez y sus cursos debajo (celdas combinadas), con filas de TOTAL entre docentes.
     El grupo sale de la columna GRUPO si la hay o de SEMESTRE («1-2» = semestre 1, grupo 2).
     Cada fila se cruza con las secciones del ciclo por carrera, código y grupo.
     Devuelve las filas leídas; nunca rechaza el contenido. */
  /**
   * Cabecera de una hoja de CargaXDepartamento: la primera fila (de las 15 primeras) que
   * tenga DOCENTE y CODIGO o ASIGNATURA. Sin ella, las columnas del formato habitual.
   * Devuelve {cab: índice de la cabecera, col: {DOCENTE: j, …}}.
   * @param {Array<Array<*>>} filas
   * @returns {{cab: number, col: Object<string, number>}}
   */
  function ubicarColumnasCarga(filas) {
    for (let i = 0; i < Math.min(15, filas.length); i++) {
      /** @type {Object<string, number>} */
      const pos = {};
      (filas[i] || []).map(normalizar).forEach((c, j) => {
        const fijar = (k, cond) => { if (cond && pos[k] === undefined) pos[k] = j; };
        fijar("DOCENTE", c.indexOf("DOCENTE") >= 0 || c.indexOf("PROFESOR") >= 0);
        fijar("CARRERA", c === "CARRERA" || c === "CARR");
        fijar("MALLA", c === "MALLA");
        fijar("SEMESTRE", c.indexOf("SEMESTRE") >= 0 || c === "SEM");
        fijar("CODIGO", c.indexOf("CODIGO") >= 0);
        fijar("ASIGNATURA", c.indexOf("ASIGNATURA") >= 0 || c === "CURSO");
        fijar("HT", c === "HT" || c.indexOf("HORAS TEORICAS") >= 0);
        fijar("HP", c === "HP" || c.indexOf("HORAS PRACTICAS") >= 0);
        fijar("CONDICION", c.indexOf("CONDICION") >= 0);
        fijar("GRUPO", c === "GRUPO" || c === "GRP");
      });
      if (pos.DOCENTE !== undefined && (pos.CODIGO !== undefined || pos.ASIGNATURA !== undefined)) return { cab: i, col: pos };
    }
    return { cab: 0, col: { DOCENTE: 0, CARRERA: 1, MALLA: 2, SEMESTRE: 3, CODIGO: 4, ASIGNATURA: 5, HT: 6, HP: 7, CONDICION: 9 } };
  }

  /**
   * Secciones del ciclo por carrera, código (o nombre) y grupo de cada miembro.
   * @param {Seccion[]} unidades
   * @returns {Map<string, Seccion>}
   */
  function indiceSeccionesCarga(unidades) {
    const idx = new Map();
    (unidades || []).forEach(u => u.miembros.forEach(m => {
      idx.set(m.carrera + "|C|" + String(m.codigo).trim() + "|" + String(m.n).trim(), u);
      idx.set(m.carrera + "|N|" + normalizar(m.nombre) + "|" + String(m.n).trim(), u);
    }));
    return idx;
  }

  /**
   * Componentes de la sección que cubre una fila: teoría si trae HT, práctica si trae HP.
   * En un desdoble, cada fila toma el siguiente subgrupo libre de esa sección (usados
   * cuenta los ya tomados en esta lectura). Sin horas, toda la sección.
   * @param {Seccion} seccion
   * @param {number} ht
   * @param {number} hp
   * @param {Map<string, number>} usados
   * @returns {string[]}
   */
  function componentesDeFila(seccion, ht, hp, usados) {
    const tomar = tipo => {
      const de = seccion.componentes.filter(c => c.tipo === tipo);
      if (de.length <= 1) return de.map(c => c.c);
      const k = seccion.id + "|" + tipo;
      const ya = usados.get(k) || 0;
      usados.set(k, ya + 1);
      return [de[Math.min(ya, de.length - 1)].c];
    };
    const componentes = (ht > 0 ? tomar("T") : []).concat(hp > 0 ? tomar("P") : []);
    return componentes.length ? componentes : seccion.componentes.map(c => c.c);
  }

  /**
   * Lee la hoja de un departamento tal como viene en CargaXDepartamento: el docente aparece
   * una vez y sus cursos debajo (celdas combinadas), con filas de TOTAL entre docentes.
   * El grupo sale de la columna GRUPO si la hay o de SEMESTRE («1-2» = semestre 1, grupo 2).
   * Cada fila se cruza con las secciones del ciclo por carrera, código y grupo. Con
   * destino.carrera, las filas de otra carrera quedan «otra-carrera»; con destino.dpto, las
   * secciones que asigna otro departamento quedan «otro-dpto».
   * Devuelve las filas leídas; nunca rechaza el contenido.
   * @param {Array<Array<*>>} matriz
   * @param {Seccion[]} unidades
   * @param {{carrera?: string, dpto?: string}|string} destino Un texto es el departamento (forma antigua).
   * @param {DocenteCatalogo[]} catalogo
   * @returns {{filas: Array<Object>, cabecera: number}}
   */
  function interpretarCargaDepartamento(matriz, unidades, destino, catalogo) {
    const dest = typeof destino === "string" ? { dpto: destino } : (destino || {});
    const filas = matriz || [];
    const { cab, col } = ubicarColumnasCarga(filas);
    const val = (f, k) => col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : "";
    const vacia = c => String(c == null ? "" : c).trim() === "";
    const idx = indiceSeccionesCarga(unidades);
    const delCatalogo = new Map((catalogo || []).map(d => [claveDocente(d.nombreCompleto), d]));
    const usados = new Map();   // sección|tipo → subgrupos ya tomados en esta lectura

    const salida = [];
    let docente = "";
    for (let r = cab + 1; r < filas.length; r++) {
      const f = filas[r] || [];
      if (f.every(vacia) || f.some(c => /^\s*TOTAL/i.test(String(c == null ? "" : c)))) continue;
      docente = val(f, "DOCENTE") || docente;
      const codigo = val(f, "CODIGO"), nombre = val(f, "ASIGNATURA");
      if (!docente || (!codigo && !nombre)) continue;

      const carreraTexto = val(f, "CARRERA");
      const carrera = siglaDeCarrera(carreraTexto) || carreraTexto;
      const ds = descomponerSemestre(val(f, "SEMESTRE"));
      const grupoCol = val(f, "GRUPO");
      const n = grupoCol !== "" ? String(num(grupoCol) || grupoCol) : String(!isNaN(ds.grupo) ? ds.grupo : 1);
      const ht = num(val(f, "HT")), hp = num(val(f, "HP"));
      const seccion = (codigo && idx.get(carrera + "|C|" + codigo + "|" + n)) || (nombre && idx.get(carrera + "|N|" + normalizar(nombre) + "|" + n)) || null;
      const cat = delCatalogo.get(claveDocente(docente)) || null;
      const deCarrera = seccion ? seccion.carrera : siglaDeCarrera(carreraTexto);
      const estado = dest.carrera && deCarrera && deCarrera !== dest.carrera ? "otra-carrera"
        : !seccion ? "fuera"
        : dest.dpto && seccion.dpto !== dest.dpto ? "otro-dpto" : "ok";
      salida.push({
        fila: r + 1, docenteTexto: docente, docente: cat ? cat.nombreCompleto : null, dni: cat ? cat.dni : "",
        carrera: carrera, codigo: codigo, nombre: nombre, n: n, ht: ht, hp: hp, condicion: val(f, "CONDICION"),
        unidad: seccion ? seccion.id : null, fusion: seccion ? seccion.fusion : null,
        componentes: seccion ? componentesDeFila(seccion, ht, hp, usados) : [],
        estado: estado, dptoUnidad: seccion ? seccion.dpto : "", carreraSeccion: deCarrera || ""
      });
    }
    return { filas: salida, cabecera: cab + 1 };
  }

  return {
    DPTOS_INFO, normalizarDpto, nombreDpto, claveDocente, LIMITES, PENDIENTE_INTERNACIONAL,
    esPendienteInternacional, componentesDe, unidadesDelCiclo, indiceUnidades, unidadDe,
    asignacionesVigentes, horasAsignacion, coberturaUnidad, claveDeDocente, calcularBalance,
    excesosAlGuardar, similitudNombres, sugerirDocentes, ubicarColumnasCarga, indiceSeccionesCarga,
    componentesDeFila, interpretarCargaDepartamento
  };
}
