/* Lógica de dominio de CU-001, compartida por el servidor y el navegador.
   El navegador recibe el texto de crearDominio() y lo ejecuta tal cual, así que
   la función no puede usar nada definido fuera de ella. */
function crearDominio() {
  "use strict";

  /* ============================================================
     Datos maestros
     ============================================================ */
  const DPTOS = ["DIMA", "DAHUC", "DACJ", "DACTE"];

  /* «alias» recoge las formas con que cada carrera aparece en los Sheets y Excel
     reales (las siglas de la columna CARRERA y los nombres de las hojas). */
  const CARRERAS = [
    { sig: "ING", nombre: "Ingeniería de Software", alias: ["Ing. Software"] },
    { sig: "IND", nombre: "Ingeniería Industrial", alias: ["Ing. Industrial"] },
    { sig: "ADM", nombre: "Administración de Empresas",
      alias: ["Adm. Neg. Int.", "Administración de Negocios Internacionales"] },
    { sig: "DER", nombre: "Derecho", alias: [] },
    { sig: "ARQ", nombre: "Arquitectura", alias: [] },
    { sig: "PSI", nombre: "Psicología", alias: [] },
    { sig: "COM", nombre: "Comunicación",
      alias: ["Cs. de la Comunicación", "Ciencias de la Comunicación"] },
    { sig: "ICO", nombre: "Ingeniería Comercial", alias: ["Ing. Comercial"] }
  ];

  const COLUMNAS = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "GRUPO",
                    "HT", "HP", "TOTAL HORAS", "DPTO", "OBSERVACIONES"];
  const SINONIMOS = { "OBSERVACION": "OBSERVACIONES", "TH": "TOTAL HORAS", "TOTAL DE HORAS": "TOTAL HORAS" };

  const ESTADOS = { SIN: "Sin Iniciar", BORRADOR: "Borrador", REGISTRADO: "Registrado" };

  const nombreCarrera = sig => (CARRERAS.find(c => c.sig === sig) || {}).nombre || sig;

  /* ============================================================
     Normalización
     ============================================================ */
  function normalizar(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().trim().replace(/\s+/g, " ");
  }
  const canonica = s => { const n = normalizar(s); return SINONIMOS[n] || n; };

  /* Divide un texto pegado (tabulaciones) o un CSV (comas o punto y coma, con comillas). */
  function matrizDesdeTexto(txt) {
    const lineas = String(txt).replace(/\r\n?/g, "\n").split("\n").filter(l => l.trim() !== "");
    if (!lineas.length) return [];
    /* El separador se deduce del conjunto del texto, no de la primera línea:
       un rango pegado puede empezar con un título o una fila en blanco. */
    if (lineas.some(l => l.includes("\t"))) return lineas.map(l => l.split("\t").map(c => c.trim()));
    const cuenta = c => lineas.reduce((n, l) => n + (l.split(c).length - 1), 0);
    const sep = cuenta(";") > cuenta(",") ? ";" : ",";
    return lineas.map(linea => {
      const celdas = []; let act = "", comillas = false;
      for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (c === '"') {
          if (comillas && linea[i + 1] === '"') { act += '"'; i++; }
          else comillas = !comillas;
        } else if (c === sep && !comillas) { celdas.push(act); act = ""; }
        else act += c;
      }
      celdas.push(act);
      return celdas.map(c => c.trim());
    });
  }

  /* Localiza la fila de cabeceras. Devuelve la primera fila completa y sin repeticiones;
     si no existe, devuelve la mejor candidata. */
  function ubicarCabeceras(matriz) {
    let mejor = null;
    for (let i = 0; i < matriz.length; i++) {
      const celdas = matriz[i].map(canonica);
      const mapa = {}, repetidas = [];
      celdas.forEach((c, j) => {
        if (!COLUMNAS.includes(c)) return;
        if (mapa[c] !== undefined) { if (!repetidas.includes(c)) repetidas.push(c); }
        else mapa[c] = j;
      });
      const encontradas = Object.keys(mapa).length;
      if (!encontradas) continue;
      const faltan = COLUMNAS.filter(c => mapa[c] === undefined);
      const extras = matriz[i].filter(c => c !== "" && !COLUMNAS.includes(canonica(c)));
      const cand = { fila: i, mapa, repetidas, extras, faltan, encontradas };
      if (!faltan.length && !repetidas.length) return cand;
      if (!mejor || encontradas > mejor.encontradas) mejor = cand;
    }
    return mejor;
  }

  const entero = v => /^-?\d+$/.test(String(v).trim());

  /* Compara nombres de carrera ignorando mayúsculas, tildes, puntos y espacios,
     de modo que «Ing. Software», «ING SOFTWARE» e «ing software» sean lo mismo. */
  const claveCarrera = v => normalizar(v).replace(/[.\-–—]/g, " ").replace(/\s+/g, " ").trim();

  function formasCarrera(sigla) {
    const c = CARRERAS.find(x => x.sig === sigla);
    return c ? [c.sig, c.nombre].concat(c.alias || []) : [];
  }

  /* La columna CARRERA puede traer la sigla («ING»), el nombre o cualquier alias. */
  function coincideCarrera(valor, sigla) {
    const v = claveCarrera(valor);
    return formasCarrera(sigla).some(f => claveCarrera(f) === v);
  }

  /* Sigla de la carrera que corresponde a un valor (sigla, nombre o alias); null si ninguna. */
  function siglaDeCarrera(valor) {
    if (!claveCarrera(valor)) return null;
    const c = CARRERAS.find(x => coincideCarrera(valor, x.sig));
    return c ? c.sig : null;
  }

  /* SEMESTRE admite «5» (semestre 5, grupo 1) y «1-2» (semestre 1, grupo 2), con «/»
     como separador alternativo. Devuelve sem = NaN si no encaja; entonces se conserva
     el texto original. */
  function descomponerSemestre(bruto) {
    const t = String(bruto == null ? "" : bruto).trim();
    if (entero(t)) return { sem: parseInt(t, 10), grupo: 1, compuesto: false };
    const m = t.match(/^(\d+)\s*[-\/]\s*(\d+)$/);
    if (m) return { sem: parseInt(m[1], 10), grupo: parseInt(m[2], 10), compuesto: true };
    return { sem: NaN, grupo: NaN, compuesto: false };
  }

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
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const m = String(v == null ? "" : v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }
  const th = g => num(g.ht) + num(g.hp);

  const idGrupo = () => "g" + Math.random().toString(36).slice(2);
  const nuevoGrupo = (n, ht, hp) => ({ id: idGrupo(), n: n, ht: ht, hp: hp, desdoble: null, fusion: null });

  function ordenar(asignaturas) {
    asignaturas.sort((a, b) => num(a.sem) - num(b.sem) || String(a.codigo).localeCompare(String(b.codigo)));
    return asignaturas;
  }

  /* opciones.carrera: sigla del plan. Las filas cuya CARRERA indique otra carrera
     se ignoran y se cuentan en «ignoradas»; una CARRERA vacía no excluye la fila.
     opciones.sinDuplicados: descarta la fila que repite código y grupo. */
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
  const esInternacional = a => /INTERNACIONAL|VIRTUAL/i.test(a.obs || "");

  function totales(asignaturas) {
    const t = { asig: 0, grupos: 0, ht: 0, hp: 0, th: 0, dictado: 0, intl: 0, fus: 0, des: 0, sem: 0 };
    const fus = new Set(), sems = new Set();   // «sem» puede ser un número o un texto
    (asignaturas || []).forEach(a => {
      t.asig++; sems.add(a.sem);
      if (esInternacional(a)) t.intl++;
      a.grupos.forEach(g => {
        t.grupos++; t.ht += num(g.ht); t.hp += num(g.hp); t.th += th(g);
        if (g.desdoble) t.des++;
        if (g.fusion) { if (!fus.has(g.fusion)) { fus.add(g.fusion); t.dictado += th(g); } }
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

  function eliminarAsignatura(asignaturas, ci) {
    const marcas = asignaturas[ci].grupos.map(g => g.fusion).filter(Boolean);
    asignaturas.splice(ci, 1);
    marcas.forEach(m => limpiarFusionHuerfana(asignaturas, m));
  }

  function agregarGrupo(asignaturas, ci, gi) {
    const a = asignaturas[ci], base = a.grupos[gi];
    const n = siguienteN(a);
    a.grupos.push(nuevoGrupo(n, base.ht, base.hp));
    return n;
  }

  function agregarGrupoSemestre(asignaturas, sem) {
    const asigs = asignaturas.filter(a => String(a.sem) === String(sem));
    asigs.forEach(a => {
      const base = a.grupos[0];
      a.grupos.push(nuevoGrupo(siguienteN(a), base.ht, base.hp));
    });
    return asigs.length;
  }

  function eliminarGrupo(asignaturas, ci, gi) {
    const a = asignaturas[ci];
    const marca = a.grupos[gi].fusion;
    a.grupos.splice(gi, 1);
    if (!a.grupos.length) asignaturas.splice(ci, 1);
    if (marca) limpiarFusionHuerfana(asignaturas, marca);
  }

  function desdoblar(g, tipo, n) {
    g.desdoble = (tipo === "Práctica" ? "PRA" : "TEO") + "×" + n;
  }

  function quitarDesdoble(g) {
    g.desdoble = null;
  }

  /* Devuelve las horas que el grupo tenía antes de fusionarse y quita la marca. */
  function restaurarHoras(g) {
    if (g.previas) { g.ht = g.previas.ht; g.hp = g.previas.hp; delete g.previas; }
  }

  /* refs y principal son "ci:gi". La sección fusionada toma las horas del grupo principal;
     cada grupo cuyas horas cambian guarda las suyas para recuperarlas al deshacer. */
  function fusionar(asignaturas, refs, principal) {
    const par = v => { const x = String(v).split(":").map(Number); return { a: asignaturas[x[0]], g: asignaturas[x[0]].grupos[x[1]] }; };
    const ref = par(principal);
    const marca = "F" + Math.random().toString(36).slice(2, 6).toUpperCase();
    const difs = [], anteriores = new Set();
    const todos = refs.includes(principal) ? refs : refs.concat([principal]);
    todos.forEach(v => {
      const s = par(v);
      if (v !== principal && (s.a.nombre !== ref.a.nombre || s.a.codigo !== ref.a.codigo ||
          num(s.g.ht) !== num(ref.g.ht) || num(s.g.hp) !== num(ref.g.hp)))
        difs.push(s.a.codigo + " " + s.a.nombre + " (grupo " + s.g.n + ")");
      if (s.g.fusion && s.g.fusion !== marca) anteriores.add(s.g.fusion);
      if (s.g !== ref.g && (s.g.ht !== ref.g.ht || s.g.hp !== ref.g.hp) && !s.g.previas)
        s.g.previas = { ht: s.g.ht, hp: s.g.hp };
      s.g.fusion = marca;
      if (s.g !== ref.g) { s.g.ht = ref.g.ht; s.g.hp = ref.g.hp; }
    });
    anteriores.forEach(m => limpiarFusionHuerfana(asignaturas, m));
    return { marca: marca, difs: difs };
  }

  function deshacerFusion(asignaturas, marca) {
    asignaturas.forEach(a => a.grupos.forEach(g => {
      if (g.fusion === marca) { g.fusion = null; restaurarHoras(g); }
    }));
  }

  function limpiarFusionHuerfana(asignaturas, marca) {
    let n = 0;
    asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion === marca) n++; }));
    if (n < 2) deshacerFusion(asignaturas, marca);
  }

  /* ============================================================
     Firma del contenido, para saber si un plan cambió entre dos lecturas
     ============================================================ */
  function contenidoCanonico(asignaturas) {
    return JSON.stringify((asignaturas || []).map(a => [
      a.sem, a.malla, a.codigo, a.nombre, a.dpto, a.obs,
      a.grupos.map(g => [g.n, g.ht, g.hp, g.desdoble || null, g.fusion || null])
    ]));
  }

  /* cyrb53: hash de 53 bits, suficiente para detectar cambios. */
  function hash(texto) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  return {
    DPTOS: DPTOS, CARRERAS: CARRERAS, COLUMNAS: COLUMNAS, ESTADOS: ESTADOS,
    nombreCarrera: nombreCarrera, normalizar: normalizar, canonica: canonica,
    matrizDesdeTexto: matrizDesdeTexto, ubicarCabeceras: ubicarCabeceras,
    coincideCarrera: coincideCarrera, siglaDeCarrera: siglaDeCarrera,
    descomponerSemestre: descomponerSemestre, deducirColumnas: deducirColumnas,
    interpretar: interpretar, num: num, th: th, totales: totales, esInternacional: esInternacional,
    agregarAsignatura: agregarAsignatura, eliminarAsignatura: eliminarAsignatura,
    agregarGrupo: agregarGrupo, agregarGrupoSemestre: agregarGrupoSemestre,
    eliminarGrupo: eliminarGrupo, desdoblar: desdoblar, quitarDesdoble: quitarDesdoble,
    fusionar: fusionar, deshacerFusion: deshacerFusion, limpiarFusionHuerfana: limpiarFusionHuerfana,
    contenidoCanonico: contenidoCanonico, hash: hash
  };
}

var Dominio = crearDominio();
