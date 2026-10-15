/* Lógica de dominio de CU-001 y CU-002, compartida por el servidor y el navegador.
   El navegador recibe el texto de crearDominio_() y lo ejecuta tal cual, así que
   la función no puede usar nada definido fuera de ella. */
function crearDominio_() {
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

  /* Tipo de cada guardado, tal como queda escrito en el historial de versiones. */
  const TIPO_VERSION = {
    BORRADOR: "guardar borrador", REGISTRAR: "registrar", CAMBIOS: "guardar cambios", AUTOGUARDADO: "autoguardado",
    FUSION: "fusión", CAMBIO_DPTO: "cambio de departamento",
    IMPORTACION_XLSX: "importación desde xlsx", ACTUALIZACION_XLSX: "actualización desde xlsx",
    GUARDAR_CARGA: "guardar",
    restauracion: n => "restauración de v" + n,
    esRestauracion: t => /^restauración de v\d+$/.test(String(t))
  };

  /* Documento que se bloquea o se recupera: el plan de una carrera («plan:ADM») o la carga
     docente de un departamento («carga:DIMA»). */
  const REF = { plan: sig => "plan:" + sig, carga: dpto => "carga:" + dpto };

  /* Avisos que el servidor manda al navegador: {tipo, nivel, texto, datos}. El navegador
     decide por el tipo, nunca por el texto. Cada tipo trae su nivel: "info", "aviso" o
     "error". TEXTO es un aviso guardado antes de que los avisos tuvieran tipo. */
  const TIPOS_AVISO = {
    CARPETA_INACCESIBLE: "error", FALTA_CARGA_CARRERA: "aviso", LECTURA_XLSX_FALLIDA: "error",
    XLSX_CONVERTIDO: "aviso", VARIOS_ARCHIVOS: "info",
    HOJA_DESCONOCIDA: "aviso", HOJA_REPETIDA: "aviso", FILA_REPETIDA: "aviso",
    PLAN_CAMBIADO: "aviso", SIN_SECCION: "aviso",
    CATALOGO_SIN_CARPETA: "aviso", CATALOGO_FALTA: "aviso", CATALOGO_SIN_CABECERAS: "aviso", CATALOGO_ILEGIBLE: "aviso",
    TEXTO: "aviso"
  };
  const aviso = (tipo, texto, datos, nivel) =>
    ({ tipo: tipo, nivel: nivel || TIPOS_AVISO[tipo] || "aviso", texto: String(texto), datos: datos || null });
  const comoAviso = a => a && typeof a === "object" && typeof a.texto === "string" ? a : aviso("TEXTO", a == null ? "" : a);

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

  /* Una sección fusionada dicta sus horas una sola vez. Si su grupo principal está en el
     plan de otra carrera, ese plan es el que las cuenta y este no suma nada. */
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

  /* Una sección fusionada puede reunir grupos de varias carreras. Cada grupo fusionado lleva
       fusion           la marca común de la sección;
       fusionPrincipal  true en el grupo cuyas horas definen la sección (uno en todo el ciclo);
       fusionCon        los miembros que están en el plan de otras carreras
                        [{carrera, grupoId, codigo, nombre, n, principal}];
       previas          sus horas antes de fusionarse, para recuperarlas al deshacer.
     Dentro de un plan solo se tocan sus grupos; el servidor lleva la fusión a los planes
     de las demás carreras al guardar. */
  const nuevaMarca = () => "F" + Math.random().toString(36).slice(2, 8).toUpperCase();

  function difiereDe(nombre, codigo, ht, hp, ref) {
    return nombre !== ref.nombre || codigo !== ref.codigo || num(ht) !== num(ref.ht) || num(hp) !== num(ref.hp);
  }

  function quitarDeFusion(g) {
    g.fusion = null;
    delete g.fusionPrincipal;
    delete g.fusionCon;
    restaurarHoras(g);
  }

  /* refs son "ci:gi" del plan; externos, grupos de otras carreras
     [{carrera, grupoId, codigo, nombre, n, ht, hp}]; principal es "ci:gi" o "ext:<i>".
     La sección toma las horas del grupo principal. */
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

  function deshacerFusion(asignaturas, marca) {
    asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion === marca) quitarDeFusion(g); }));
  }

  /* Una fusión sigue en pie mientras reúna al menos dos grupos, contando los de otras
     carreras. Si se quedó sin principal, pasa a serlo el primer grupo que queda aquí. */
  function limpiarFusionHuerfana(asignaturas, marca) {
    const aqui = [];
    asignaturas.forEach(a => a.grupos.forEach(g => { if (g.fusion === marca) aqui.push(g); }));
    const fuera = aqui.reduce((n, g) => Math.max(n, (g.fusionCon || []).length), 0);
    if (aqui.length + fuera < 2) return deshacerFusion(asignaturas, marca);
    const principalFuera = aqui.some(g => (g.fusionCon || []).some(x => x.principal));
    if (!principalFuera && !aqui.some(g => g.fusionPrincipal)) aqui[0].fusionPrincipal = true;
  }

  /* Tras reemplazar el contenido de un plan, cada grupo que sigue existiendo (mismo código
     y número de grupo) conserva su identificador, para que sus docentes asignados lo sigan. */
  function conservarIds(nuevas, anteriores) {
    const ids = new Map();
    (anteriores || []).forEach(a => a.grupos.forEach(g => ids.set(String(a.codigo).trim() + "|" + String(g.n).trim(), g.id)));
    const usados = new Set();
    (nuevas || []).forEach(a => a.grupos.forEach(g => {
      const id = ids.get(String(a.codigo).trim() + "|" + String(g.n).trim());
      if (id && !usados.has(id)) { g.id = id; usados.add(id); }
    }));
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

  /* Marcas de fusión que el guardado puede afectar. */
  function marcasAfectadas(antes, despues, disueltas) {
    const marcas = [];
    const anotar = m => { if (m && !marcas.includes(m)) marcas.push(m); };
    [antes || [], despues || []].forEach(lista => lista.forEach(a => a.grupos.forEach(g => anotar(g.fusion))));
    (disueltas || []).forEach(anotar);
    return marcas;
  }

  function buscarGrupoPorId(lista, id) {
    for (const a of lista) for (const g of a.grupos) if (g.id === id) return { a: a, g: g };
    return null;
  }

  /* sig: carrera del plan que se guarda; despues: su contenido (se ajusta aquí); antes: el
     vigente; disueltas: marcas que el usuario deshizo; otros: {sig: contenido} de las
     demás carreras del ciclo, que no se modifican (los cambios van en copias).
     Devuelve {asignaturas: despues, cambios: {sig: {asignaturas, motivos}}}. */
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

    const cambios = {};
    Object.keys(motivos).forEach(s => { cambios[s] = { asignaturas: copias[s], motivos: motivos[s] }; });
    return { asignaturas: despues, cambios: cambios };
  }

  /* ============================================================
     Saneamiento de lo que llega del navegador antes de guardarlo. No reinterpreta el
     contenido (el texto que no se entiende se conserva, como en la carga), pero se queda
     solo con los campos del modelo, recorta los textos y rechaza lo que no se puede
     guardar: algo que no es una lista o un volumen desmedido.
     ============================================================ */
  const LIMITES_DATOS = { ASIGNATURAS: 2000, GRUPOS: 60, ASIGNACIONES: 6000, HISTORIAL: 50, FUSION_CON: 30, MARCAS: 200, CARACTERES: 600000 };
  const MARCA_FUSION = /^F[A-Z0-9]{1,12}$/;
  const DESDOBLE = /^(PRA|TEO)×\d{1,2}$/;
  const COMPONENTE = /^(C|T\d{0,2}|P\d{0,2})$/;
  const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

  const objeto = v => v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const recortar = (v, max) => v == null ? "" : String(v).slice(0, max);
  const textoONumero = (v, max) => typeof v === "number" && isFinite(v) ? v : recortar(v, max);
  const idSeguro = v => /^[A-Za-z0-9_-]{1,40}$/.test(String(v == null ? "" : v)) ? String(v) : null;
  const marcaSegura = v => MARCA_FUSION.test(String(v == null ? "" : v)) ? String(v) : null;
  const esSigla = v => CARRERAS.some(c => c.sig === v);

  /* Error de datos con el código del contrato de respuestas (Respuesta.js). */
  const errorDato = mensaje => Object.assign(new Error(mensaje), { codigo: "DATO_INVALIDO" });

  function exigirLista(v, max, que) {
    if (!Array.isArray(v)) throw errorDato(que + ": se esperaba una lista.");
    if (v.length > max) throw errorDato(que + ": tiene " + v.length + " elementos y el máximo es " + max + ".");
  }

  function exigirTamano(v, que) {
    const n = JSON.stringify(v).length;
    if (n > LIMITES_DATOS.CARACTERES)
      throw errorDato(que + " es demasiado grande (" + Math.round(n / 1024) + " KB; el máximo es " + Math.round(LIMITES_DATOS.CARACTERES / 1024) + " KB).");
  }

  function sanearGrupo(g) {
    g = objeto(g);
    const r = {
      id: idSeguro(g.id) || idGrupo(), n: textoONumero(g.n, 10), ht: textoONumero(g.ht, 20), hp: textoONumero(g.hp, 20),
      desdoble: DESDOBLE.test(String(g.desdoble || "")) ? String(g.desdoble) : null,
      fusion: marcaSegura(g.fusion)
    };
    if (r.fusion && g.fusionPrincipal === true) r.fusionPrincipal = true;
    if (r.fusion && Array.isArray(g.fusionCon)) {
      const con = g.fusionCon.slice(0, LIMITES_DATOS.FUSION_CON).map(objeto)
        .filter(x => esSigla(x.carrera) && idSeguro(x.grupoId))
        .map(x => ({ carrera: x.carrera, grupoId: x.grupoId, codigo: recortar(x.codigo, 40), nombre: recortar(x.nombre, 250),
                     n: textoONumero(x.n, 10), principal: x.principal === true }));
      if (con.length) r.fusionCon = con;
    }
    if (g.previas && typeof g.previas === "object")
      r.previas = { ht: textoONumero(g.previas.ht, 20), hp: textoONumero(g.previas.hp, 20) };
    return r;
  }

  /* Contenido de un plan. Una asignatura sin grupos no es válida y se descarta. */
  function sanearAsignaturas(lista) {
    exigirLista(lista, LIMITES_DATOS.ASIGNATURAS, "El plan");
    exigirTamano(lista, "El plan");
    return lista.map(objeto).map(a => {
      const grupos = Array.isArray(a.grupos) ? a.grupos : [];
      exigirLista(grupos, LIMITES_DATOS.GRUPOS, "Los grupos de «" + recortar(a.nombre || a.codigo, 60) + "»");
      return { sem: textoONumero(a.sem, 40), malla: textoONumero(a.malla, 20), codigo: recortar(a.codigo, 40), nombre: recortar(a.nombre, 250),
               dpto: recortar(a.dpto, 60), obs: recortar(a.obs, 500), grupos: grupos.map(sanearGrupo) };
    }).filter(a => a.grupos.length);
  }

  function sanearMarcas(lista) {
    if (lista == null) return [];
    exigirLista(lista, LIMITES_DATOS.MARCAS, "Las fusiones deshechas");
    return lista.map(marcaSegura).filter(Boolean);
  }

  /* Horas de una asignación: null es «las del componente»; si no, un número entre 0 y 60. */
  function horasSeguras(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    return Math.round(Math.min(60, Math.max(0, num(v))) * 100) / 100;
  }

  function sanearHistorial(lista) {
    if (!Array.isArray(lista) || !lista.length) return null;
    return lista.slice(-LIMITES_DATOS.HISTORIAL).map(objeto).map(h => {
      const r = { tipo: recortar(h.tipo, 30), fecha: recortar(h.fecha, 30), usuario: recortar(h.usuario, 120) };
      if (h.docente != null) r.docente = recortar(h.docente, 150);
      if (h.dni != null) r.dni = recortar(h.dni, 20);
      if (h.antes != null) r.antes = recortar(h.antes, 150);
      if (h.motivo != null) r.motivo = recortar(h.motivo, 300);
      if (FECHA_ISO.test(String(h.hasta || ""))) r.hasta = h.hasta;
      return r;
    });
  }

  /* Asignaciones de una carga docente. Descarta los campos que solo usa la pantalla
     (heredada, dptoCarga) y cualquier otro que no sea del modelo. */
  function sanearAsignaciones(lista) {
    exigirLista(lista, LIMITES_DATOS.ASIGNACIONES, "La carga");
    exigirTamano(lista, "La carga");
    return lista.map(objeto).map(a => {
      const r = {
        id: idSeguro(a.id) || ("a" + Math.random().toString(36).slice(2, 10)),
        unidad: idSeguro(a.unidad), fusion: marcaSegura(a.fusion),
        componente: COMPONENTE.test(String(a.componente || "")) ? String(a.componente) : "C",
        docente: recortar(a.docente, 150).trim(),
        dni: /^[0-9A-Za-z-]{1,20}$/.test(String(a.dni || "")) ? String(a.dni) : "",
        horas: horasSeguras(a.horas),
        condicion: recortar(a.condicion, 150),
        carrera: recortar(a.carrera, 20), codigo: recortar(a.codigo, 40), asignatura: recortar(a.asignatura, 250),
        n: textoONumero(a.n, 10), sem: textoONumero(a.sem, 40)
      };
      if (a.nota) r.nota = recortar(a.nota, 300);
      if (a.reemplazo && typeof a.reemplazo === "object")
        r.reemplazo = { de: recortar(a.reemplazo.de, 150), motivo: recortar(a.reemplazo.motivo, 300),
                        desde: FECHA_ISO.test(String(a.reemplazo.desde || "")) ? a.reemplazo.desde : "" };
      const historial = sanearHistorial(a.historial);
      if (historial) r.historial = historial;
      return r;
    });
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

  /* ============================================================
     Asignación docente: secciones que se asignan, balance y advertencias
     ============================================================ */
  const DPTOS_INFO = {
    DIMA: { sigla: "DIMA", nombre: "Departamento de Ingeniería y Matemáticas", alias: ["INGENIERIA Y MATEMATICAS", "INGENIERIA", "MATEMATICAS", "DIMA"] },
    DAHUC: { sigla: "DAHUC", nombre: "Departamento de Humanidades y Comunicación", alias: ["HUMANIDADES Y COM.", "HUMANIDADES Y CIENCIAS SOCIALES", "HUMANIDADES", "COMUNICACION", "DAHUC", "DAHU"] },
    DACJ: { sigla: "DACJ", nombre: "Departamento de Ciencias Jurídicas", alias: ["CIENCIAS JURIDICAS", "DERECHO", "DACJ"] },
    DACTE: { sigla: "DACTE", nombre: "Departamento de Ciencias y Tecnologías Empresariales", alias: ["CS. Y TEC. EMPRESARIALES", "CIENCIAS Y TECNOLOGIAS EMPRESARIALES", "EMPRESARIALES", "DACTE"] }
  };

  function normalizarDpto(s) {
    if (!s) return null;
    const n = normalizar(s);
    if (!n) return null;
    for (const sigla of Object.keys(DPTOS_INFO)) {
      if (sigla === n) return sigla;
      const alist = DPTOS_INFO[sigla].alias;
      for (let i = 0; i < alist.length; i++) {
        const al = normalizar(alist[i]);
        if (al === n || n.indexOf(al) >= 0 || (n.length >= 4 && al.indexOf(n) >= 0)) return sigla;
      }
    }
    return null;
  }

  function nombreDpto(sigla) {
    const info = DPTOS_INFO[sigla];
    return info ? info.nombre : sigla;
  }

  function claveDocente(nombre) {
    return normalizar(nombre).replace(/[,.\-–—]/g, " ").replace(/\s+/g, " ").trim();
  }

  /* Límites de carga lectiva semanal. MAXIMO no se puede superar (A07); los demás avisan. */
  const LIMITES = { MAXIMO: 40, TC_OTRA: 16, ORDINARIO: 24, CARGO: 20, CARGO_SEVERO: 24, MINIMO_TP: 8, JORNADA_TC: 40 };

  const PENDIENTE_INTERNACIONAL = "PENDIENTE INTERNACIONAL";
  const esPendienteInternacional = a => normalizar(a.condicion) === PENDIENTE_INTERNACIONAL && !String(a.docente || "").trim();

  /* Partes de una sección que se asignan por separado. Sin desdoble: teoría y práctica.
     Con desdoble de práctica ×n: la teoría común y n subgrupos de práctica (y al revés). */
  function componentesDe(ht, hp, desdoble) {
    const d = String(desdoble || "").match(/^(PRA|TEO)\D*(\d+)/i);
    const tipo = d ? d[1].toUpperCase() : null;
    const n = d ? Math.max(2, parseInt(d[2], 10) || 2) : 0;
    const c = [];
    if (tipo === "TEO") for (let i = 1; i <= n; i++) c.push({ c: "T" + i, tipo: "T", nombre: "Teoría · subgrupo " + i, horas: ht });
    else if (ht > 0) c.push({ c: "T", tipo: "T", nombre: "Teoría", horas: ht });
    if (tipo === "PRA") for (let i = 1; i <= n; i++) c.push({ c: "P" + i, tipo: "P", nombre: "Práctica · subgrupo " + i, horas: hp });
    else if (hp > 0) c.push({ c: "P", tipo: "P", nombre: "Práctica", horas: hp });
    if (!c.length) c.push({ c: "C", tipo: "C", nombre: "Curso", horas: 0 });
    return c;
  }

  /* Secciones que piden docente en un ciclo. Una sección es un grupo o, si está fusionado,
     toda su fusión (aunque reúna grupos de varias carreras): se asigna una vez y sus horas
     cuentan una vez. Toma los datos del grupo principal, también el departamento.
     planes: [{sig, estado, contenido}]. Solo cuentan las secciones con algún grupo en un
     plan Registrado. */
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
      unidades.push({
        id: p.g.id, fusion: miembros.length > 1 ? x.g.fusion : null,
        carrera: p.sig, codigo: p.a.codigo, nombre: p.a.nombre, sem: p.a.sem, malla: p.a.malla, n: p.g.n,
        dpto: normalizarDpto(p.a.dpto) || String(p.a.dpto || "").trim(), obs: p.a.obs || "", intl: esInternacional(p.a),
        ht: ht, hp: hp, desdoble: p.g.desdoble || null,
        componentes: componentesDe(ht, hp, p.g.desdoble),
        miembros: miembros.map(y => ({ carrera: y.sig, grupoId: y.g.id, codigo: y.a.codigo, nombre: y.a.nombre, sem: y.a.sem, n: y.g.n, registrado: y.registrado }))
      });
    });
    return unidades;
  }

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

  /* Asignaciones vigentes de cada sección a partir de las cargas de los cuatro
     departamentos ({DIMA: [asig…], …}). Una sección toma las asignaciones del departamento
     al que hoy pide el docente; si ese aún no tiene ninguna, conserva las que hizo otro
     departamento antes de un cambio de DPTO («heredadas»). */
  function asignacionesVigentes(unidades, cargas) {
    const idx = indiceUnidades(unidades);
    const tmp = new Map(), sinSeccion = {};
    Object.keys(cargas || {}).forEach(d => (cargas[d] || []).forEach(asig => {
      const u = unidadDe(idx, asig);
      if (!u) { (sinSeccion[d] = sinSeccion[d] || []).push(asig); return; }
      let e = tmp.get(u.id);
      if (!e) tmp.set(u.id, e = { propias: [], ajenas: [] });
      (u.dpto === d ? e.propias : e.ajenas).push(Object.assign({}, asig, { dptoCarga: d }));
    }));
    const porUnidad = new Map();
    tmp.forEach((e, id) => porUnidad.set(id, e.propias.length ? e.propias : e.ajenas.map(a => Object.assign(a, { heredada: true }))));
    return { idx: idx, porUnidad: porUnidad, sinSeccion: sinSeccion };
  }

  /* Horas de una asignación: las que tiene escritas o, si no, las de su componente. */
  function horasAsignacion(u, asig) {
    if (asig.horas !== null && asig.horas !== undefined && String(asig.horas).trim() !== "") return num(asig.horas);
    const c = u ? u.componentes.find(x => x.c === asig.componente) : null;
    return c ? c.horas : 0;
  }

  /* Cobertura de una sección por componente: horas pedidas, horas asignadas y si cuadra. */
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

  /* ¿El docente del catálogo es el mismo que el de la asignación? Por DNI o por nombre. */
  function claveDeDocente(dni, nombre) {
    const d = String(dni || "").trim();
    return d ? "D:" + d : "N:" + claveDocente(nombre);
  }

  /* Balance de cada docente en el ciclo, con todas sus asignaciones en los cuatro
     departamentos, y sus advertencias:
       A07 bloqueo   más de 40 h lectivas (no se puede guardar)
       A08           TC en otra universidad con más de 16 h
       A09           ordinario con más de 24 h
       A10           tiempo parcial con menos de 8 h (se tolera si solo dicta cursos internacionales)
       A11           dos cursos distintos en el mismo semestre de una carrera
       A12           con cargo administrativo: más de 20 h; más de 24 h es severo y pide motivo
       A14           docente de otro departamento (préstamo)
       A15           TC que con lectivas y no lectivas no cubre sus 40 h
     catalogo: docentes de CargaDeDocentes; cargas: {DIMA: [asig…], …}. */
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

  /* Lo que un guardado no puede hacer o debe justificar: comparar el balance de antes y el
     de después. Un docente bloquea si pasa de 40 h y su carga creció; pide motivo si tiene
     cargo, pasa de 24 h y su carga creció. Así se puede guardar otra cosa aunque un
     docente ya estuviera por encima por un cambio del plan. */
  function excesosAlGuardar(antes, despues) {
    const previas = new Map((antes.docentes || []).map(d => [d.clave, d.horas]));
    const crecio = d => d.horas > (previas.get(d.clave) || 0) + 0.001;
    return {
      bloqueos: despues.docentes.filter(d => d.horas > LIMITES.MAXIMO && crecio(d)).map(d => ({ docente: d.nombre, horas: d.horas })),
      severos: despues.docentes.filter(d => d.cargo && d.horas > LIMITES.CARGO_SEVERO && crecio(d)).map(d => ({ docente: d.nombre, horas: d.horas, cargo: d.cargo }))
    };
  }

  /* ---------- carga masiva desde CargaXDepartamento ---------- */
  function similitudNombres(a, b) {
    const ta = new Set(claveDocente(a).split(" ").filter(x => x.length > 1));
    const tb = new Set(claveDocente(b).split(" ").filter(x => x.length > 1));
    if (!ta.size || !tb.size) return 0;
    let comunes = 0;
    ta.forEach(t => { if (tb.has(t)) comunes++; });
    return comunes / Math.max(ta.size, tb.size);
  }

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
  function interpretarCargaDepartamento(matriz, unidades, dpto, catalogo) {
    const filas = matriz || [];
    let cab = -1;
    const col = {};
    for (let i = 0; i < Math.min(15, filas.length) && cab < 0; i++) {
      const f = (filas[i] || []).map(normalizar);
      const pos = {};
      f.forEach((c, j) => {
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
      if (pos.DOCENTE !== undefined && (pos.CODIGO !== undefined || pos.ASIGNATURA !== undefined)) { cab = i; Object.assign(col, pos); }
    }
    if (cab < 0) {
      Object.assign(col, { DOCENTE: 0, CARRERA: 1, MALLA: 2, SEMESTRE: 3, CODIGO: 4, ASIGNATURA: 5, HT: 6, HP: 7, CONDICION: 9 });
      cab = 0;
    }
    const val = (f, k) => col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : "";

    const idx = new Map();
    (unidades || []).forEach(u => u.miembros.forEach(m => {
      idx.set(m.carrera + "|C|" + String(m.codigo).trim() + "|" + String(m.n).trim(), u);
      idx.set(m.carrera + "|N|" + normalizar(m.nombre) + "|" + String(m.n).trim(), u);
    }));
    const delCatalogo = new Map((catalogo || []).map(d => [claveDocente(d.nombreCompleto), d]));
    const usados = new Map();   // sección|tipo → subgrupos ya tomados en esta lectura

    const salida = [];
    let docente = "";
    for (let r = cab + 1; r < filas.length; r++) {
      const f = filas[r] || [];
      if (!f.some(c => String(c == null ? "" : c).trim() !== "")) continue;
      if (f.some(c => /^\s*TOTAL/i.test(String(c == null ? "" : c)))) continue;
      const celdaDoc = val(f, "DOCENTE");
      if (celdaDoc) docente = celdaDoc;
      const codigo = val(f, "CODIGO"), nombre = val(f, "ASIGNATURA");
      if (!codigo && !nombre) continue;
      if (!docente) continue;

      const carreraTexto = val(f, "CARRERA");
      const carrera = siglaDeCarrera(carreraTexto) || carreraTexto;
      const ds = descomponerSemestre(val(f, "SEMESTRE"));
      const grupoCol = val(f, "GRUPO");
      const n = grupoCol !== "" ? String(num(grupoCol) || grupoCol) : String(!isNaN(ds.grupo) ? ds.grupo : 1);
      const ht = num(val(f, "HT")), hp = num(val(f, "HP"));
      const u = (codigo && idx.get(carrera + "|C|" + codigo + "|" + n)) || (nombre && idx.get(carrera + "|N|" + normalizar(nombre) + "|" + n)) || null;

      let componentes = [];
      if (u) {
        const tomar = tipo => {
          const de = u.componentes.filter(c => c.tipo === tipo);
          if (!de.length) return [];
          if (de.length === 1) return [de[0].c];
          const k = u.id + "|" + tipo;
          const ya = usados.get(k) || 0;
          usados.set(k, ya + 1);
          return [de[Math.min(ya, de.length - 1)].c];
        };
        if (ht > 0) componentes = componentes.concat(tomar("T"));
        if (hp > 0) componentes = componentes.concat(tomar("P"));
        if (!componentes.length) componentes = u.componentes.map(c => c.c);
      }
      const cat = delCatalogo.get(claveDocente(docente)) || null;
      salida.push({
        fila: r + 1, docenteTexto: docente, docente: cat ? cat.nombreCompleto : null, dni: cat ? cat.dni : "",
        carrera: carrera, codigo: codigo, nombre: nombre, n: n, ht: ht, hp: hp, condicion: val(f, "CONDICION"),
        unidad: u ? u.id : null, fusion: u ? u.fusion : null, componentes: componentes,
        estado: !u ? "fuera" : (dpto && u.dpto !== dpto ? "otro-dpto" : "ok"), dptoUnidad: u ? u.dpto : ""
      });
    }
    return { filas: salida, cabecera: cab + 1 };
  }

  return {
    DPTOS: DPTOS, normalizarDpto: normalizarDpto, nombreDpto: nombreDpto,
    claveDocente: claveDocente, LIMITES: LIMITES, PENDIENTE_INTERNACIONAL: PENDIENTE_INTERNACIONAL,
    esPendienteInternacional: esPendienteInternacional,
    unidadesDelCiclo: unidadesDelCiclo, indiceUnidades: indiceUnidades, unidadDe: unidadDe,
    asignacionesVigentes: asignacionesVigentes, coberturaUnidad: coberturaUnidad,
    claveDeDocente: claveDeDocente, calcularBalance: calcularBalance, excesosAlGuardar: excesosAlGuardar,
    sugerirDocentes: sugerirDocentes, interpretarCargaDepartamento: interpretarCargaDepartamento,
    CARRERAS: CARRERAS, ESTADOS: ESTADOS, TIPO_VERSION: TIPO_VERSION, REF: REF,
    TIPOS_AVISO: TIPOS_AVISO, aviso: aviso, comoAviso: comoAviso,
    nombreCarrera: nombreCarrera, normalizar: normalizar, canonica: canonica,
    matrizDesdeTexto: matrizDesdeTexto, ubicarCabeceras: ubicarCabeceras,
    siglaDeCarrera: siglaDeCarrera,
    interpretar: interpretar, num: num, th: th, totales: totales, esInternacional: esInternacional,
    agregarAsignatura: agregarAsignatura, eliminarAsignatura: eliminarAsignatura,
    agregarGrupo: agregarGrupo, agregarGrupoSemestre: agregarGrupoSemestre,
    eliminarGrupo: eliminarGrupo, desdoblar: desdoblar, quitarDesdoble: quitarDesdoble,
    fusionar: fusionar, deshacerFusion: deshacerFusion,
    conservarIds: conservarIds,
    marcasAfectadas: marcasAfectadas, reconciliarFusiones: reconciliarFusiones,
    sanearAsignaturas: sanearAsignaturas, sanearAsignaciones: sanearAsignaciones, sanearMarcas: sanearMarcas,
    contenidoCanonico: contenidoCanonico, hash: hash
  };
}

var Dominio = crearDominio_();
