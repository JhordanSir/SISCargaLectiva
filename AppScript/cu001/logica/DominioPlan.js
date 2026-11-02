// @ts-check
/* Dominio de CU-001 «Registrar plan de ciclo». Lo combina base/Dominio.js. Se usa en el
   servidor y, como texto, en el navegador (fuenteDominio_), así que no puede usar nada
   definido fuera de su fábrica. */

/**
 * CU-001 «Registrar plan de ciclo»: interpretar lo importado, totales, operaciones de
 * edición y fusiones. C: lo que devuelve crearDominioComun_().
 * @param {ReturnType<typeof crearDominioComun_>} C
 * @returns Todas sus declaraciones.
 */
function crearDominioPlan_(C) {
  "use strict";

  const {
    CARRERAS, coincideCarrera, descomponerSemestre, DPTOS, esInternacional, idGrupo, normalizar, num, th,
    ubicarCabeceras
  } = C;

  /* ============================================================
     Deducción de columnas: la cabecera manda y lo que quede suelto
     se reconoce por su contenido. Nunca se rechaza nada.
     ============================================================ */
  const PISTAS = {
    "CODIGO":      v => /^\s*\d+(\.\d+){2,3}\s*$/.test(v) ? 3 : 0,
    "MALLA":       v => /^\s*(19|20)\d{2}(\.0+)?\s*$/.test(v) ? 3 : 0,
    "SEMESTRE":    v => /^\s*\d{1,2}\s*[-\/]\s*\d{1,2}\s*$/.test(v) ? 3
                      : /^\s*(1[0-2]|[1-9])(\.0+)?\s*$/.test(v) ? 1 : 0,
    "DPTO":        v => DPTOS.includes(normalizar(v)) ? 3 : /^[A-Za-z]{3,6}$/.test(v.trim()) ? 1 : 0,
    "CARRERA":     v => CARRERAS.some(c => coincideCarrera(v, c.sig)) ? 3 : 0,
    "GRUPO":       v => /^\s*[1-9]\d?(\.0+)?\s*$/.test(v) ? 1 : 0,
    "HT":          v => /^\s*\d{1,2}(\.\d+)?\s*$/.test(v) ? 1 : 0,
    "HP":          v => /^\s*\d{1,2}(\.\d+)?\s*$/.test(v) ? 1 : 0,
    "TOTAL HORAS": v => /^\s*\d{1,2}(\.\d+)?\s*$/.test(v) ? 1 : 0,
    "ASIGNATURA":  v => /[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(v) && v.trim().length > 6 ? 2 : 0,
    "OBSERVACIONES": v => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v) ? 1 : 0
  };

  /**
   * Cuánto se parece una columna a la columna «nombre» según sus primeras 25 celdas con datos (0 a 3).
   * @param {string} nombre
   * @param {Array<Array<*>>} filas
   * @param {number} j
   * @returns {number}
   */
  function puntuar(nombre, filas, j) {
    const pista = PISTAS[nombre];
    if (!pista) return 0;
    let aciertos = 0, mirados = 0;
    for (const f of filas) {
      const v = f[j] == null ? "" : String(f[j]);
      if (v.trim() === "") continue;
      mirados++;
      aciertos += pista(v);
      if (mirados >= 25) break;
    }
    return mirados ? aciertos / mirados : 0;
  }

  const filaConDatos = f => f.some(c => String(c == null ? "" : c).trim() !== "");

  /**
   * Columna de cada campo: la de la cabecera y, para lo que falte, la que mejor encaja por su contenido.
   * @param {Array<Array<*>>} matriz
   * @returns {{filaCab: number, mapa: Object<string, number>}}
   */
  function deducirColumnas(matriz) {
    const cab = ubicarCabeceras(matriz);
    const filaCab = cab ? cab.fila : -1;
    const mapa = cab ? Object.assign({}, cab.mapa) : {};
    const filas = matriz.slice(filaCab + 1).filter(filaConDatos);
    if (!filas.length) return { filaCab, mapa };

    const anchura = filas.reduce((n, f) => Math.max(n, f.length), 0);
    const tomadas = new Set(Object.values(mapa));

    const orden = ["CODIGO", "MALLA", "CARRERA", "DPTO", "SEMESTRE", "ASIGNATURA",
                   "HT", "HP", "TOTAL HORAS", "GRUPO", "OBSERVACIONES"];
    orden.forEach(nombre => {
      if (mapa[nombre] !== undefined) return;
      let mejor = -1, mejorPunt = 0.34;          // por debajo de esto no se arriesga
      for (let j = 0; j < anchura; j++) {
        if (tomadas.has(j)) continue;
        const pt = puntuar(nombre, filas, j);
        if (pt > mejorPunt) { mejorPunt = pt; mejor = j; }
      }
      if (mejor >= 0) { mapa[nombre] = mejor; tomadas.add(mejor); }
    });

    return { filaCab, mapa };
  }

  /* ============================================================
     Interpretación: no valida, no rechaza y no corrige. Los números solo
     se interpretan para sumar; el texto original se conserva.
     ============================================================ */
  const nuevoGrupo = (n, ht, hp) => ({ id: idGrupo(), n: n, ht: ht, hp: hp, desdoble: null, fusion: null });

  /**
   * Ordena por semestre y código (en el sitio) y devuelve la misma lista.
   * @param {Asignatura[]} asignaturas
   * @returns {Asignatura[]}
   */
  function ordenar(asignaturas) {
    asignaturas.sort((a, b) => num(a.sem) - num(b.sem) || String(a.codigo).localeCompare(String(b.codigo)));
    return asignaturas;
  }

  /**
   * opciones.carrera: sigla del plan. Las filas cuya CARRERA indique otra carrera
   * se ignoran y se cuentan en «ignoradas»; una CARRERA vacía no excluye la fila.
   * opciones.sinDuplicados: descarta la fila que repite código y grupo.
   * @param {Array<Array<*>>} matriz
   * @param {{carrera?: Sigla, sinDuplicados?: boolean}=} opciones
   * @returns {{asignaturas: Asignatura[], ignoradas: number, duplicadas: Array<{codigo: string, nombre: string, grupo: (string|number)}>}}
   */
  function interpretar(matriz, opciones) {
    const carrera = opciones && opciones.carrera;
    const sinDuplicados = !!(opciones && opciones.sinDuplicados);
    const { filaCab, mapa } = deducirColumnas(matriz);
    const filas = matriz.slice(filaCab + 1).filter(filaConDatos);
    const val = (f, c) => {
      const j = mapa[c];
      return (j !== undefined && j < f.length && f[j] != null) ? String(f[j]).trim() : "";
    };

    const porClave = new Map();
    const duplicadas = [];
    let sinCodigo = 0, ignoradas = 0;

    filas.forEach(f => {
      if (carrera && mapa.CARRERA !== undefined) {
        const c = val(f, "CARRERA");
        if (c && !coincideCarrera(c, carrera)) { ignoradas++; return; }
      }

      const semBruto = val(f, "SEMESTRE");
      const ds = descomponerSemestre(semBruto);
      const sem = !isNaN(ds.sem) ? ds.sem : (semBruto || "Sin semestre");

      const grupoBruto = val(f, "GRUPO");
      const grupo = grupoBruto !== "" ? grupoBruto : (!isNaN(ds.grupo) ? ds.grupo : 1);

      /* Sin código, la asignatura se identifica por su nombre; sin ninguno de los
         dos, cada fila vale por sí misma para no fundir cosas distintas. */
      const codigo = val(f, "CODIGO");
      const nombre = val(f, "ASIGNATURA");
      const clave = codigo || nombre || ("fila-" + (++sinCodigo));

      if (!porClave.has(clave)) porClave.set(clave, {
        sem: sem, malla: val(f, "MALLA"), codigo: codigo, nombre: nombre,
        dpto: val(f, "DPTO"), obs: val(f, "OBSERVACIONES"), grupos: []
      });
      const a = porClave.get(clave);
      if (sinDuplicados && a.grupos.some(g => String(g.n) === String(grupo))) {
        duplicadas.push({ codigo: codigo, nombre: nombre, grupo: grupo });
        return;
      }
      a.grupos.push(nuevoGrupo(grupo, val(f, "HT"), val(f, "HP")));
    });

    const asignaturas = Array.from(porClave.values());
    asignaturas.forEach(a => a.grupos.sort((x, y) => num(x.n) - num(y.n)));
    return { asignaturas: ordenar(asignaturas), ignoradas: ignoradas, duplicadas: duplicadas };
  }

  /* ============================================================
     Totales
     ============================================================ */
  /**
   * Una sección fusionada dicta sus horas una sola vez. Si su grupo principal está en el
   * plan de otra carrera, ese plan es el que las cuenta y este no suma nada.
   * @param {Asignatura[]} asignaturas
   * @returns {Totales}
   */
  function totales(asignaturas) {
    const t = { asig: 0, grupos: 0, ht: 0, hp: 0, th: 0, dictado: 0, intl: 0, fus: 0, des: 0, sem: 0 };
    const fus = new Set(), sems = new Set();   // «sem» puede ser un número o un texto
    const principalAqui = new Set(), principalFuera = new Set();
    (asignaturas || []).forEach(a => a.grupos.forEach(g => {
      if (!g.fusion) return;
      if (g.fusionPrincipal) principalAqui.add(g.fusion);
      if ((g.fusionCon || []).some(x => x.principal)) principalFuera.add(g.fusion);
    }));
    (asignaturas || []).forEach(a => {
      t.asig++; sems.add(a.sem);
      if (esInternacional(a)) t.intl++;
      a.grupos.forEach(g => {
        t.grupos++; t.ht += num(g.ht); t.hp += num(g.hp); t.th += th(g);
        if (g.desdoble) t.des++;
        if (g.fusion) {
          if (!fus.has(g.fusion)) {
            fus.add(g.fusion);
            if (principalAqui.has(g.fusion) || !principalFuera.has(g.fusion)) t.dictado += th(g);
          }
        }
        else t.dictado += th(g);
      });
    });
    t.fus = fus.size; t.sem = sems.size;
    return t;
  }

  /* ============================================================
     Operaciones de edición. Modifican la lista de asignaturas recibida.
     ============================================================ */
  const siguienteN = a => Math.max(0, ...a.grupos.map(g => num(g.n))) + 1;

  /**
   * Añade una asignatura con un grupo y reordena. d: {sem, malla, codigo, nombre, dpto, obs, ht, hp}.
   * @param {Asignatura[]} asignaturas
   * @param {Object} d
   * @returns {Asignatura} La asignatura añadida.
   */
  function agregarAsignatura(asignaturas, d) {
    /* El semestre se interpreta si se puede («5», «1-2»); si no, se conserva el texto
       y da nombre al bloque. */
    const dsem = descomponerSemestre(d.sem);
    const sem = !isNaN(dsem.sem) ? dsem.sem : (String(d.sem == null ? "" : d.sem).trim() || "Sin semestre");
    const n = !isNaN(dsem.grupo) ? dsem.grupo : 1;
    const a = { sem: sem, malla: d.malla, codigo: d.codigo, nombre: d.nombre, dpto: d.dpto, obs: d.obs,
                grupos: [nuevoGrupo(n, d.ht, d.hp)] };
    asignaturas.push(a);
    ordenar(asignaturas);
    return a;
  }

  /**
   * Quita una asignatura y deshace las fusiones que se queden con menos de dos grupos.
   * @param {Asignatura[]} asignaturas
   * @param {number} ci
   * @returns {void}
   */
  function eliminarAsignatura(asignaturas, ci) {
    const marcas = asignaturas[ci].grupos.map(g => g.fusion).filter(Boolean);
    asignaturas.splice(ci, 1);
    marcas.forEach(m => limpiarFusionHuerfana(asignaturas, m));
  }

  /**
   * Añade a una asignatura un grupo con las horas de otro.
   * @param {Asignatura[]} asignaturas
   * @param {number} ci
   * @param {number} gi Grupo del que se copian las horas.
   * @returns {number} Número del grupo nuevo.
   */
  function agregarGrupo(asignaturas, ci, gi) {
    const a = asignaturas[ci], base = a.grupos[gi];
    const n = siguienteN(a);
    a.grupos.push(nuevoGrupo(n, base.ht, base.hp));
    return n;
  }

  /**
   * Añade un grupo a cada asignatura del semestre, con las horas de su primer grupo.
   * @param {Asignatura[]} asignaturas
   * @param {string|number} sem
   * @returns {number} Cuántas asignaturas recibieron grupo.
   */
  function agregarGrupoSemestre(asignaturas, sem) {
    const asigs = asignaturas.filter(a => String(a.sem) === String(sem));
    asigs.forEach(a => {
      const base = a.grupos[0];
      a.grupos.push(nuevoGrupo(siguienteN(a), base.ht, base.hp));
    });
    return asigs.length;
  }

  /**
   * Quita un grupo; la asignatura sin grupos sale del plan.
   * @param {Asignatura[]} asignaturas
   * @param {number} ci
   * @param {number} gi
   * @returns {void}
   */
  function eliminarGrupo(asignaturas, ci, gi) {
    const a = asignaturas[ci];
    const marca = a.grupos[gi].fusion;
    a.grupos.splice(gi, 1);
    if (!a.grupos.length) asignaturas.splice(ci, 1);
    if (marca) limpiarFusionHuerfana(asignaturas, marca);
  }

  /**
   * Desdobla la práctica o la teoría del grupo en n subgrupos.
   * @param {Grupo} g
   * @param {string} tipo «Práctica» o «Teoría».
   * @param {number} n
   * @returns {void}
   */
  function desdoblar(g, tipo, n) {
    g.desdoble = (tipo === "Práctica" ? "PRA" : "TEO") + "×" + n;
  }

  /**
   * Quita el desdoble del grupo.
   * @param {Grupo} g
   * @returns {void}
   */
  function quitarDesdoble(g) {
    g.desdoble = null;
  }

  /**
   * Devuelve las horas que el grupo tenía antes de fusionarse y quita la marca.
   * @param {Grupo} g
   * @returns {void}
   */
  function restaurarHoras(g) {
    if (g.previas) { g.ht = g.previas.ht; g.hp = g.previas.hp; delete g.previas; }
  }

  /* Una sección fusionada puede reunir grupos de varias carreras. Cada grupo fusionado lleva
       fusion           la marca común de la sección;
       fusionPrincipal  true en el grupo cuyas horas definen la sección (uno en todo el ciclo);
       fusionCon        los miembros que están en el plan de otras carreras
                        [{carrera, grupoId, codigo, nombre, n, principal}];
       previas          sus horas antes de fusionarse, para recuperarlas al deshacer.
     Dentro de un plan solo se tocan sus grupos; el servidor lleva la fusión a los planes
     de las demás carreras al guardar. */
  const nuevaMarca = () => "F" + Math.random().toString(36).slice(2, 8).toUpperCase();

  /**
   * ¿El grupo tiene otro nombre, código u horas que la referencia de la sección?
   * @param {string} nombre
   * @param {string} codigo
   * @param {*} ht
   * @param {*} hp
   * @param {{nombre: string, codigo: string, ht: *, hp: *}} ref
   * @returns {boolean}
   */
  function difiereDe(nombre, codigo, ht, hp, ref) {
    return nombre !== ref.nombre || codigo !== ref.codigo || num(ht) !== num(ref.ht) || num(hp) !== num(ref.hp);
  }

  /**
   * Saca el grupo de su fusión y le devuelve sus horas de antes.
   * @param {Grupo} g
   * @returns {void}
   */
  function quitarDeFusion(g) {
    g.fusion = null;
    delete g.fusionPrincipal;
    delete g.fusionCon;
    restaurarHoras(g);
  }

  /**
   * refs son "ci:gi" del plan; externos, grupos de otras carreras
   * [{carrera, grupoId, codigo, nombre, n, ht, hp}]; principal es "ci:gi" o "ext:<i>".
   * La sección toma las horas del grupo principal.
   * @param {Asignatura[]} asignaturas
   * @param {string[]} refs
   * @param {string} principal
   * @param {Array<Object>=} externos
   * @returns {{marca: string, difs: string[], conOtras: boolean}}
   */
  function fusionar(asignaturas, refs, principal, externos) {
    const ext = (externos || []).map(x => Object.assign({}, x));
    const par = v => { const x = String(v).split(":").map(Number); return { a: asignaturas[x[0]], g: asignaturas[x[0]].grupos[x[1]] }; };
    const pExt = /^ext:/.test(String(principal)) ? ext[parseInt(String(principal).slice(4), 10)] || null : null;
    const pLocal = pExt ? null : par(principal);
    const ref = pExt
      ? { nombre: pExt.nombre, codigo: pExt.codigo, ht: pExt.ht, hp: pExt.hp }
      : { nombre: pLocal.a.nombre, codigo: pLocal.a.codigo, ht: pLocal.g.ht, hp: pLocal.g.hp };
    const marca = nuevaMarca();
    const difs = [], anteriores = new Set();
    const locales = pExt || refs.includes(principal) ? refs.slice() : refs.concat([principal]);

    ext.forEach(x => {
      x.principal = x === pExt;
      if (!x.principal && difiereDe(x.nombre, x.codigo, x.ht, x.hp, ref))
        difs.push(x.carrera + " · " + x.codigo + " " + x.nombre + " (grupo " + x.n + ")");
    });
    const fusionCon = ext.map(x => ({ carrera: x.carrera, grupoId: x.grupoId, codigo: x.codigo, nombre: x.nombre, n: x.n, principal: x.principal }));

    locales.forEach(v => {
      const s = par(v);
      const esPrincipal = !!pLocal && s.g === pLocal.g;
      if (!esPrincipal && difiereDe(s.a.nombre, s.a.codigo, s.g.ht, s.g.hp, ref))
        difs.push(s.a.codigo + " " + s.a.nombre + " (grupo " + s.g.n + ")");
      if (s.g.fusion && s.g.fusion !== marca) anteriores.add(s.g.fusion);
      if (!esPrincipal && (s.g.ht !== ref.ht || s.g.hp !== ref.hp) && !s.g.previas)
        s.g.previas = { ht: s.g.ht, hp: s.g.hp };
      s.g.fusion = marca;
      if (esPrincipal) s.g.fusionPrincipal = true; else delete s.g.fusionPrincipal;
      if (fusionCon.length) s.g.fusionCon = fusionCon.map(x => Object.assign({}, x)); else delete s.g.fusionCon;
      if (!esPrincipal) { s.g.ht = ref.ht; s.g.hp = ref.hp; }
    });
    anteriores.forEach(m => limpiarFusionHuerfana(asignaturas, m));
    return { marca: marca, difs: difs, conOtras: fusionCon.length > 0 };
  }

  /**
   * Saca de la fusión todos los grupos del plan con esa marca.
   * @param {Asignatura[]} asignaturas
   * @param {string} marca
   * @returns {void}
   */
  function deshacerFusion(asignaturas, marca) {
    asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion === marca) quitarDeFusion(g); }));
  }

  /**
   * Una fusión sigue en pie mientras reúna al menos dos grupos, contando los de otras
   * carreras. Si se quedó sin principal, pasa a serlo el primer grupo que queda aquí.
   * @param {Asignatura[]} asignaturas
   * @param {string} marca
   * @returns {void}
   */
  function limpiarFusionHuerfana(asignaturas, marca) {
    const aqui = [];
    asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion === marca) aqui.push(g); }));
    const fuera = aqui.reduce((n, g) => Math.max(n, (g.fusionCon || []).length), 0);
    if (aqui.length + fuera < 2) return deshacerFusion(asignaturas, marca);
    const principalFuera = aqui.some(g => (g.fusionCon || []).some(x => x.principal));
    if (!principalFuera && !aqui.some(g => g.fusionPrincipal)) aqui[0].fusionPrincipal = true;
  }

  /**
   * Tras reemplazar el contenido de un plan, cada grupo que sigue existiendo (mismo código
   * y número de grupo) conserva su identificador, para que sus docentes asignados lo sigan.
   * @param {Asignatura[]} nuevas
   * @param {Asignatura[]} anteriores
   * @returns {Asignatura[]} nuevas.
   */
  function conservarIds(nuevas, anteriores) {
    const ids = new Map();
    (anteriores || []).forEach(a => a.grupos.forEach(g => ids.set(String(a.codigo).trim() + "|" + String(g.n).trim(), g.id)));
    const usados = new Set();
    (nuevas || []).forEach(a => a.grupos.forEach(g => {
      const id = ids.get(String(a.codigo).trim() + "|" + String(g.n).trim());
      if (id && !usados.has(id)) { g.id = id; usados.add(id); }
    }));
    /* La derivación de un curso a otro departamento no viene en la oferta de la hoja: también se conserva. */
    const derivados = new Map();
    (anteriores || []).forEach(a => { if (a.derivado) derivados.set(String(a.codigo).trim(), a.derivado); });
    (nuevas || []).forEach(a => { const d = derivados.get(String(a.codigo).trim()); if (d && !a.derivado) a.derivado = d; });
    return nuevas;
  }

  /* ============================================================
     Fusiones entre carreras: reconciliación al guardar un plan
     El plan que se guarda solo trae sus propios grupos; cada grupo fusionado lista en
     «fusionCon» a los miembros de otras carreras. Esta función, sin acceso a la hoja,
     calcula cómo quedan esas fusiones en todos los planes del ciclo: incorpora los grupos
     pedidos, elige el grupo principal, iguala las horas de la sección y disuelve la
     fusión que se queda con menos de dos grupos.
     ============================================================ */

  /**
   * Marcas de fusión que el guardado puede afectar.
   * @param {Asignatura[]} antes
   * @param {Asignatura[]} despues
   * @param {string[]} disueltas
   * @returns {string[]}
   */
  function marcasAfectadas(antes, despues, disueltas) {
    const marcas = [];
    const anotar = m => { if (m && !marcas.includes(m)) marcas.push(m); };
    [antes || [], despues || []].forEach(lista => lista.forEach(a => a.grupos.forEach(g => anotar(g.fusion))));
    (disueltas || []).forEach(anotar);
    return marcas;
  }

  /**
   * Asignatura y grupo con ese id, o null.
   * @param {Asignatura[]} lista
   * @param {string} id
   * @returns {{a: Asignatura, g: Grupo}|null}
   */
  function buscarGrupoPorId(lista, id) {
    for (const a of lista) for (const g of a.grupos) if (g.id === id) return { a: a, g: g };
    return null;
  }

  /**
   * sig: carrera del plan que se guarda; despues: su contenido (se ajusta aquí); antes: el
   * vigente; disueltas: marcas que el usuario deshizo; otros: {sig: contenido} de las
   * demás carreras del ciclo, que no se modifican (los cambios van en copias).
   * Devuelve {asignaturas: despues, cambios: {sig: {asignaturas, motivos}}}.
   * @param {Sigla} sig
   * @param {Asignatura[]} antes
   * @param {Asignatura[]} despues
   * @param {string[]} disueltas
   * @param {Object<string, Asignatura[]>} otros
   * @returns {{asignaturas: Asignatura[], cambios: Object<string, {asignaturas: Asignatura[], motivos: string[]}>}}
   */
  function reconciliarFusiones(sig, antes, despues, disueltas, otros) {
    const marcas = marcasAfectadas(antes, despues, disueltas);
    const copias = {}, motivos = {};
    const trabajo = s => copias[s] || otros[s] || [];
    const editable = s => copias[s] || (copias[s] = JSON.parse(JSON.stringify(otros[s] || [])));
    const tocar = (s, texto) => {
      if (s === sig) return;
      motivos[s] = motivos[s] || [];
      if (!motivos[s].includes(texto)) motivos[s].push(texto);
    };
    const locales = m => {
      const r = [];
      despues.forEach(a => a.grupos.forEach(g => { if (g.fusion === m) r.push({ sig: sig, a: a, g: g }); }));
      return r;
    };
    /* Miembros de la fusión en los planes de las otras carreras, sobre copias editables. */
    const externos = m => {
      const res = [];
      new Set(Object.keys(otros).concat(Object.keys(copias))).forEach(s =>
        trabajo(s).forEach(a => a.grupos.forEach(g => { if (g.fusion === m) res.push({ sig: s, id: g.id }); })));
      return res.map(x => Object.assign({ sig: x.sig }, buscarGrupoPorId(editable(x.sig), x.id)));
    };
    const pedidosDe = aqui => {
      const pedidos = [];
      aqui.forEach(x => (x.g.fusionCon || []).forEach(e => {
        if (e.carrera !== sig && !pedidos.some(p => p.carrera === e.carrera && p.grupoId === e.grupoId)) pedidos.push(e);
      }));
      return pedidos;
    };
    /* Un grupo pedido que aún no está en la fusión entra en ella (y sale de la que tuviera). */
    const incorporar = (m, pedidos) => {
      const ya = externos(m);
      pedidos.forEach(e => {
        if (ya.some(x => x.sig === e.carrera && x.g.id === e.grupoId)) return;
        const t = buscarGrupoPorId(editable(e.carrera), e.grupoId);
        if (!t) return;   // ese grupo ya no existe en su plan
        if (t.g.fusion && t.g.fusion !== m && !marcas.includes(t.g.fusion)) marcas.push(t.g.fusion);
        t.g.fusion = m;
        tocar(e.carrera, "fusión con " + sig);
      });
    };
    const elegirPrincipal = (miembros, pedidos) => {
      const marcado = miembros.find(x => x.g.fusionPrincipal);
      if (marcado) return marcado;
      const pedido = pedidos.find(e => e.principal);
      return (pedido && miembros.find(x => x.sig === pedido.carrera && x.g.id === pedido.grupoId)) || miembros[0];
    };
    /* Solo el principal lleva la marca; los demás toman sus horas y cada uno lista a los
       miembros de otras carreras. */
    const igualar = (miembros, p) => miembros.forEach(x => {
      const previo = JSON.stringify(x.g);
      if (x === p) x.g.fusionPrincipal = true; else delete x.g.fusionPrincipal;
      if (x !== p && (String(x.g.ht) !== String(p.g.ht) || String(x.g.hp) !== String(p.g.hp))) {
        if (!x.g.previas) x.g.previas = { ht: x.g.ht, hp: x.g.hp };
        x.g.ht = p.g.ht; x.g.hp = p.g.hp;
      }
      const con = miembros.filter(y => y.sig !== x.sig).map(y =>
        ({ carrera: y.sig, grupoId: y.g.id, codigo: y.a.codigo, nombre: y.a.nombre, n: y.g.n, principal: y === p }));
      if (con.length) x.g.fusionCon = con; else delete x.g.fusionCon;
      if (JSON.stringify(x.g) !== previo) tocar(x.sig, "fusión con " + sig);
    });

    for (let k = 0; k < marcas.length; k++) {
      const m = marcas[k];
      const aqui = locales(m);
      if ((disueltas || []).includes(m) && !aqui.length) {
        externos(m).forEach(x => { quitarDeFusion(x.g); tocar(x.sig, "fusión deshecha desde " + sig); });
        continue;
      }
      const pedidos = pedidosDe(aqui);
      incorporar(m, pedidos);
      const miembros = aqui.concat(externos(m));
      if (miembros.length < 2) {
        miembros.forEach(x => { quitarDeFusion(x.g); tocar(x.sig, "fusión disuelta"); });
        continue;
      }
      igualar(miembros, elegirPrincipal(miembros, pedidos));
    }

    /** @type {Object<string, {asignaturas: Asignatura[], motivos: string[]}>} */
    const cambios = {};
    Object.keys(motivos).forEach(s => { cambios[s] = { asignaturas: copias[s], motivos: motivos[s] }; });
    return { asignaturas: despues, cambios: cambios };
  }

  return {
    PISTAS, puntuar, filaConDatos, deducirColumnas, nuevoGrupo, ordenar, interpretar, totales, siguienteN,
    agregarAsignatura, eliminarAsignatura, agregarGrupo, agregarGrupoSemestre, eliminarGrupo, desdoblar,
    quitarDesdoble, restaurarHoras, nuevaMarca, difiereDe, quitarDeFusion, fusionar, deshacerFusion,
    limpiarFusionHuerfana, conservarIds, marcasAfectadas, buscarGrupoPorId, reconciliarFusiones
  };
}
