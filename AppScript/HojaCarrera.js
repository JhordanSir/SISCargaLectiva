/* Hojas del libro (RF-080, RF-086 a RF-089, RF-097, RF-098): nombres, columnas y
   conversión entre el plan y las filas. Nada de este archivo toca Sheets: HojasLibro.js
   escribe lo que sale de aquí y entrega aquí lo que lee, así que todo se prueba en node.

   Hoja de carrera: título en la fila 1, cabeceras en la fila 3 y datos desde la fila 4.
   Un grupo es una fila; un grupo con desdoble parcial, una fila por subgrupo (P133). La
   columna oculta SIS guarda el identificador del grupo, la firma de lo que el sistema
   escribió en la fila (para saber qué se editó a mano) y el estado que no se ve: los
   docentes vinculados, la fusión, las horas previas a la fusión y los rechazos. */

var COLUMNAS_HOJA_ = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "TH", "DOCENTE", "DPTO",
                      "TURNO", "OBSERVACIONES", "GRUPO", "SUBGRUPO", "SECCIÓN", "SIS"];
var FILA_TITULO_ = 1;
var FILA_CABECERAS_ = 3;
var PRIMERA_FILA_ = 4;

/* Columnas que solo escribe el sistema y que la hoja protege (RF-087 a RF-089). */
var COLUMNAS_SISTEMA_ = ["SUBGRUPO", "SECCIÓN", "SIS"];

/* Columnas que firman la fila: las que se editan a mano. TH, SUBGRUPO, SECCIÓN y SIS las
   escribe el sistema. */
var COLUMNAS_FIRMA_ = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "DOCENTE", "DPTO", "TURNO",
                       "OBSERVACIONES", "GRUPO"];

/* Las notas que el sistema pone fuera de DOCENTE empiezan así, para no borrar las de las
   personas. */
var NOTA_SISTEMA_ = "SISCargaLectiva · ";

/* Colores de la celda DOCENTE (RF-087) y de SECCIÓN en los grupos no principales. */
var COLOR_RECHAZO_ = "#f4cccc";
var COLOR_SIN_DOCENTE_ = "#fff2cc";
var COLOR_VACANTE_ = "#cfe2f3";
var COLOR_FUSIONADO_ = "#efefef";

function col_(nombre) {
  return COLUMNAS_HOJA_.indexOf(nombre);
}

/* ============================================================
   Nombres (P131)
   ============================================================ */

var ROMANOS_CICLO_ = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function cicloRomano(ciclo) {
  var m = String(ciclo).match(/^(\d{4})-(\d+)$/);
  if (!m) return String(ciclo);
  var n = parseInt(m[2], 10);
  return m[1] + "-" + (ROMANOS_CICLO_[n] || m[2]);
}

function nombreHojaCarrera(sig, ciclo) {
  var c = Dominio.CARRERAS.filter(function (x) { return x.sig === sig; })[0];
  return (c ? c.hoja : sig) + " " + cicloRomano(ciclo);
}

function nombreHojaGeneral(ciclo) {
  return "General " + cicloRomano(ciclo);
}

function nombreHojaDepartamento(dpto, ciclo) {
  return "CARGA " + dpto + " " + cicloRomano(ciclo);
}

function tituloHojaCarrera(ciclo) {
  return "CARGA LECTIVA " + cicloRomano(ciclo);
}

/* ============================================================
   Plan → filas
   ============================================================ */

