/* Carga docente (CU-002) sobre los planes de un ciclo: la celda DOCENTE, el emparejamiento
   con la hoja General, las horas de cada docente, las reglas A07 a A13, la importación con
   docentes, los reemplazos y los consolidados por departamento y por docente.
   Como crearDominio(), crearDominioCarga() es pura y autocontenida: recibe el dominio, el
   servidor la ejecuta y la página recibe su texto. No puede usar nada de fuera de la función
   ni sintaxis que Apps Script V8 no admita («?.», «??»).
   Los planes de un ciclo se pasan como { SIGLA: asignaturas }, en el orden de las hojas. */
function crearDominioCarga(D) {
  "use strict";

  /* ============================================================
     Reglas de carga docente (requirements §8.6). Los umbrales viven aquí, aparte del
     código que los aplica; reglas(cambios) los ajusta sin reprogramar (RNF-11).
     A07, A08 y A11 impiden la asignación (P119); las demás advierten.
     ============================================================ */
  const REGLAS = {
    A07: { max: 40, bloquea: true },
    A08: { max: 16, bloquea: true },
    A09: { max: 24, bloquea: false },
    A10: { min: 8, bloquea: false },
    A11: { bloquea: true },
    A12: { max: 20, bloquea: false },
    A13: { bloquea: false }
  };

  function reglas(cambios) {
    const r = {};
    Object.keys(REGLAS).forEach(k => { r[k] = Object.assign({}, REGLAS[k], (cambios && cambios[k]) || {}); });
    return r;
  }

  /* ============================================================
     Celda DOCENTE (RF-092, RF-093): «A» asigna todo el grupo; «A / B» o «A // B» es
     cátedra compartida, la teoría para el primero y la práctica para el segundo; con
     subgrupos, un nombre por componente en orden. «Docente Internacional Pendiente» es la
     vacante internacional.
     ============================================================ */
  const VACANTE = "Docente Internacional Pendiente";
  const esVacante = t => { const n = D.normalizar(t); return n.indexOf("INTERNACIONAL") >= 0 && n.indexOf("PENDIENTE") >= 0; };

  /* Textos que no nombran a nadie: el componente queda sin docente y el texto se conserva,
     para no dar de alta en General a un docente llamado «PENDIENTE». */
  const SIN_DOCENTE = ["", "PENDIENTE", "POR ASIGNAR", "POR DESIGNAR", "POR DEFINIR", "POR CONFIRMAR",
                       "VACANTE", "SIN DOCENTE", "NN", "N N"];
  const esSinDocente = t => SIN_DOCENTE.indexOf(D.normalizar(t).replace(/[^A-Z]+/g, " ").trim()) >= 0;

  /* Cada parte conserva su posición, también si está vacía: «A / » deja la práctica sin docente. */
  function leerCeldaDocente(texto) {
    const t = String(texto == null ? "" : texto).trim();
    if (!t) return [];
    return t.split(/\s*\/\/?\s*/).map(s => {
      const x = s.trim();
      if (esVacante(x)) return { texto: x, vacante: true };
      if (esSinDocente(x)) return { texto: x, sinDocente: true };
      return { texto: x };
    });
  }

  /* Reparte las partes de la celda entre los componentes del grupo. */
  function repartir(g, partes) {
    const comps = D.componentes(g);
    const res = {};
    if (!partes.length) return { asignacion: res, aviso: null };
    const T = comps.filter(c => c.tipo === "T"), P = comps.filter(c => c.tipo === "P");
    if (partes.length === 1) comps.forEach(c => { res[c.clave] = partes[0]; });
    else if (partes.length === comps.length) comps.forEach((c, i) => { res[c.clave] = partes[i]; });
    else if (partes.length === 2 && T.length && P.length) {
      T.forEach(c => { res[c.clave] = partes[0]; });
      P.forEach(c => { res[c.clave] = partes[1]; });
    } else {
      comps.forEach((c, i) => { res[c.clave] = partes[Math.min(i, partes.length - 1)]; });
      const sobran = partes.slice(comps.length).map(p => "«" + p.texto + "»");
      return {
        asignacion: res,
        aviso: "trae " + partes.length + " nombres y el grupo tiene " + comps.length + " componente" + (comps.length === 1 ? "" : "s") +
               " (" + comps.map(c => c.clave).join(", ") + "): se asignaron en orden" +
               (sobran.length ? " y no se usó " + sobran.join(", ") : "") + "."
      };
    }
    return { asignacion: res, aviso: null };
  }

  const textoDe = x => x ? (x.vacante ? (x.texto || VACANTE) : String(x.texto || "")) : "";
  const distintos = l => l.filter((t, i) => l.indexOf(t) === i);

  /* Inverso de leerCeldaDocente: lo que se escribe en la celda DOCENTE de la hoja. */
  function escribirCeldaDocente(g) {
    const comps = D.componentes(g), asig = g.asignacion || {};
    const textos = comps.map(c => textoDe(asig[c.clave]));
    if (textos.every(t => !t)) return "";
    if (distintos(textos).length === 1) return textos[0];
    const T = comps.map((c, i) => c.tipo === "T" ? textos[i] : null).filter(t => t !== null);
    const P = comps.map((c, i) => c.tipo === "P" ? textos[i] : null).filter(t => t !== null);
    if (T.length && P.length && distintos(T).length === 1 && distintos(P).length === 1) return T[0] + " / " + P[0];
    return textos.join(" / ");
  }

  /* ============================================================
     Catálogo de docentes: la hoja General (CargaDeDocentes) con las marcas de P124.
     ============================================================ */
  const PARTICULAS = ["DE", "DEL", "LA", "LAS", "LOS", "Y", "E", "DA", "DI", "VAN", "VON"];
  const palabras = s => D.normalizar(s).replace(/[^A-Z]+/g, " ").split(" ").filter(Boolean);
  const claveNombre = s => palabras(s).sort().join(" ");

  const nombreVisible = d => {
    const ap = [d.paterno, d.materno].filter(Boolean).join(" ").trim();
    return ap + (d.nombres ? (ap ? ", " : "") + d.nombres : "");
  };
  const idDocente = d => d.dni ? "DNI:" + String(d.dni).trim() : "N:" + claveNombre([d.paterno, d.materno, d.nombres].join(" "));

  /* Un docente sin condición ni dedicación está «por completar» (P126): A08, A10 y A12
     esperan a que se completen sus datos. */
  const porCompletar = f => !String(f.condicion || "").trim() && !String(f.dedicacion || "").trim();
  const conDatos = f => !!f && !porCompletar(f);

  const CABECERAS_GENERAL = [
    ["n", t => /^N\W*$|^NRO|^NUM/.test(t)],
    ["dni", t => t === "DNI"],
    ["paterno", t => /PATERNO|APELLIDO PAT/.test(t)],
    ["materno", t => /MATERNO|APELLIDO MAT/.test(t)],
    ["nombres", t => t === "NOMBRES" || t === "NOMBRE"],
    ["condicion", t => /^CONDICION/.test(t)],
    ["categoria", t => /^CATEGORIA/.test(t)],
    ["nuevo", t => t === "NUEVO"],
    ["departamento", t => /^DEPARTAMENTO|^DPTO/.test(t)],
    ["dedicacion", t => /^DEDIC/.test(t)],
    ["tcOtraUniv", t => /TC.?OTRA.?UNIV/.test(t)],
    ["cargo", t => /^CARGO/.test(t)]
  ];

  const dedicacionDe = t => {
    const n = D.normalizar(t);
    return /^TC|TIEMPO COMPLETO/.test(n) ? "TC" : (/^TP|TIEMPO PARCIAL/.test(n) ? "TP" : "");
  };
  const siNo = t => /^(SI|S|X|TRUE|VERDADERO|1)$/.test(D.normalizar(t).replace(/[^A-Z0-9]/g, ""));

  function fichaDocente(d) {
    d.dpto = D.normalizarDpto(d.departamento) || null;
    d.nombre = nombreVisible(d);
    d.id = idDocente(d);
    d.porCompletar = porCompletar(d);
    return d;
  }

  /* Filas de la hoja General como fichas de docente. La fila de cabeceras es la primera
     con DNI y NOMBRES; las filas sin apellidos ni nombres (totales) se saltan. */
  function leerGeneral(matriz) {
    let filaCab = -1;
    const mapa = {};
    for (let i = 0; i < Math.min(matriz.length, 15) && filaCab < 0; i++) {
      const cab = (matriz[i] || []).map(c => D.normalizar(c));
      if (cab.indexOf("DNI") < 0 || !cab.some(c => c === "NOMBRES" || c === "NOMBRE")) continue;
      filaCab = i;
      cab.forEach((c, j) => {
        const e = CABECERAS_GENERAL.filter(x => x[1](c))[0];
        if (e && mapa[e[0]] === undefined) mapa[e[0]] = j;
      });
    }
    if (filaCab < 0) return [];
    const val = (f, k) => mapa[k] !== undefined && f[mapa[k]] != null ? String(f[mapa[k]]).trim() : "";
    const lista = [];
    matriz.slice(filaCab + 1).forEach(f => {
      if (!f) return;
      const d = {
        n: val(f, "n"), dni: val(f, "dni"), paterno: val(f, "paterno"), materno: val(f, "materno"), nombres: val(f, "nombres"),
        condicion: val(f, "condicion"), categoria: val(f, "categoria"), nuevo: val(f, "nuevo"),
        departamento: val(f, "departamento"), dedicacion: dedicacionDe(val(f, "dedicacion")),
        tcOtraUniv: siNo(val(f, "tcOtraUniv")), cargo: val(f, "cargo")
      };
      if (!d.paterno && !d.nombres) return;
      lista.push(fichaDocente(d));
    });
    return lista;
  }

  function indice(catalogo) {
    const m = new Map();
    (catalogo || []).forEach(f => m.set(f.id, f));
    return m;
  }

  /* ============================================================
     Emparejamiento de un nombre escrito con el catálogo (RF-096, P126). Sin distinguir
     tildes, puntuación, mayúsculas ni el orden «Apellido, Nombres»:
     - exacto: las mismas palabras;
     - probable: las palabras de uno de los dos nombres están todas en el otro, salvo a lo
       sumo una con una letra distinta («Ludgens» y «Lütgens»); el más corto necesita dos
       palabras. Se mira en los dos sentidos para que «Bernedo Flores Liz» y «Bernedo Flores
       Liz Sandra» sean la misma persona sea cual sea el que llega primero;
     - ambiguo: más de un candidato; nuevo: ninguno.
     ============================================================ */
  function distanciaUno(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else { i++; j++; }
    }
    return dif + (a.length - i) + (b.length - j) <= 1;
  }

  /* Todas las palabras de «menor» están en «mayor», con a lo sumo una errata. */
  function contenido(menor, mayor) {
    if (menor.length < 2) return false;
    const libres = mayor.slice();
    let erratas = 0;
    for (let i = 0; i < menor.length; i++) {
      const t = menor[i];
      let k = libres.indexOf(t);
      if (k < 0 && !erratas && t.length >= 3) {
        k = libres.findIndex(x => x.length >= 3 && distanciaUno(t, x));
        if (k >= 0) erratas++;
      }
      if (k < 0) return false;
      libres.splice(k, 1);
    }
    return true;
  }

  const sinParticulas = l => l.filter(t => PARTICULAS.indexOf(t) < 0);
  const parecido = (escritas, delCatalogo) =>
    contenido(sinParticulas(escritas), delCatalogo) || contenido(sinParticulas(delCatalogo), escritas);

  function emparejar(texto, catalogo) {
    const escritas = palabras(texto);
    if (!escritas.length) return { estado: "vacio" };
    const clave = escritas.slice().sort().join(" ");
    const lista = catalogo || [];
    const exactos = lista.filter(f => claveNombre(f.nombre) === clave);
    if (exactos.length === 1) return { estado: "exacto", docente: exactos[0] };
    if (exactos.length > 1) return { estado: "ambiguo", candidatos: exactos };
    const parecidos = lista.filter(f => parecido(escritas, palabras(f.nombre)));
    if (parecidos.length === 1) return { estado: "probable", docente: parecidos[0] };
    if (parecidos.length > 1) return { estado: "ambiguo", candidatos: parecidos };
    return { estado: "nuevo" };
  }

  /* Palabras con sus partículas pegadas a la siguiente: «Del Carpio», «de la Torre», «y León». */
  function unidades(s) {
    const res = [];
    let pendientes = [];
    String(s).split(" ").filter(Boolean).forEach(w => {
      if (PARTICULAS.indexOf(D.normalizar(w)) >= 0) pendientes.push(w);
      else { res.push(pendientes.concat([w]).join(" ")); pendientes = []; }
    });
    if (pendientes.length) {
      if (res.length) res[res.length - 1] += " " + pendientes.join(" ");
      else res.push(pendientes.join(" "));
    }
    return res;
  }

  /* «Apellidos, Nombres» o, sin coma, dos apellidos y el resto nombres. Es una
     aproximación: el docente queda «por completar» y sus datos se corrigen en la web. */
  function separarNombre(texto) {
    const t = String(texto).replace(/\s+/g, " ").trim();
    const coma = t.indexOf(",");
    let apellidos, nombres;
    if (coma >= 0) { apellidos = t.slice(0, coma).trim(); nombres = t.slice(coma + 1).trim(); }
    else { const u = unidades(t); apellidos = u.slice(0, 2).join(" "); nombres = u.slice(2).join(" "); }
    const ua = unidades(apellidos);
    return ua.length >= 2
      ? { paterno: ua.slice(0, -1).join(" "), materno: ua[ua.length - 1], nombres: nombres }
      : { paterno: apellidos, materno: "", nombres: nombres };
  }

  /* Ficha «por completar» para un nombre que no está en el catálogo (P126). */
  function altaPorCompletar(texto, catalogo) {
    const partes = separarNombre(texto);
    const n = (catalogo || []).reduce((m, f) => Math.max(m, parseInt(f.n, 10) || 0), 0) + 1;
    return fichaDocente({
      n: String(n), dni: "", paterno: partes.paterno, materno: partes.materno, nombres: partes.nombres,
      condicion: "", categoria: "", nuevo: "", departamento: "", dedicacion: "", tcOtraUniv: false, cargo: "",
      escrito: String(texto).trim()
    });
  }

  /* Asignación de un componente a partir de una parte de la celda. Da de alta en el
     catálogo (y en «altas») a quien no está. */
  function asignacionDeParte(parte, catalogo, altas) {
    if (parte.vacante) return { texto: parte.texto || VACANTE, vacante: "INTERNACIONAL" };
    if (parte.sinDocente) return parte.texto ? { texto: parte.texto, sinDocente: true } : null;
    const m = emparejar(parte.texto, catalogo);
    if (m.estado === "exacto" || m.estado === "probable") return { texto: parte.texto, id: m.docente.id, vinculo: m.estado };
    if (m.estado === "ambiguo") return { texto: parte.texto, id: null, vinculo: "ambiguo", candidatos: m.candidatos.map(f => f.id) };
    const nuevo = altaPorCompletar(parte.texto, catalogo);
    catalogo.push(nuevo);
    if (altas) altas.push(nuevo);
    return { texto: parte.texto, id: nuevo.id, vinculo: "nuevo" };
  }

  /* ============================================================
     Horas por docente (RF-095, §8.6)
     ============================================================ */
  const idDe = x => x.id || ("?:" + claveNombre(x.texto));
  const dictaAlguien = x => !!(x && !x.vacante && !x.sinDocente && String(x.texto || "").trim());

  function principales(planes) {
    const m = new Map();
    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach(a => a.grupos.forEach(g => {
      if (g.fusion && !m.has(g.fusion)) m.set(g.fusion, D.principalDeFusion(planes, g.fusion).g);
    })));
    return m;
  }

  /* Cada docente con sus horas, sus horas por carrera y sus componentes. Una sección
     fusionada suma solo en su grupo principal; sus demás grupos aparecen con 0 h, como en
     CargaXDepartamento. La vacante internacional no suma (P121). Un nombre sin vínculo
     (ambiguo) cuenta aparte, con su texto. */
  function cargaPorDocente(planes, catalogo) {
    const fichas = indice(catalogo);
    const prin = principales(planes);
    const porId = new Map(), orden = [];
    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach((a, ci) => a.grupos.forEach((g, gi) => {
      const esPrincipal = !g.fusion || prin.get(g.fusion) === g;
      D.componentes(g).forEach(c => {
        const x = (g.asignacion || {})[c.clave];
        if (!dictaAlguien(x)) return;
        const id = idDe(x);
        if (!porId.has(id)) {
          porId.set(id, { id: id, texto: x.texto, ficha: fichas.get(id) || null, horas: 0, porCarrera: {}, items: [] });
          orden.push(id);
        }
        const d = porId.get(id);
        const horas = esPrincipal ? c.horas : 0;
        d.horas += horas;
        d.porCarrera[sig] = (d.porCarrera[sig] || 0) + horas;
        d.items.push({
          sig: sig, ci: ci, gi: gi, malla: a.malla, sem: a.sem, codigo: a.codigo, nombre: a.nombre, dpto: a.dpto, obs: a.obs,
          grupo: g.n, comp: c.clave, tipo: c.tipo, horas: horas, fusion: g.fusion || null, principal: esPrincipal, turno: g.turno || ""
        });
      });
    })));
    return orden.map(id => porId.get(id));
  }

  /* ============================================================
     Reglas A07 a A13
     ============================================================ */
  const esOrdinario = f => D.normalizar(f.condicion).indexOf("ORDINARIO") >= 0;
  const semestreNumerico = s => typeof s === "number" || /^\d+$/.test(String(s).trim());
  const claveCruce = it => it.sig + "|" + D.normalizar(it.malla) + "|" + it.sem;
  const cursoDe = it => it.fusion || it.codigo || D.claveAsignatura(it.nombre);

  /* Asignaturas de cada carrera, malla y semestre (numérico). */
  function cursosPorClave(items) {
    const m = new Map();
    items.forEach(it => {
      if (!semestreNumerico(it.sem)) return;
      const k = claveCruce(it);
      if (!m.has(k)) m.set(k, new Map());
      if (!m.get(k).has(cursoDe(it))) m.get(k).set(cursoDe(it), it);
    });
    return m;
  }

  /* A11 (P123): dos asignaturas distintas de la misma carrera, malla y semestre. Una
     sección fusionada es un solo curso y otro grupo o subgrupo del mismo curso no cruza. */
  function cruces(items) {
    const res = [];
    cursosPorClave(items).forEach((cursos, k) => {
      if (cursos.size > 1) res.push({ clave: k, items: Array.from(cursos.values()) });
    });
    return res;
  }

  const describirCruce = x => {
    const it = x.items[0];
    return it.sig + ", malla " + it.malla + ", semestre " + it.sem + ": " +
           x.items.map(i => i.codigo + " " + i.nombre).join(" y ");
  };

  function advertenciasDocente(d, r) {
    const f = d.ficha, h = d.horas, res = [];
    const agregar = (codigo, mensaje, items) => res.push({ codigo: codigo, bloquea: !!r[codigo].bloquea, mensaje: mensaje, items: items || [] });
    if (h > r.A07.max) agregar("A07", "Supera las " + r.A07.max + " h lectivas semanales: tiene " + h + " h.");
    if (conDatos(f) && f.tcOtraUniv && h > r.A08.max)
      agregar("A08", "Tiene tiempo completo en otra universidad y supera las " + r.A08.max + " h: tiene " + h + " h.");
    if (h > r.A09.max && h <= r.A07.max) agregar("A09", "Supera las " + r.A09.max + " h semanales: tiene " + h + " h.");
    if (conDatos(f) && esOrdinario(f) && f.dedicacion === "TC" && h < r.A10.min)
      agregar("A10", "Es ordinario a tiempo completo y tiene menos de " + r.A10.min + " h: tiene " + h + " h.");
    cruces(d.items).forEach(x => agregar("A11", "Dicta asignaturas distintas del mismo semestre en " + describirCruce(x) + ".", x.items));
    if (conDatos(f) && String(f.cargo || "").trim() && h > r.A12.max)
      agregar("A12", "Tiene cargo (" + f.cargo + ") y supera las " + r.A12.max + " h: tiene " + h + " h.");
    return res;
  }

  /* A13: grupos de un plan con algún componente sin docente. */
  function sinDocente(asignaturas) {
    const res = [];
    (asignaturas || []).forEach((a, ci) => a.grupos.forEach((g, gi) => {
      const faltan = D.componentes(g).filter(c => !D.asignacionCubre((g.asignacion || {})[c.clave])).map(c => c.clave);
      if (faltan.length) res.push({ ci: ci, gi: gi, codigo: a.codigo, nombre: a.nombre, grupo: g.n, dpto: a.dpto, componentes: faltan });
    }));
    return res;
  }

  /* Balance del ciclo: cada docente con sus horas y advertencias, incluidos los del
     catálogo sin carga (A10 también los alcanza), y los grupos sin docente de cada plan. */
  function evaluarCiclo(planes, catalogo, cambios) {
    const r = reglas(cambios);
    const carga = cargaPorDocente(planes, catalogo);
    const vistos = new Set(carga.map(d => d.id));
    (catalogo || []).forEach(f => {
      if (!vistos.has(f.id)) carga.push({ id: f.id, texto: f.nombre, ficha: f, horas: 0, porCarrera: {}, items: [] });
    });
    carga.forEach(d => { d.advertencias = advertenciasDocente(d, r); });
    const pendientes = {};
    Object.keys(planes).forEach(sig => {
      const p = sinDocente(planes[sig]);
      pendientes[sig] = { grupos: p, advertencia: p.length
        ? { codigo: "A13", bloquea: false, mensaje: p.length + (p.length === 1 ? " grupo sin docente." : " grupos sin docente."), items: p }
        : null };
    });
    return { docentes: carga, pendientes: pendientes, reglas: r };
  }

  /* ============================================================
     Bloqueos (P119, P122): A07 y A08 impiden lo que sube las horas de un docente por
     encima del tope; A11, lo que le añade una asignatura a un semestre en que ya dicta
     otra. Lo que ya incumplía antes y la edición no empeora se deja pasar.
     ============================================================ */
  function mensajeBloqueo(codigo, d, extra) {
    const nombre = d.ficha ? d.ficha.nombre : d.texto;
    if (codigo === "A07") return nombre + " pasaría a " + d.horas + " h y el máximo es de " + extra + " h (A07).";
    if (codigo === "A08") return nombre + " tiene tiempo completo en otra universidad y pasaría a " + d.horas + " h; el máximo es de " + extra + " h (A08).";
    return nombre + " ya dicta otra asignatura del mismo semestre en " + extra + " (A11).";
  }

  function bloqueosDeDocente(antes, despues, r) {
    const res = [];
    const sube = despues.horas > antes.horas;
    if (r.A07.bloquea && sube && despues.horas > r.A07.max)
      res.push({ codigo: "A07", id: despues.id, mensaje: mensajeBloqueo("A07", despues, r.A07.max) });
    if (r.A08.bloquea && sube && conDatos(despues.ficha) && despues.ficha.tcOtraUniv && despues.horas > r.A08.max)
      res.push({ codigo: "A08", id: despues.id, mensaje: mensajeBloqueo("A08", despues, r.A08.max) });
    if (r.A11.bloquea) {
      const previos = cursosPorClave(antes.items);
      cursosPorClave(despues.items).forEach((cursos, k) => {
        if (cursos.size < 2) return;
        const tenia = previos.get(k) || new Map();
        const nuevos = Array.from(cursos.keys()).filter(c => !tenia.has(c));
        if (nuevos.length) {
          const x = { items: Array.from(cursos.values()) };
          res.push({ codigo: "A11", id: despues.id, mensaje: mensajeBloqueo("A11", despues, describirCruce(x)) });
        }
      });
    }
    return res;
  }

  function bloqueosDeCambio(antes, despues, catalogo, cambios) {
    const r = reglas(cambios);
    const previos = new Map(cargaPorDocente(antes, catalogo).map(d => [d.id, d]));
    const res = [];
    cargaPorDocente(despues, catalogo).forEach(d => {
      bloqueosDeDocente(previos.get(d.id) || { horas: 0, items: [] }, d, r).forEach(b => res.push(b));
    });
    return res;
  }

  /* ============================================================
     Asignar y reemplazar (web y hoja). ref: { sig, ci, gi }. La asignación de un grupo
     fusionado se propaga a toda la sección (RF-095). Si la edición incumpliría A07, A08
     o A11, no cambia nada y devuelve los bloqueos (P122).
     ============================================================ */
  const copia = x => JSON.parse(JSON.stringify(x));

  function miembrosDe(planes, ref) {
    const g = planes[ref.sig][ref.ci].grupos[ref.gi];
    return g.fusion ? D.gruposDeFusion(planes, g.fusion).map(x => x.g) : [g];
  }

  /* cambios: { CLAVE: asignación | null } por componente. */
  function aplicarAsignacion(planes, ref, cambios) {
    miembrosDe(planes, ref).forEach(g => {
      const asig = Object.assign({}, g.asignacion || {});
      Object.keys(cambios).forEach(k => {
        if (cambios[k]) asig[k] = copia(cambios[k]);
        else delete asig[k];
      });
      g.asignacion = Object.keys(asig).length ? asig : null;
      if (g.rechazos) {
        g.rechazos = g.rechazos.filter(x => !x.componentes.some(c => cambios[c] !== undefined));
        if (!g.rechazos.length) delete g.rechazos;
      }
    });
  }

  function asignar(planes, ref, cambios, catalogo, cambiosReglas) {
    const despues = copia(planes);
    aplicarAsignacion(despues, ref, cambios);
    const bloqueos = bloqueosDeCambio(planes, despues, catalogo, cambiosReglas);
    if (bloqueos.length) return { ok: false, bloqueos: bloqueos };
    aplicarAsignacion(planes, ref, cambios);
    return { ok: true, bloqueos: [] };
  }

  /* Reemplazo docente (RF-094): en cada componente indicado, el reemplazante pasa a ser el
     vigente y el anterior queda en el historial con el motivo, la resolución del Decanato,
     la fecha efectiva, quién lo registró y cuándo. */
  const MOTIVOS_REEMPLAZO = ["Licencia médica", "Gravidez", "Renuncia", "Comisión de servicio"];

  function reemplazar(planes, ref, claves, reemplazante, datos, catalogo, cambiosReglas) {
    const g = planes[ref.sig][ref.ci].grupos[ref.gi];
    const cambios = {};
    claves.forEach(k => {
      const actual = (g.asignacion || {})[k];
      const historial = (actual && actual.historial ? actual.historial.slice() : []);
      if (actual) historial.push({
        texto: actual.texto, id: actual.id || null, motivo: datos.motivo, resolucion: datos.resolucion,
        fechaEfectiva: datos.fechaEfectiva, usuario: datos.usuario, fecha: datos.fecha
      });
      cambios[k] = Object.assign({}, copia(reemplazante), { historial: historial });
    });
    return asignar(planes, ref, cambios, catalogo, cambiosReglas);
  }

  /* ============================================================
     Importación con docentes (P127, P122). «lecturas» son las de Dominio.interpretar
     ({ grupo, asignatura, texto }), en el orden en que se importan: las hojas en su orden y
     las filas de cada hoja de arriba abajo. DOCENTE solo se aplica si importa un Director,
     en las filas de su DPTO («TODOS», en cualquiera). Cada asignación se prueba contra lo ya
     asignado; la que incumpliría A07, A08 o A11 queda pendiente y su nombre, en «rechazos»
     del grupo, para la nota de la celda. Un grupo fusionado que no es el principal recibe
     el docente del principal.
     ============================================================ */
  function asignarImportados(planes, lecturas, catalogo, usuario, cambiosReglas) {
    const r = reglas(cambiosReglas);
    const avisos = [], pendientes = [], altas = [], vinculos = [], ambiguos = [];
    let ignoradas = 0;
    const puede = a => !!usuario && usuario.rol === "director" &&
      (usuario.departamento === "TODOS" || D.normalizarDpto(a.dpto) === usuario.departamento);

    const donde = new Map();
    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach((a, ci) => a.grupos.forEach((g, gi) => {
      donde.set(g, { sig: sig, ci: ci, gi: gi, a: a });
    })));
    const textoLeido = new Map((lecturas || []).map(l => [l.grupo, String(l.texto || "").trim()]));
    const nombreGrupo = u => u.sig + " " + u.a.codigo + " «" + u.a.nombre + "» (grupo " + u.a.grupos[u.gi].n + ")";

    /* Lo ya asignado en el ciclo: horas y asignaturas por semestre de cada docente. */
    const estado = new Map();
    cargaPorDocente(planes, catalogo).forEach(d => estado.set(d.id, d));
    const fichas = indice(catalogo);
    const estadoDe = (id, texto) => estado.get(id) || { id: id, texto: texto, ficha: fichas.get(id) || null, horas: 0, porCarrera: {}, items: [] };

    (lecturas || []).forEach(l => {
      const texto = String(l.texto || "").trim();
      const u = donde.get(l.grupo);
      if (!texto || !u) return;
      if (!puede(u.a)) { ignoradas++; return; }
      const g = l.grupo;

      if (g.fusion) {
        const p = D.principalDeFusion(planes, g.fusion);
        if (p && p.g !== g) {
          const delPrincipal = textoLeido.get(p.g) || "";
          if (delPrincipal && claveNombre(delPrincipal) !== claveNombre(texto))
            avisos.push(nombreGrupo(u) + " está fusionado con " + nombreGrupo(donde.get(p.g)) + ", que es el principal: se le asignó «" +
                        delPrincipal + "» y no «" + texto + "».");
          return;
        }
      }

      const rep = repartir(g, leerCeldaDocente(texto));
      if (rep.aviso) avisos.push(nombreGrupo(u) + ": la celda DOCENTE «" + texto + "» " + rep.aviso);
      const asignacion = {};
      Object.keys(rep.asignacion).forEach(k => {
        const x = asignacionDeParte(rep.asignacion[k], catalogo, altas);
        if (!x) return;
        if (x.id && !fichas.has(x.id)) fichas.set(x.id, catalogo.filter(f => f.id === x.id)[0]);
        asignacion[k] = x;
        if (x.vinculo === "probable" && !vinculos.some(v => v.texto === x.texto))
          vinculos.push({ texto: x.texto, docente: fichas.get(x.id).nombre });
        if (x.vinculo === "ambiguo" && !ambiguos.some(v => v.texto === x.texto)) {
          ambiguos.push({ texto: x.texto, candidatos: x.candidatos });
          avisos.push("«" + x.texto + "» (" + nombreGrupo(u) + ") se parece a varios docentes de General: " +
                      x.candidatos.map(id => fichas.get(id).nombre).join(", ") + ". Elige uno en la web.");
        }
      });

      /* Componentes de cada docente en este grupo y lo que sumarían en toda la sección. */
      const miembros = g.fusion ? D.gruposDeFusion(planes, g.fusion) : [{ sig: u.sig, ci: u.ci, gi: u.gi, a: u.a, g: g }];
      const porDocente = new Map();
      D.componentes(g).forEach(c => {
        const x = asignacion[c.clave];
        if (!dictaAlguien(x)) return;
        const id = idDe(x);
        if (!porDocente.has(id)) porDocente.set(id, { texto: x.texto, comps: [] });
        porDocente.get(id).comps.push(c);
      });
      porDocente.forEach((p, id) => {
        const antes = estadoDe(id, p.texto);
        const items = [];
        miembros.forEach(m => p.comps.forEach(c => items.push({
          sig: m.sig, ci: m.ci, gi: m.gi, malla: m.a.malla, sem: m.a.sem, codigo: m.a.codigo, nombre: m.a.nombre, dpto: m.a.dpto,
          obs: m.a.obs, grupo: m.g.n, comp: c.clave, tipo: c.tipo, horas: m.g === g ? c.horas : 0,
          fusion: m.g.fusion || null, principal: m.g === g, turno: m.g.turno || ""
        })));
        const despues = Object.assign({}, antes, {
          horas: antes.horas + items.reduce((s, it) => s + it.horas, 0),
          items: antes.items.concat(items)
        });
        const bloqueos = bloqueosDeDocente(antes, despues, r);
        if (bloqueos.length) {
          p.comps.forEach(c => { delete asignacion[c.clave]; });
          g.rechazos = (g.rechazos || []).concat([{ componentes: p.comps.map(c => c.clave), texto: p.texto,
                                                    codigo: bloqueos[0].codigo, motivo: bloqueos[0].mensaje }]);
          pendientes.push({ sig: u.sig, codigo: u.a.codigo, nombre: u.a.nombre, grupo: g.n, componentes: p.comps.map(c => c.clave),
                            texto: p.texto, regla: bloqueos[0].codigo, motivo: bloqueos[0].mensaje });
        } else {
          estado.set(id, despues);
        }
      });

      if (Object.keys(asignacion).length) {
        miembros.forEach(m => { m.g.asignacion = copia(asignacion); });
      }
    });

    if (ignoradas)
      avisos.push("Se ignoró la columna DOCENTE en " + ignoradas + (ignoradas === 1 ? " fila" : " filas") +
                  ": los docentes solo los asigna un Director, en las filas de su DPTO (P114, P127).");
    return { avisos: avisos, pendientes: pendientes, altas: altas, vinculos: vinculos, ambiguos: ambiguos, ignoradas: ignoradas };
  }

  /* ============================================================
     Consolidados (RF-097, RF-098)
     ============================================================ */

  /* Horas de cada docente por carrera y LECTIVAS, para la hoja General. */
  function horasGeneral(planes, catalogo) {
    const res = {};
    cargaPorDocente(planes, catalogo).forEach(d => { res[d.id] = { porCarrera: d.porCarrera, lectivas: d.horas }; });
    return res;
  }

  /* Filas de un docente agrupadas por grupo: sus HT y HP en ese grupo (0 en los grupos
     no principales de una sección fusionada). */
  function filasDeItems(items) {
    const porGrupo = new Map(), orden = [];
    items.forEach(it => {
      const k = it.sig + "|" + it.ci + "|" + it.gi;
      if (!porGrupo.has(k)) {
        porGrupo.set(k, { sig: it.sig, malla: it.malla, sem: it.sem, codigo: it.codigo, nombre: it.nombre, grupo: it.grupo,
                          dpto: it.dpto, obs: it.obs, turno: it.turno, fusion: it.fusion, principal: it.principal,
                          ht: 0, hp: 0, th: 0, componentes: [] });
        orden.push(k);
      }
      const f = porGrupo.get(k);
      if (it.tipo === "T") f.ht += it.horas; else f.hp += it.horas;
      f.th += it.horas;
      f.componentes.push(it.comp);
    });
    return orden.map(k => porGrupo.get(k));
  }

  const nombreDe = d => d.ficha ? d.ficha.nombre : d.texto;
  const porNombre = (x, y) => D.normalizar(nombreDe(x)).localeCompare(D.normalizar(nombreDe(y)));

  /* Hoja CARGA {DPTO} (RF-098): por docente, lo que le asignaron en las asignaturas que
     piden cobertura a ese departamento, en todas las carreras; aparte, los grupos del
     departamento sin docente; y las horas pedidas y cubiertas. */
  function consolidadoDepartamento(planes, catalogo, dpto) {
    const docentes = [];
    cargaPorDocente(planes, catalogo).forEach(d => {
      const items = d.items.filter(it => D.normalizarDpto(it.dpto) === dpto);
      if (!items.length) return;
      const filas = filasDeItems(items);
      docentes.push({ id: d.id, nombre: nombreDe(d), ficha: d.ficha, filas: filas, total: filas.reduce((s, f) => s + f.th, 0) });
    });
    docentes.sort(porNombre);

    const prin = principales(planes);
    const pendientes = [], vacantes = [];
    let pedidas = 0, cubiertas = 0;
    Object.keys(planes).forEach(sig => (planes[sig] || []).forEach(a => {
      if (D.normalizarDpto(a.dpto) !== dpto) return;
      a.grupos.forEach(g => {
        const cuenta = !g.fusion || prin.get(g.fusion) === g;
        const faltan = [];
        D.componentes(g).forEach(c => {
          const x = (g.asignacion || {})[c.clave];
          if (cuenta) pedidas += c.horas;
          if (D.asignacionCubre(x)) { if (cuenta) cubiertas += c.horas; }
          else faltan.push(c.clave);
        });
        const base = { sig: sig, malla: a.malla, sem: a.sem, codigo: a.codigo, nombre: a.nombre, grupo: g.n, turno: g.turno || "" };
        if (faltan.length) pendientes.push(Object.assign(base, { componentes: faltan, rechazos: g.rechazos || [] }));
        if (D.tieneVacante(g)) vacantes.push(Object.assign({}, base, { horas: cuenta ? D.horasDictado(g) : 0 }));
      });
    }));
    return {
      dpto: dpto, nombre: D.nombreDpto(dpto), docentes: docentes, pendientes: pendientes, vacantes: vacantes,
      horasPedidas: pedidas, horasCubiertas: cubiertas,
      cobertura: pedidas ? Math.round(1000 * cubiertas / pedidas) / 10 : 100
    };
  }

  /* Lo que dicta un docente en todo el ciclo, con sus advertencias. */
  function consolidadoDocente(planes, catalogo, id, cambios) {
    const d = evaluarCiclo(planes, catalogo, cambios).docentes.filter(x => x.id === id)[0];
    if (!d) return null;
    return { id: d.id, nombre: nombreDe(d), ficha: d.ficha, horas: d.horas, porCarrera: d.porCarrera,
             filas: filasDeItems(d.items), advertencias: d.advertencias };
  }

  return {
    REGLAS: REGLAS, reglas: reglas, VACANTE: VACANTE, MOTIVOS_REEMPLAZO: MOTIVOS_REEMPLAZO,
    leerCeldaDocente: leerCeldaDocente, repartir: repartir, escribirCeldaDocente: escribirCeldaDocente,
    leerGeneral: leerGeneral, fichaDocente: fichaDocente, palabras: palabras, claveNombre: claveNombre,
    emparejar: emparejar, separarNombre: separarNombre, altaPorCompletar: altaPorCompletar,
    cargaPorDocente: cargaPorDocente, cruces: cruces, advertenciasDocente: advertenciasDocente,
    sinDocente: sinDocente, evaluarCiclo: evaluarCiclo, bloqueosDeCambio: bloqueosDeCambio,
    asignar: asignar, reemplazar: reemplazar, asignarImportados: asignarImportados,
    horasGeneral: horasGeneral, consolidadoDepartamento: consolidadoDepartamento, consolidadoDocente: consolidadoDocente
  };
}

/* En Apps Script los archivos se cargan en orden y este no puede crear su objeto al
   cargarse sin saber si Dominio ya existe: se crea la primera vez que hace falta. */
var dominioCargaCache_ = null;

function dominioCarga_() {
  if (!dominioCargaCache_) dominioCargaCache_ = crearDominioCarga(Dominio);
  return dominioCargaCache_;
}
