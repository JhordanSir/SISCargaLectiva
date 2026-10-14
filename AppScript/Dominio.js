/* Lógica de dominio de CU-001, compartida por el servidor y el navegador.
   El navegador recibe el texto de crearDominio() y lo ejecuta tal cual, así que
   la función no puede usar nada definido fuera de ella. */
function crearDominio() {
  "use strict";

  /* ============================================================
     Datos maestros
     ============================================================ */
  const DPTOS = ["DIMA", "DAHUC", "DACJ", "DACTE"];

  /* En el orden de las pestañas de los Excel, que es el del libro y el de la importación
     (P122). «hoja» es el nombre de su pestaña (P131); «alias» recoge las formas con que la
     carrera aparece en los Sheets y Excel reales (las siglas de la columna CARRERA y los
     nombres de las hojas). */
  const CARRERAS = [
    { sig: "ADM", nombre: "Administración de Empresas", hoja: "Adm. Neg. Int.",
      alias: ["Adm. Neg. Int.", "Administración de Negocios Internacionales"] },
    { sig: "DER", nombre: "Derecho", hoja: "Derecho", alias: [] },
    { sig: "ING", nombre: "Ingeniería de Software", hoja: "Ing. Software", alias: ["Ing. Software"] },
    { sig: "ICO", nombre: "Ingeniería Comercial", hoja: "Ing. Comercial", alias: ["Ing. Comercial"] },
    { sig: "COM", nombre: "Comunicación", hoja: "Cs. de la Comunicación",
      alias: ["Cs. de la Comunicación", "Ciencias de la Comunicación"] },
    { sig: "PSI", nombre: "Psicología", hoja: "Psicología", alias: [] },
    { sig: "ARQ", nombre: "Arquitectura", hoja: "Arquitectura", alias: [] },
    { sig: "IND", nombre: "Ingeniería Industrial", hoja: "Ing. Industrial", alias: ["Ing. Industrial"] }
  ];

  /* Plantilla única (P127): la de CargaXCarrera, con GRUPO opcional. DOCENTE y TURNO solo
     se reconocen por su cabecera: no se deducen del contenido. */
  const COLUMNAS = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "GRUPO",
                    "HT", "HP", "TOTAL HORAS", "DOCENTE", "DPTO", "TURNO", "OBSERVACIONES"];
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
     si no existe, devuelve la mejor candidata. En los Excel reales la columna del total
     repite «HT»; si la fila no tiene otra columna de total, esa segunda «HT» es TH (P117). */
  function ubicarCabeceras(matriz) {
    let mejor = null;
    for (let i = 0; i < matriz.length; i++) {
      const celdas = matriz[i].map(canonica);
      const conTotal = celdas.includes("TOTAL HORAS");
      const mapa = {}, repetidas = [];
      celdas.forEach((celda, j) => {
        const c = celda === "HT" && mapa.HT !== undefined && !conTotal && mapa["TOTAL HORAS"] === undefined
          ? "TOTAL HORAS" : celda;
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
  /* turno: dato de la oferta (P127). asignacion: el docente de cada componente
     (DominioCarga.js), o null mientras no hay ninguno. */
  const nuevoGrupo = (n, ht, hp) => ({ id: idGrupo(), n: n, ht: ht, hp: hp, desdoble: null, fusion: null,
                                       turno: "", asignacion: null });

  /* Componentes de dictado de un grupo (P84, RF-092): la teoría y la práctica, o sus
     subgrupos si el grupo tiene un desdoble parcial. Cada componente tiene su docente y sus
     horas: un desdoble de práctica repite las horas prácticas en cada subgrupo y mantiene
     una sola teoría. Un grupo sin horas tiene un componente de teoría de 0 h, para que
     también se le pueda asignar docente. */
  function desdobleDe(g) {
    const m = String(g.desdoble || "").match(/^(PRA|TEO)\D*(\d+)$/);
    return m ? { tipo: m[1], n: parseInt(m[2], 10) } : null;
  }

  function componentes(g) {
    const ht = num(g.ht), hp = num(g.hp), d = desdobleDe(g), res = [];
    const serie = (tipo, horas, n) => { for (let i = 1; i <= n; i++) res.push({ clave: tipo + i, tipo: tipo, horas: horas, sub: i }); };
    if (ht > 0) { if (d && d.tipo === "TEO") serie("T", ht, d.n); else res.push({ clave: "T", tipo: "T", horas: ht, sub: 0 }); }
    if (hp > 0) { if (d && d.tipo === "PRA") serie("P", hp, d.n); else res.push({ clave: "P", tipo: "P", horas: hp, sub: 0 }); }
    if (!res.length) res.push({ clave: "T", tipo: "T", horas: 0, sub: 0 });
    return res;
  }

  /* Horas que hay que cubrir con docentes: la teoría una vez y la práctica por subgrupo
     (RF-033: «los subgrupos de desdoble se suman»). */
  const horasDictado = g => componentes(g).reduce((s, c) => s + c.horas, 0);

  /* Un componente está cubierto si tiene un docente o la vacante internacional (RF-093);
     un texto que no nombra a nadie («PENDIENTE») no lo cubre. */
  const asignacionCubre = x => !!(x && (x.vacante || (String(x.texto || "").trim() && !x.sinDocente)));
  const cubierto = g => componentes(g).every(c => asignacionCubre((g.asignacion || {})[c.clave]));
  const tieneVacante = g => Object.keys(g.asignacion || {}).some(k => g.asignacion[k] && g.asignacion[k].vacante);

  function ordenar(asignaturas) {
    asignaturas.sort((a, b) => num(a.sem) - num(b.sem) || String(a.codigo).localeCompare(String(b.codigo)));
    return asignaturas;
  }

  /* opciones.carrera: sigla del plan. Las filas cuya CARRERA indique otra carrera
     se ignoran y se cuentan en «ignoradas»; una CARRERA vacía no excluye la fila.
     opciones.sinDuplicados: descarta la fila que repite código y grupo.
     Si hay columna DOCENTE, «lecturaDocente» trae, en el orden de las filas, el texto de
     cada grupo: lo aplica DominioCarga.asignarImportados, que conoce el catálogo y los
     permisos (P122, P127). Así el contenido del plan no lleva datos de paso. */
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
    const duplicadas = [], lecturaDocente = [];
    let sinCodigo = 0, ignoradas = 0;

    filas.forEach((f, orden) => {
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
      const g = nuevoGrupo(grupo, val(f, "HT"), val(f, "HP"));
      g.turno = val(f, "TURNO");
      a.grupos.push(g);
      if (mapa.DOCENTE !== undefined) lecturaDocente.push({ grupo: g, asignatura: a, texto: val(f, "DOCENTE"), orden: orden });
    });

    const asignaturas = Array.from(porClave.values());
    asignaturas.forEach(a => a.grupos.sort((x, y) => num(x.n) - num(y.n)));
    return { asignaturas: ordenar(asignaturas), ignoradas: ignoradas, duplicadas: duplicadas, lecturaDocente: lecturaDocente };
  }

  /* ============================================================
     Totales
     ============================================================ */
  const esInternacional = a => /INTERNACIONAL|VIRTUAL/i.test(a.obs || "");

  /* «dictado» son las horas que hay que cubrir con docentes: la práctica de un desdoble
     cuenta por subgrupo y una sección fusionada, una vez, con las horas de su grupo
     principal. Si la sección une carreras, cuenta en el plan del principal, para que la suma
     de los planes no la repita: los demás grupos llevan fusionPrincipal = false. Una sección
     sin esa marca (anterior a P118) cuenta con su primer grupo.
     «cub» son los grupos con docente en todos sus componentes y «vac», los que tienen la
     vacante internacional. */
  function totales(asignaturas) {
    const t = { asig: 0, grupos: 0, ht: 0, hp: 0, th: 0, dictado: 0, intl: 0, fus: 0, des: 0, sem: 0, cub: 0, vac: 0 };
    const sems = new Set();   // «sem» puede ser un número o un texto
    const secciones = new Map();
    (asignaturas || []).forEach(a => {
      t.asig++; sems.add(a.sem);
      if (esInternacional(a)) t.intl++;
      a.grupos.forEach(g => {
        t.grupos++; t.ht += num(g.ht); t.hp += num(g.hp); t.th += th(g);
        if (g.desdoble) t.des++;
        if (cubierto(g)) t.cub++;
        if (tieneVacante(g)) t.vac++;
        if (!g.fusion) { t.dictado += horasDictado(g); return; }
        const s = secciones.get(g.fusion) || { principal: null, primero: g, sinMarca: false };
        if (g.fusionPrincipal === true) s.principal = g;
        else if (g.fusionPrincipal !== false) s.sinMarca = true;
        secciones.set(g.fusion, s);
      });
    });
    secciones.forEach(s => {
      const cuenta = s.principal || (s.sinMarca ? s.primero : null);
      if (cuenta) t.dictado += horasDictado(cuenta);
    });
    t.fus = secciones.size; t.sem = sems.size;
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
    eliminarAsignaturaEnCiclo(enUnPlan(asignaturas), UNICO, ci);
  }

  function eliminarAsignaturaEnCiclo(planes, sig, ci) {
    const marcas = planes[sig][ci].grupos.map(g => g.fusion).filter(Boolean);
    planes[sig].splice(ci, 1);
    marcas.forEach(m => limpiarFusionHuerfanaEnCiclo(planes, m));
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
    eliminarGrupoEnCiclo(enUnPlan(asignaturas), UNICO, ci, gi);
  }

  function eliminarGrupoEnCiclo(planes, sig, ci, gi) {
    const a = planes[sig][ci];
    const marca = a.grupos[gi].fusion;
    a.grupos.splice(gi, 1);
    if (!a.grupos.length) planes[sig].splice(ci, 1);
    if (marca) limpiarFusionHuerfanaEnCiclo(planes, marca);
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

  /* ============================================================
     Fusiones. Una sección fusionada puede unir grupos de varias carreras (P118, RN-12):
     las funciones «EnCiclo» reciben los planes del ciclo como { SIGLA: asignaturas } y
     cada grupo como { sig, ci, gi }. Las de un solo plan (fusionar, deshacerFusion…) son
     el caso de un plan, con referencias "ci:gi".
     La sección toma las horas del grupo principal (fusionPrincipal = true; los demás,
     false); cada grupo cuyas horas cambian guarda las suyas para recuperarlas al deshacer.
     ============================================================ */
  const UNICO = "";
  const enUnPlan = asignaturas => { const p = {}; p[UNICO] = asignaturas; return p; };
  const refDeTexto = v => { const x = String(v).split(":").map(Number); return { sig: UNICO, ci: x[0], gi: x[1] }; };
  const mismaRef = (x, y) => x.sig === y.sig && x.ci === y.ci && x.gi === y.gi;

  function fusionar(asignaturas, refs, principal) {
    return fusionarEnCiclo(enUnPlan(asignaturas), refs.map(refDeTexto), refDeTexto(principal));
  }

  /* marca: identificador de la sección; si falta, se inventa uno. */
  function fusionarEnCiclo(planes, refs, principal, marca) {
    const par = r => { const a = planes[r.sig][r.ci]; return { sig: r.sig, a: a, g: a.grupos[r.gi] }; };
    const ref = par(principal);
    const m = marca || ("F" + Math.random().toString(36).slice(2, 6).toUpperCase());
    const difs = [], anteriores = new Set();
    const todos = refs.some(r => mismaRef(r, principal)) ? refs : refs.concat([principal]);
    todos.forEach(r => {
      const s = par(r);
      const esPrincipal = s.g === ref.g;
      if (!esPrincipal && (s.a.nombre !== ref.a.nombre || s.a.codigo !== ref.a.codigo ||
          num(s.g.ht) !== num(ref.g.ht) || num(s.g.hp) !== num(ref.g.hp)))
        difs.push((s.sig ? s.sig + " " : "") + s.a.codigo + " " + s.a.nombre + " (grupo " + s.g.n + ")");
      if (s.g.fusion && s.g.fusion !== m) anteriores.add(s.g.fusion);
      if (!esPrincipal && (s.g.ht !== ref.g.ht || s.g.hp !== ref.g.hp) && !s.g.previas)
        s.g.previas = { ht: s.g.ht, hp: s.g.hp };
      s.g.fusion = m;
      s.g.fusionPrincipal = esPrincipal;
      if (!esPrincipal) { s.g.ht = ref.g.ht; s.g.hp = ref.g.hp; }
    });
    anteriores.forEach(x => limpiarFusionHuerfanaEnCiclo(planes, x));
    return { marca: m, difs: difs };
  }

  function gruposDeFusion(planes, marca) {
    const res = [];
    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach((a, ci) => a.grupos.forEach((g, gi) => {
      if (marca && g.fusion === marca) res.push({ sig: sig, ci: ci, gi: gi, a: a, g: g });
    })));
    return res;
  }

  /* El grupo principal de la sección; si ninguno lleva la marca, el primero. */
  function principalDeFusion(planes, marca) {
    const grupos = gruposDeFusion(planes, marca);
    return grupos.filter(x => x.g.fusionPrincipal === true)[0] || grupos[0] || null;
  }

  function deshacerFusion(asignaturas, marca) {
    deshacerFusionEnCiclo(enUnPlan(asignaturas), marca);
  }

  function deshacerFusionEnCiclo(planes, marca) {
    gruposDeFusion(planes, marca).forEach(x => { x.g.fusion = null; delete x.g.fusionPrincipal; restaurarHoras(x.g); });
  }

  function limpiarFusionHuerfana(asignaturas, marca) {
    limpiarFusionHuerfanaEnCiclo(enUnPlan(asignaturas), marca);
  }

  function limpiarFusionHuerfanaEnCiclo(planes, marca) {
    if (gruposDeFusion(planes, marca).length < 2) deshacerFusionEnCiclo(planes, marca);
  }

  /* ============================================================
     Fusiones anotadas en OBSERVACIONES (P118, P130): «FUSIÓN ADM-4/ICO-4/COM-4»,
     «Fusión ADM 3/ ICO 5», «FUSIÓN CON COM-3», «Fusionado con ADM IV», «FUSION ING - 10».
     ============================================================ */
  const ROMANOS = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
                    XI: 11, XII: 12, XIII: 13, XIV: 14 };
  const claveAsignatura = s => normalizar(s).replace(/[^A-Z0-9]+/g, " ").trim();

  /* Partes citadas («SIGLA-semestre», en el orden del texto) y si dice «CON»; null si el
     texto no habla de fusión. La sigla puede ir pegada al semestre («ADM4»). */
  function leerFusionTexto(obs) {
    const t = normalizar(obs);
    if (!/FUSI/.test(t)) return null;
    const re = new RegExp("(?:^|[^A-Z])(" + CARRERAS.map(c => c.sig).join("|") +
                          ")\\s*-?\\s*(\\d{1,2}|[IVX]{1,4})(?![A-Z0-9])", "g");
    const partes = [];
    let m;
    while ((m = re.exec(t))) {
      const sem = /^\d/.test(m[2]) ? parseInt(m[2], 10) : ROMANOS[m[2]];
      if (sem) partes.push({ sig: m[1], sem: sem });
    }
    return { partes: partes, con: /(^|[^A-Z])CON([^A-Z]|$)/.test(t) };
  }

  const etiquetaParte = p => p.sig + "-" + p.sem;

  /* Convierte en fusiones del sistema las anotaciones de OBSERVACIONES de los planes de un
     ciclo ({ SIGLA: asignaturas }). Cada parte señala la asignatura del mismo nombre en ese
     semestre de esa carrera, y en ella el grupo del mismo número o, si tiene uno solo, ese.
     Las anotaciones que comparten grupos forman una sección. Cada anotación propone como
     principal a la primera carrera citada que se localiza; las listas mandan sobre los «CON»
     y, si las propuestas no coinciden, gana la sigla alfabéticamente anterior y, en la misma
     carrera, el menor semestre (P130). Devuelve las secciones creadas y los avisos.
     opciones.solo(asignatura, sigla): lee solo las anotaciones de esas asignaturas. Al leer
     la hoja se usa para las anotaciones nuevas o cambiadas: una anotación que ya creó su
     sección es solo texto (P134) y no debe rehacer una fusión que se deshizo. */
  function fusionesDesdeObservaciones(planes, opciones) {
    const avisos = [], anotaciones = [];
    const solo = opciones && opciones.solo;
    const nombreDe = r => r.sig + " " + planes[r.sig][r.ci].codigo + " «" + planes[r.sig][r.ci].nombre + "»";

    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach((a, ci) => {
      if (solo && !solo(a, sig)) return;
      const lectura = leerFusionTexto(a.obs);
      if (!lectura) return;
      const esPropia = p => p.sig === sig && String(p.sem) === String(a.sem);
      const lista = !lectura.con && lectura.partes.length >= 2 && lectura.partes.some(esPropia);
      a.grupos.forEach((g, gi) => {
        const propia = { sig: sig, ci: ci, gi: gi };
        const miembros = [propia];
        let propuesta = null;
        lectura.partes.forEach(p => {
          if (esPropia(p)) { if (lista && !propuesta) propuesta = propia; return; }
          const k = claveAsignatura(a.nombre);
          const cis = [];
          (planes[p.sig] || []).forEach((x, i) => { if (String(x.sem) === String(p.sem) && claveAsignatura(x.nombre) === k) cis.push(i); });
          if (!cis.length) {
            avisos.push(nombreDe(propia) + ": «" + a.obs + "» cita " + etiquetaParte(p) + ", pero en " + etiquetaParte(p) +
                        " no hay ninguna asignatura «" + a.nombre + "». Esa parte queda como texto.");
            return;
          }
          if (cis.length > 1)
            avisos.push(nombreDe(propia) + ": en " + etiquetaParte(p) + " hay " + cis.length + " asignaturas «" + a.nombre +
                        "» (" + cis.map(i => planes[p.sig][i].codigo).join(", ") + "); se tomó " + planes[p.sig][cis[0]].codigo + ".");
          const destino = planes[p.sig][cis[0]];
          let gj = destino.grupos.findIndex(x => String(x.n) === String(g.n));
          if (gj < 0 && destino.grupos.length === 1) gj = 0;
          if (gj < 0) {
            avisos.push(nombreDe(propia) + " (grupo " + g.n + "): en " + etiquetaParte(p) + " «" + a.nombre + "» no tiene el grupo " +
                        g.n + " y tiene varios. Esa parte queda como texto.");
            return;
          }
          const r = { sig: p.sig, ci: cis[0], gi: gj };
          if (!miembros.some(x => mismaRef(x, r))) miembros.push(r);
          if (!propuesta) propuesta = r;
        });
        if (miembros.length > 1) anotaciones.push({ miembros: miembros, propuesta: propuesta, lista: lista, texto: a.obs });
      });
    }));

    /* Secciones: las anotaciones que comparten algún grupo se unen. */
    const clave = r => r.sig + "|" + r.ci + "|" + r.gi;
    const padre = new Map();
    const raiz = k => { while (padre.get(k) !== k) k = padre.get(k); return k; };
    anotaciones.forEach(an => an.miembros.forEach(r => { if (!padre.has(clave(r))) padre.set(clave(r), clave(r)); }));
    anotaciones.forEach(an => an.miembros.slice(1).forEach(r => padre.set(raiz(clave(r)), raiz(clave(an.miembros[0])))));
    const secciones = new Map();
    anotaciones.forEach(an => {
      const k = raiz(clave(an.miembros[0]));
      if (!secciones.has(k)) secciones.set(k, { miembros: [], listas: [], cons: [], textos: [] });
      const s = secciones.get(k);
      an.miembros.forEach(r => { if (!s.miembros.some(x => mismaRef(x, r))) s.miembros.push(r); });
      if (an.propuesta) (an.lista ? s.listas : s.cons).push(an.propuesta);
      if (s.textos.indexOf(an.texto) < 0) s.textos.push(an.texto);
    });

    const semDe = r => num(planes[r.sig][r.ci].sem);
    const desempate = refs => refs.slice().sort((x, y) => x.sig.localeCompare(y.sig) || semDe(x) - semDe(y) || x.ci - y.ci || x.gi - y.gi)[0];
    const resultado = [];
    secciones.forEach(s => {
      const propuestas = s.listas.length ? s.listas : s.cons;
      const distintas = propuestas.filter((r, i) => propuestas.findIndex(x => mismaRef(x, r)) === i);
      let principal = distintas[0] || desempate(s.miembros);
      if (distintas.length > 1) {
        principal = desempate(distintas);
        avisos.push("Las anotaciones de la fusión de «" + planes[principal.sig][principal.ci].nombre + "» (" + s.textos.join("; ") +
                    ") no coinciden en el grupo principal; se tomó " + principal.sig + "-" + planes[principal.sig][principal.ci].sem +
                    ": la sigla alfabéticamente anterior y, en la misma carrera, el menor semestre.");
      }
      const firma = s.miembros.map(r => r.sig + ":" + planes[r.sig][r.ci].codigo + ":" + planes[r.sig][r.ci].grupos[r.gi].n).sort().join(",");
      const r = fusionarEnCiclo(planes, s.miembros, principal, "F" + hash(firma).slice(-6).toUpperCase());
      resultado.push({
        marca: r.marca, difs: r.difs, textos: s.textos,
        principal: { sig: principal.sig, codigo: planes[principal.sig][principal.ci].codigo, grupo: planes[principal.sig][principal.ci].grupos[principal.gi].n },
        miembros: s.miembros.map(x => ({ sig: x.sig, codigo: planes[x.sig][x.ci].codigo, grupo: planes[x.sig][x.ci].grupos[x.gi].n }))
      });
    });
    return { secciones: resultado, avisos: avisos };
  }

  /* ============================================================
     Firma del contenido, para saber si un plan cambió entre dos lecturas
     ============================================================ */
  function contenidoCanonico(asignaturas) {
    return JSON.stringify((asignaturas || []).map(a => [
      a.sem, a.malla, a.codigo, a.nombre, a.dpto, a.obs,
      a.grupos.map(g => [g.n, g.ht, g.hp, g.desdoble || null, g.fusion || null, g.fusionPrincipal === true,
                         g.turno || "", g.asignacion || null])
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
     Departamentos académicos (los usa DominioCarga.js para la carga docente)
     ============================================================ */
  const DPTOS_INFO = {
    DIMA: { sigla: "DIMA", nombre: "Departamento de Ingeniería y Matemáticas", alias: ["INGENIERIA Y MATEMATICAS", "INGENIERIA", "MATEMATICAS", "DIMA"] },
    DAHUC: { sigla: "DAHUC", nombre: "Departamento de Humanidades y Comunicación", alias: ["HUMANIDADES Y COM.", "HUMANIDADES Y CIENCIAS SOCIALES", "HUMANIDADES", "COMUNICACION", "DAHUC"] },
    DACJ: { sigla: "DACJ", nombre: "Departamento de Ciencias Jurídicas", alias: ["CIENCIAS JURIDICAS", "DERECHO", "DACJ"] },
    DACTE: { sigla: "DACTE", nombre: "Departamento de Ciencias y Tecnologías Empresariales", alias: ["CS. Y TEC. EMPRESARIALES", "CIENCIAS Y TECNOLOGIAS EMPRESARIALES", "EMPRESARIALES", "DACTE"] }
  };

  function normalizarDpto(s) {
    if (!s) return null;
    const n = normalizar(s);
    for (const sigla of Object.keys(DPTOS_INFO)) {
      if (sigla === n) return sigla;
      const alist = DPTOS_INFO[sigla].alias;
      for (let i = 0; i < alist.length; i++) {
        const al = normalizar(alist[i]);
        if (al === n || n.indexOf(al) >= 0 || al.indexOf(n) >= 0) return sigla;
      }
    }
    return null;
  }

  function nombreDpto(sigla) {
    const info = DPTOS_INFO[sigla];
    return info ? info.nombre : sigla;
  }

  return {
    DPTOS: DPTOS, DPTOS_INFO: DPTOS_INFO, normalizarDpto: normalizarDpto, nombreDpto: nombreDpto,
    CARRERAS: CARRERAS, COLUMNAS: COLUMNAS, ESTADOS: ESTADOS,
    nombreCarrera: nombreCarrera, normalizar: normalizar, canonica: canonica,
    matrizDesdeTexto: matrizDesdeTexto, ubicarCabeceras: ubicarCabeceras,
    coincideCarrera: coincideCarrera, siglaDeCarrera: siglaDeCarrera,
    descomponerSemestre: descomponerSemestre, deducirColumnas: deducirColumnas,
    interpretar: interpretar, num: num, th: th, totales: totales, esInternacional: esInternacional,
    ordenarAsignaturas: ordenar,
    agregarAsignatura: agregarAsignatura, eliminarAsignatura: eliminarAsignatura,
    agregarGrupo: agregarGrupo, agregarGrupoSemestre: agregarGrupoSemestre,
    eliminarGrupo: eliminarGrupo, desdoblar: desdoblar, quitarDesdoble: quitarDesdoble,
    fusionar: fusionar, deshacerFusion: deshacerFusion, limpiarFusionHuerfana: limpiarFusionHuerfana,
    contenidoCanonico: contenidoCanonico, hash: hash,
    desdobleDe: desdobleDe, componentes: componentes, horasDictado: horasDictado,
    asignacionCubre: asignacionCubre, cubierto: cubierto, tieneVacante: tieneVacante,
    eliminarAsignaturaEnCiclo: eliminarAsignaturaEnCiclo, eliminarGrupoEnCiclo: eliminarGrupoEnCiclo,
    fusionarEnCiclo: fusionarEnCiclo, deshacerFusionEnCiclo: deshacerFusionEnCiclo,
    limpiarFusionHuerfanaEnCiclo: limpiarFusionHuerfanaEnCiclo, gruposDeFusion: gruposDeFusion,
    principalDeFusion: principalDeFusion, leerFusionTexto: leerFusionTexto,
    fusionesDesdeObservaciones: fusionesDesdeObservaciones, claveAsignatura: claveAsignatura
  };
}

var Dominio = crearDominio();