function numeroOTexto_(v) {
  var t = String(v == null ? "" : v).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

function valoresFirma_(valores) {
  return COLUMNAS_FIRMA_.map(function (c) { var v = valores[col_(c)]; return String(v == null ? "" : v).trim(); });
}

function firmaFila_(valores) {
  return Dominio.hash(JSON.stringify(COLUMNAS_FIRMA_.map(function (c) {
    var v = valores[col_(c)];
    return String(v == null ? "" : v).trim();
  })));
}

/* Las filas de un grupo: cada una con sus horas, los componentes cuyo docente lleva y su
   SUBGRUPO. En un desdoble de práctica la primera fila lleva la teoría y el primer
   subgrupo y las demás, solo su práctica; en uno de teoría, al revés (RF-088). */
function bloquesDeGrupo_(g) {
  var comps = Dominio.componentes(g);
  var T = comps.filter(function (c) { return c.tipo === "T"; });
  var P = comps.filter(function (c) { return c.tipo === "P"; });
  var claves = function (l) { return l.map(function (c) { return c.clave; }); };
  if (P.some(function (c) { return c.sub > 0; })) {
    return P.map(function (c, i) {
      return { claves: (i === 0 ? claves(T) : []).concat([c.clave]), ht: i === 0 ? g.ht : 0, hp: g.hp, sub: c.clave };
    });
  }
  if (T.some(function (c) { return c.sub > 0; })) {
    return T.map(function (c, i) {
      return { claves: [c.clave].concat(i === 0 ? claves(P) : []), ht: g.ht, hp: i === 0 ? g.hp : 0, sub: c.clave };
    });
  }
  return [{ claves: claves(comps), ht: g.ht, hp: g.hp, sub: "" }];
}

/* Lo que no se ve en las celdas. Las horas y las observaciones aceptadas sirven para
   rehacer un desdoble si alguien borró su primera fila y para saber si cambió una
   anotación de fusión. Una anotación cuya fusión espera a que se libere otra carrera
   (P139) no se da por aceptada: «obs» conserva el texto anterior y «ep», la espera. */
function estadoGrupo_(a, g) {
  var espera = a.esperaFusion || null;
  var s = { ht: g.ht, hp: g.hp, obs: espera ? (a.obsAceptada || "") : (a.obs || "") };
  if (espera) s.ep = espera;
  if (g.desdoble) s.d = g.desdoble;
  if (g.fusion) { s.fu = g.fusion; s.fp = g.fusionPrincipal === true; }
  if (g.previas) s.pr = g.previas;
  if (g.asignacion) s.a = g.asignacion;
  if (g.rechazos && g.rechazos.length) s.r = g.rechazos;
  return s;
}

function textoSeccion_(g, planes) {
  if (!g.fusion) return "";
  var p = Dominio.principalDeFusion(planes || {}, g.fusion);
  if (!p || p.g === g) return g.fusion + " · principal";
  return g.fusion + " · con " + p.sig + " " + p.a.codigo + (String(p.g.n) !== "1" ? " (grupo " + p.g.n + ")" : "");
}

/* Nota de la celda DOCENTE: cómo se vinculó cada nombre, la vacante, los reemplazos y lo
   que no se aceptó (P122, P126). */
function notaDocente_(g, claves) {
  var lineas = [];
  var agregar = function (t) { if (lineas.indexOf(t) < 0) lineas.push(t); };
  var asig = g.asignacion || {};
  claves.forEach(function (k) {
    var x = asig[k];
    if (!x) return;
    if (x.vacante) agregar("Vacante internacional: la cubre Internacionalización y sus horas no suman a nadie.");
    else if (x.vinculo === "probable") agregar("«" + x.texto + "» se vinculó por parecido con «" + (x.nombre || x.id) + "» de General.");
    else if (x.vinculo === "nuevo") agregar("«" + x.texto + "» no estaba en General: se dio de alta «por completar».");
    else if (x.vinculo === "ambiguo") agregar("«" + x.texto + "» se parece a varios docentes de General: elige uno en la web.");
    (x.historial || []).forEach(function (h) {
      agregar("Reemplaza a «" + h.texto + "» desde " + h.fechaEfectiva + " (" + h.motivo + ", resolución " + h.resolucion + ").");
    });
  });
  (g.rechazos || []).forEach(function (r) {
    if (r.componentes.some(function (c) { return claves.indexOf(c) >= 0; }))
      agregar("No se aceptó «" + r.texto + "»: " + r.motivo);
  });
  return lineas.join("\n");
}

function colorDocente_(g, claves) {
  var asig = g.asignacion || {};
  if ((g.rechazos || []).some(function (r) { return r.componentes.some(function (c) { return claves.indexOf(c) >= 0; }); }))
    return COLOR_RECHAZO_;
  if (claves.some(function (k) { return !Dominio.asignacionCubre(asig[k]); })) return COLOR_SIN_DOCENTE_;
  if (claves.some(function (k) { return asig[k] && asig[k].vacante; })) return COLOR_VACANTE_;
  return null;
}

/* Nota del sistema en OBSERVACIONES: la fusión en espera (P139) y la fila restaurada (P140). */
function notaObservaciones_(a) {
  var partes = [];
  if (a.esperaFusion) partes.push(a.esperaFusion.nota);
  if (a.notaSistema) partes.push(a.notaSistema);
  return partes.length ? NOTA_SISTEMA_ + partes.join(" ") : "";
}

/* Filas de la hoja de una carrera. planes: los del ciclo, para nombrar en SECCIÓN el grupo
   principal de una sección que une carreras. Por fila: los valores de las 16 columnas, el
   grupo y el subgrupo, las notas de DOCENTE y de OBSERVACIONES y los colores de DOCENTE y
   de SECCIÓN. SIS lleva, además, los valores aceptados de las columnas que se editan a
   mano («v»): con ellos se restaura o se revierte la fila (P122, P138, P140). */
function filasDeCarrera(sig, asignaturas, planes) {
  var C = dominioCarga_();
  var filas = [];
  (asignaturas || []).forEach(function (a) {
    a.grupos.forEach(function (g) {
      var estado = estadoGrupo_(a, g);
      var seccion = textoSeccion_(g, planes);
      bloquesDeGrupo_(g).forEach(function (b) {
        var valores = [sig, a.malla || "", String(a.sem == null ? "" : a.sem), a.codigo || "", a.nombre || "",
                       numeroOTexto_(b.ht), numeroOTexto_(b.hp), Dominio.num(b.ht) + Dominio.num(b.hp),
                       C.escribirCeldaDocente(g, b.claves), a.dpto || "", g.turno || "", a.obs || "",
                       String(g.n == null ? "" : g.n), b.sub, seccion, ""];
        valores[col_("SIS")] = JSON.stringify({ id: g.id, sub: b.sub, f: firmaFila_(valores), s: estado, v: valoresFirma_(valores) });
        filas.push({
          valores: valores, id: g.id, sub: b.sub,
          nota: notaDocente_(g, b.claves),
          notaObs: notaObservaciones_(a),
          colorDocente: colorDocente_(g, b.claves),
          colorSeccion: g.fusion && g.fusionPrincipal !== true ? COLOR_FUSIONADO_ : null
        });
      });
    });
  });
  return filas;
}

/* ============================================================
   Filas → plan
   ============================================================ */

function nuevoIdGrupo_() {
  return "g" + Math.random().toString(36).slice(2);
}

function leerSis_(texto) {
  if (!texto) return null;
  try {
    var s = JSON.parse(texto);
    return s && s.id ? s : null;
  } catch (e) {
    return null;
  }
}

/* SEMESTRE y GRUPO de una fila (P132): GRUPO manda; si está vacío, el sufijo de SEMESTRE
   («1-2») o 1. Un SEMESTRE que no es número da nombre a su bloque (RN-18). */
function semestreYGrupo_(celdas) {
  var bruto = celdas[col_("SEMESTRE")].trim();
  var ds = Dominio.descomponerSemestre(bruto);
  var sem = !isNaN(ds.sem) ? ds.sem : (bruto || "Sin semestre");
  var grupoBruto = celdas[col_("GRUPO")].trim();
  var n = grupoBruto !== "" ? (/^\d+$/.test(grupoBruto) ? parseInt(grupoBruto, 10) : grupoBruto) : (!isNaN(ds.grupo) ? ds.grupo : 1);
  return { sem: sem, n: n };
}

/* Plan de una carrera a partir de las filas de su hoja: los valores mostrados desde la
   fila 4, como los da getDisplayValues(). Junta las filas de un grupo por el identificador
   de SIS, recupera el estado que no se ve y compara cada fila con su firma para saber qué
   se editó a mano. Una fila sin SIS es un grupo nuevo escrito en la hoja.
   Los datos de la asignatura salen de su primera fila, salvo los que se editaron a mano en
   otra fila del mismo código: así un cambio vale en cualquiera de sus filas.
   Devuelve el plan, los cambios de DOCENTE que faltan pasar por las reglas
   ({ sig, ci, gi, claves, texto, fila }), las asignaturas cuya anotación de fusión es
   nueva o cambió, cuántas filas se editaron, dónde está cada grupo ({ id: [{ fila, sub }] }),
   las filas que conservan SIS pero se vaciaron ({ fila, sis }: un grupo o un subgrupo
   eliminado, P140) y los avisos. */
function planDeFilas(sig, filas) {
  var C = dominioCarga_();
  var avisos = [];
  var grupos = [];          // { filas: [...], fila }
  var porId = {};
  var vaciadas = [];

  (filas || []).forEach(function (f, i) {
    var celdas = COLUMNAS_HOJA_.map(function (c, j) { return f[j] == null ? "" : String(f[j]); });
    var fila = PRIMERA_FILA_ + i;
    var sis = leerSis_(celdas[col_("SIS")]);
    if (!celdas.slice(0, col_("SUBGRUPO")).some(function (c) { return c.trim() !== ""; })) {
      if (sis) vaciadas.push({ fila: fila, sis: sis });
      return;
    }
    var r = { fila: fila, celdas: celdas, sis: sis };
    r.editada = !r.sis || r.sis.f !== firmaFila_(celdas);
    var carrera = celdas[col_("CARRERA")].trim();
    if (carrera && !Dominio.coincideCarrera(carrera, sig))
      avisos.push("Fila " + r.fila + ": dice CARRERA «" + carrera + "», pero está en la hoja de " + sig + "; se toma como de " + sig + ".");
    if (r.sis) {
      var x = porId[r.sis.id];
      if (x && x.filas.some(function (y) { return y.sis.sub === r.sis.sub; })) {
        avisos.push("Fila " + r.fila + ": repite el identificador de la fila " + x.fila + "; se toma como un grupo nuevo.");
        r.sis = null; r.editada = true;
      } else if (x) {
        x.filas.push(r);
        return;
      }
    }
    var nuevo = { filas: [r], fila: r.fila };
    if (r.sis) porId[r.sis.id] = nuevo;
    grupos.push(nuevo);
  });

  /* ¿Se editó a mano esta columna de la fila? Sin los valores aceptados (hojas escritas
     antes de guardarlos), basta con que la fila esté editada. */
  var editadoEn = function (r, columna) {
    if (!r.sis) return true;
    if (!r.sis.v) return r.editada;
    var k = COLUMNAS_FIRMA_.indexOf(columna);
    return r.celdas[col_(columna)].trim() !== String(r.sis.v[k] == null ? "" : r.sis.v[k]).trim();
  };
  var CAMPOS_ASIGNATURA = [["MALLA", "malla"], ["ASIGNATURA", "nombre"], ["DPTO", "dpto"], ["OBSERVACIONES", "obs"]];

  var cambiosDocente = [], obsCambiadas = [], editadas = 0;
  var asignaturas = [], porClave = {}, ubicaciones = {};

  grupos.forEach(function (x) {
    var sis = x.filas[0].sis;
    var s = (sis && sis.s) || {};
    var tipo = x.filas.some(function (r) { return r.sis && /^P/.test(r.sis.sub || ""); }) ? "P"
             : x.filas.some(function (r) { return r.sis && /^T/.test(r.sis.sub || ""); }) ? "T" : "";
    var principal = x.filas.filter(function (r) { return !r.sis || !r.sis.sub || /^[PT]1$/.test(r.sis.sub); })[0] || x.filas[0];
    var c = principal.celdas;
    var editadasGrupo = x.filas.filter(function (r) { return r.editada; });
    editadas += editadasGrupo.length;

    /* Horas: las de la fila principal. En un desdoble, la parte repetida (la práctica de
       uno de práctica, la teoría de uno de teoría) se toma de la fila que se editó; si se
       borró la fila principal, las horas aceptadas completan lo que falta. */
    var ht = c[col_("HT")].trim(), hp = c[col_("HP")].trim();
    if (tipo && principal.sis && !/^[PT]1$/.test(principal.sis.sub)) {
      if (tipo === "P") ht = String(s.ht == null ? ht : s.ht);
      else hp = String(s.hp == null ? hp : s.hp);
    }
    var repetida = tipo === "P" ? "HP" : tipo === "T" ? "HT" : null;
    if (repetida) {
      var cambiada = editadasGrupo.filter(function (r) { return r.celdas[col_(repetida)].trim() !== String(repetida === "HP" ? s.hp : s.ht); })[0];
      if (cambiada) { if (repetida === "HP") hp = cambiada.celdas[col_("HP")].trim(); else ht = cambiada.celdas[col_("HT")].trim(); }
    }
    var sg = semestreYGrupo_(c);
    var g = {
      id: sis ? sis.id : nuevoIdGrupo_(), n: sg.n, ht: ht, hp: hp,
      desdoble: tipo && x.filas.length > 1 ? (tipo === "P" ? "PRA" : "TEO") + "×" + x.filas.length : null,
      fusion: s.fu || null, turno: c[col_("TURNO")].trim(), asignacion: s.a || null
    };
    if (s.fu) g.fusionPrincipal = s.fp === true;
    if (s.pr) g.previas = s.pr;
    if (s.r) g.rechazos = s.r;
    ubicaciones[g.id] = x.filas.map(function (r) { return { fila: r.fila, sub: r.sis ? r.sis.sub || "" : "" }; });

    /* La asignatura: la primera fila que la nombra da sus datos, como al importar; un dato
       editado a mano en otra de sus filas la corrige. */
    var codigo = c[col_("CODIGO")].trim(), nombre = c[col_("ASIGNATURA")].trim();
    var clave = codigo || nombre || ("fila-" + x.fila);
    var a = porClave[clave];
    if (!a) {
      a = porClave[clave] = { sem: sg.sem, malla: c[col_("MALLA")].trim(), codigo: codigo, nombre: nombre,
                              dpto: c[col_("DPTO")].trim(), obs: c[col_("OBSERVACIONES")].trim(), grupos: [] };
      asignaturas.push(a);
    } else {
      x.filas.forEach(function (r) {
        CAMPOS_ASIGNATURA.forEach(function (cp) { if (editadoEn(r, cp[0])) a[cp[1]] = r.celdas[col_(cp[0])].trim(); });
        if (editadoEn(r, "SEMESTRE")) a.sem = semestreYGrupo_(r.celdas).sem;
      });
    }
    if (a.obsAceptada == null && sis && s.obs != null) a.obsAceptada = s.obs;
    a.grupos.push(g);
    x.g = g; x.a = a; x.s = s; x.sis = sis;
  });

  /* Con cada asignatura ya completa: la espera de su fusión (P139), las anotaciones de
     fusión nuevas o cambiadas y los cambios de DOCENTE. Las claves de cada fila salen del
     grupo tal como queda; el texto aceptado, del estado. */
  grupos.forEach(function (x) {
    var g = x.g, a = x.a, s = x.s, sis = x.sis;
    if (s.ep && s.ep.texto === a.obs && !a.esperaFusion) a.esperaFusion = s.ep;
    if (Dominio.leerFusionTexto(a.obs) && (!sis || a.obs !== (s.obs || "")) && obsCambiadas.indexOf(a) < 0) obsCambiadas.push(a);
    var aceptado = { ht: s.ht, hp: s.hp, desdoble: s.d || null, asignacion: s.a || null };
    var bloquesNuevos = bloquesDeGrupo_(g), bloquesAceptados = sis ? bloquesDeGrupo_(aceptado) : [];
    x.filas.forEach(function (r, k) {
      var sub = r.sis ? r.sis.sub || "" : "";
      var bloque = bloquesNuevos.filter(function (b) { return b.sub === sub; })[0] || bloquesNuevos[k] || bloquesNuevos[0];
      var previo = bloquesAceptados.filter(function (b) { return b.sub === sub; })[0];
      var texto = r.celdas[col_("DOCENTE")].trim();
      var textoAceptado = previo ? C.escribirCeldaDocente(aceptado, previo.claves) : "";
      if (texto !== textoAceptado) cambiosDocente.push({ g: g, claves: bloque.claves, texto: texto, fila: r.fila });
    });
  });

  Dominio.ordenarAsignaturas(asignaturas);
  asignaturas.forEach(function (a) { a.grupos.sort(function (x, y) { return Dominio.num(x.n) - Dominio.num(y.n); }); });
  var refs = new Map();
  asignaturas.forEach(function (a, ci) { a.grupos.forEach(function (g, gi) { refs.set(g, { ci: ci, gi: gi }); }); });
  /* Una fila vaciada cuyo grupo y subgrupo siguen en otra fila no elimina nada. */
  vaciadas = vaciadas.filter(function (v) {
    return !(ubicaciones[v.sis.id] || []).some(function (u) { return u.sub === (v.sis.sub || ""); });
  });
  return {
    asignaturas: asignaturas,
    cambiosDocente: cambiosDocente.map(function (cb) {
      var r = refs.get(cb.g);
      return { sig: sig, ci: r.ci, gi: r.gi, claves: cb.claves, texto: cb.texto, fila: cb.fila };
    }),
    obsCambiadas: obsCambiadas,
    editadas: editadas,
    ubicaciones: ubicaciones,
    vaciadas: vaciadas,
    avisos: avisos
  };
}

/* Campos de la asignatura que solo sirven mientras se lee y se escribe la hoja: no van a
   las versiones ni a la web. */
var CAMPOS_TRANSITORIOS_ = ["obsAceptada", "esperaFusion", "notaSistema"];

function sinTransitorios(asignaturas) {
  return (asignaturas || []).map(function (a) {
    var b = {};
    Object.keys(a).forEach(function (k) { if (CAMPOS_TRANSITORIOS_.indexOf(k) < 0) b[k] = a[k]; });
    return b;
  });
}

/* ============================================================
   General (RF-097) y CARGA {DPTO} (RF-098)
   ============================================================ */

/* Las columnas de CargaDeDocentes, en su orden, más las marcas de P124 y el identificador. */
var COLUMNAS_GENERAL_ = ["N°", "DNI", "APELLIDO PAT", "APELLIDO MAT", "NOMBRES", "CONDICIÓN", "CATEGORÍA", "NUEVO",
                         "DEPARTAMENTO", "DEDIC.", "ADM", "DER", "ING", "ICO", "COM", "PSI", "IND", "ARQ", "LECTIVAS",
                         "TC_OTRA_UNIV", "CARGO_ADMIN", "ID"];
var CARRERAS_GENERAL_ = ["ADM", "DER", "ING", "ICO", "COM", "PSI", "IND", "ARQ"];

/* Filas de General: una por docente, por apellidos, con sus horas por carrera y LECTIVAS,
   y una fila de totales como en el Excel. */
function filasDeGeneral(catalogo, horas) {
  var porNombre = (catalogo || []).slice().sort(function (x, y) {
    return Dominio.normalizar(x.nombre).localeCompare(Dominio.normalizar(y.nombre));
  });
  var totales = CARRERAS_GENERAL_.map(function () { return 0; }), lectivas = 0;
  var filas = porNombre.map(function (f) {
    var h = (horas && horas[f.id]) || { porCarrera: {}, lectivas: 0 };
    var porCarrera = CARRERAS_GENERAL_.map(function (sig, i) {
      var v = h.porCarrera[sig] || 0;
      totales[i] += v;
      return v ? v : "";
    });
    lectivas += h.lectivas || 0;
    return [f.n || "", f.dni || "", f.paterno || "", f.materno || "", f.nombres || "", f.condicion || "", f.categoria || "",
            f.nuevo || "", f.departamento || "", f.dedicacion || ""].concat(porCarrera,
           [h.lectivas || 0, f.tcOtraUniv ? "Sí" : "", f.cargo || "", f.id]);
  });
  var total = ["", "", "", "", "", "", "", "", "", "TOTAL"].concat(totales, [lectivas, "", "", ""]);
  return { filas: filas, total: total };
}

var COLUMNAS_DEPARTAMENTO_ = ["DOCENTE", "CARRERA", "MALLA", "SEMESTRE", "CÓDIGO", "CURSO", "HT", "HP", "TOTAL HORAS", "CONDICIÓN"];

/* Filas de una hoja CARGA {DPTO}: cada docente con sus cursos (el nombre solo en la
   primera fila), su fila TOTAL y una fila en blanco, como CargaXDepartamento; después,
   los grupos del departamento sin docente y el resumen de horas. */
function filasDeDepartamento(consolidado) {
  var filas = [];
  var vacia = function () { return COLUMNAS_DEPARTAMENTO_.map(function () { return ""; }); };
  consolidado.docentes.forEach(function (d) {
    d.filas.forEach(function (f, i) {
      filas.push([i === 0 ? d.nombre : "", f.sig, f.malla || "", String(f.sem), f.codigo || "", f.nombre || "",
                  f.ht, f.hp, f.th, f.obs || ""]);
    });
    var total = vacia(); total[7] = "TOTAL"; total[8] = d.total;
    filas.push(total);
    filas.push(vacia());
  });
  if (consolidado.pendientes.length) {
    var titulo = vacia(); titulo[0] = "SIN DOCENTE";
    filas.push(titulo);
    consolidado.pendientes.forEach(function (p) {
      var motivo = (p.rechazos || []).map(function (r) { return "No se aceptó «" + r.texto + "» (" + r.codigo + ")"; }).join("; ");
      filas.push(["", p.sig, p.malla || "", String(p.sem), p.codigo || "", p.nombre || "", "", "", "",
                  "Grupo " + p.grupo + ": falta " + p.componentes.join(", ") + (motivo ? ". " + motivo : "")]);
    });
    filas.push(vacia());
  }
  var resumen = vacia();
  resumen[0] = "Horas pedidas: " + consolidado.horasPedidas + " · cubiertas: " + consolidado.horasCubiertas +
               " · cobertura: " + consolidado.cobertura + " %";
  filas.push(resumen);
  return filas;
}
