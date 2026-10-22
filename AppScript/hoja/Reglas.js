// @ts-nocheck
/* ============================================================
   SISCargaLectiva · motor de advertencias del Centro de datos
   Funciones puras (sin servicios de Google): reciben las celdas tal como se ven
   (getDisplayValues) y devuelven la lista de advertencias. Reproducen las reglas
   con que la app SISCargaLectiva lee los Excel y la pestaña Usuarios, para avisar
   antes de enviar. Las prueba pruebas/centro.test.mjs con Node.
   Niveles: «error» (la app descarta o rechaza el dato), «advertencia» (la app lo
   acepta, pero conviene revisarlo) y «observacion» (no cambia lo que hace la app).
   ============================================================ */
var Reglas = (function () {
  "use strict";

  var DPTOS = {
    DIMA: ["INGENIERIA Y MATEMATICAS", "INGENIERIA", "MATEMATICAS", "DIMA"],
    DAHUC: ["HUMANIDADES Y COM.", "HUMANIDADES Y CIENCIAS SOCIALES", "HUMANIDADES", "COMUNICACION", "DAHUC", "DAHU"],
    DACJ: ["CIENCIAS JURIDICAS", "DERECHO", "DACJ"],
    DACTE: ["CS. Y TEC. EMPRESARIALES", "CIENCIAS Y TECNOLOGIAS EMPRESARIALES", "EMPRESARIALES", "DACTE"]
  };

  var CARRERAS = [
    { sig: "ING", nombre: "Ingeniería de Software", alias: ["Ing. Software"] },
    { sig: "IND", nombre: "Ingeniería Industrial", alias: ["Ing. Industrial"] },
    { sig: "ADM", nombre: "Administración de Empresas", alias: ["Adm. Neg. Int.", "Administración de Negocios Internacionales"] },
    { sig: "DER", nombre: "Derecho", alias: [] },
    { sig: "ARQ", nombre: "Arquitectura", alias: [] },
    { sig: "PSI", nombre: "Psicología", alias: [] },
    { sig: "COM", nombre: "Comunicación", alias: ["Cs. de la Comunicación", "Ciencias de la Comunicación"] },
    { sig: "ICO", nombre: "Ingeniería Comercial", alias: ["Ing. Comercial"] }
  ];

  var LIMITES = { MAXIMO: 40, TC_OTRA: 16, ORDINARIO: 24, CARGO: 20, CARGO_SEVERO: 24, MINIMO_TP: 8, JORNADA_TC: 40 };

  /* ---------- normalización (igual que Dominio.normalizar de la app) ---------- */
  function normalizar(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().trim().replace(/\s+/g, " ");
  }
  function claveCarrera(v) { return normalizar(v).replace(/[.\-–—]/g, " ").replace(/\s+/g, " ").trim(); }
  function claveDocente(v) { return normalizar(v).replace(/[,.\-–—]/g, " ").replace(/\s+/g, " ").trim(); }

  function siglaDeCarrera(valor) {
    var v = claveCarrera(valor);
    if (!v) return null;
    for (var i = 0; i < CARRERAS.length; i++) {
      var c = CARRERAS[i], formas = [c.sig, c.nombre].concat(c.alias);
      for (var j = 0; j < formas.length; j++) if (claveCarrera(formas[j]) === v) return c.sig;
    }
    return null;
  }

  function normalizarDpto(s) {
    var n = normalizar(s);
    if (!n) return null;
    for (var sigla in DPTOS) {
      if (sigla === n) return sigla;
      var alias = DPTOS[sigla];
      for (var i = 0; i < alias.length; i++) {
        var al = normalizar(alias[i]);
        if (al === n || n.indexOf(al) >= 0 || (n.length >= 4 && al.indexOf(n) >= 0)) return sigla;
      }
    }
    return null;
  }

  function esEntero(v) { return /^-?\d+$/.test(String(v).trim()); }
  function esNumero(v) { return /^-?\d+([.,]\d+)?$/.test(String(v).trim()); }
  function num(v) {
    var m = String(v == null ? "" : v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }
  function vacia(v) { return String(v == null ? "" : v).trim() === ""; }
  function filaVacia(f) { return !f || f.every(vacia); }

  /* «5» = semestre 5; «1-2» o «1/2» = semestre 1, grupo 2. */
  function semestre(v) {
    var t = String(v == null ? "" : v).trim();
    if (esEntero(t)) return { sem: parseInt(t, 10), grupo: null, ok: true };
    var m = t.match(/^(\d+)\s*[-\/]\s*(\d+)$/);
    if (m) return { sem: parseInt(m[1], 10), grupo: parseInt(m[2], 10), ok: true };
    return { sem: null, grupo: null, ok: false };
  }

  function adv(lista, hoja, fila, col, nivel, codigo, mensaje) {
    lista.push({ hoja: hoja, fila: fila, col: col, nivel: nivel, codigo: codigo, mensaje: mensaje });
  }

  /* ============================================================
     Oferta por carrera (libro CargaXCarrera: una hoja por carrera)
     ============================================================ */
  var COLUMNAS_OFERTA = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "GRUPO", "HT", "HP", "TOTAL HORAS", "DPTO", "OBSERVACIONES"];
  var SINONIMOS = { "OBSERVACION": "OBSERVACIONES", "TH": "TOTAL HORAS", "TOTAL DE HORAS": "TOTAL HORAS" };
  function canonica(s) { var n = normalizar(s); return SINONIMOS[n] || n; }

  /* Cabecera: la fila (de las 15 primeras) con más columnas de la plantilla. La segunda
     «HT» de los Excel reales es el total de horas. */
  function cabeceraOferta(valores) {
    var mejor = null;
    for (var i = 0; i < Math.min(15, valores.length); i++) {
      var mapa = {}, n = 0;
      (valores[i] || []).forEach(function (c, j) {
        var k = canonica(c);
        if (COLUMNAS_OFERTA.indexOf(k) < 0) return;
        if (mapa[k] === undefined) { mapa[k] = j; n++; }
        else if (k === "HT" && mapa["TOTAL HORAS"] === undefined) mapa["TOTAL HORAS"] = j;
      });
      if (n && (!mejor || n > mejor.n)) mejor = { fila: i, mapa: mapa, n: n };
    }
    return mejor;
  }

  /* Carrera de una hoja: por su nombre o, si no, la sigla que más aparece en sus celdas. */
  function carreraDeHoja(nombre, valores) {
    var s = siglaDeCarrera(nombre);
    if (s) return s;
    var cuenta = {};
    valores.forEach(function (f) { (f || []).forEach(function (c) { var x = siglaDeCarrera(c); if (x) cuenta[x] = (cuenta[x] || 0) + 1; }); });
    var orden = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; });
    return orden[0] || null;
  }

  /* Filas de la oferta ya interpretadas, para el índice de cursos. */
  function leerOferta(valores, nombreHoja) {
    var cab = cabeceraOferta(valores);
    var sigla = carreraDeHoja(nombreHoja, valores);
    var filas = [];
    if (!cab) return { cab: null, sigla: sigla, filas: filas };
    var m = cab.mapa;
    var val = function (f, k) { return m[k] !== undefined && f[m[k]] != null ? String(f[m[k]]).trim() : ""; };
    for (var r = cab.fila + 1; r < valores.length; r++) {
      var f = valores[r] || [];
      if (filaVacia(f)) continue;
      var sem = semestre(val(f, "SEMESTRE"));
      var grupoCol = val(f, "GRUPO");
      filas.push({
        r: r, codigo: val(f, "CODIGO"), nombre: val(f, "ASIGNATURA"), carrera: val(f, "CARRERA"),
        semestre: val(f, "SEMESTRE"), sem: sem, grupo: grupoCol !== "" ? String(num(grupoCol) || grupoCol) : String(sem.grupo || 1),
        grupoCol: grupoCol, ht: val(f, "HT"), hp: val(f, "HP"), th: val(f, "TOTAL HORAS"), dpto: val(f, "DPTO"), obs: val(f, "OBSERVACIONES")
      });
    }
    return { cab: cab, sigla: sigla, filas: filas };
  }

  /* hojas: [{nombre, original, valores}] de toda la oferta (para hojas repetidas). */
  function revisarOferta(hojas) {
    var lista = [], vistas = {};
    hojas.forEach(function (h) {
      var o = leerOferta(h.valores, h.original);
      if (!o.cab) {
        if (!h.valores.every(filaVacia)) adv(lista, h.nombre, 1, 1, "error", "SIN_CABECERA", "No se reconoce la fila de cabeceras: la app deduce las columnas por su contenido.");
        return;
      }
      var colDe = function (k) { return o.cab.mapa[k] !== undefined ? o.cab.mapa[k] + 1 : 1; };
      var filaCab = o.cab.fila + 1;
      if (!o.sigla) {
        adv(lista, h.nombre, filaCab, 1, "error", "HOJA_DESCONOCIDA", "La hoja «" + h.original + "» no corresponde a ninguna carrera conocida: la app no la lee.");
        return;
      }
      if (vistas[o.sigla]) {
        adv(lista, h.nombre, filaCab, 1, "error", "HOJA_REPETIDA", "Repite la carrera " + o.sigla + " de la hoja «" + vistas[o.sigla] + "»: la app solo lee la primera.");
        return;
      }
      vistas[o.sigla] = h.original;
      var claves = {};
      o.filas.forEach(function (x) {
        var fila = x.r + 1;
        if (!x.codigo && !x.nombre) {
          adv(lista, h.nombre, fila, colDe("CODIGO"), "observacion", "SIN_CURSO", "Fila sin código ni asignatura: la app la toma como una asignatura aparte.");
        } else if (!x.codigo) {
          adv(lista, h.nombre, fila, colDe("CODIGO"), "observacion", "SIN_CODIGO", "Sin código: la app agrupa esta fila por el nombre de la asignatura.");
        }
        if (x.carrera && siglaDeCarrera(x.carrera) !== o.sigla) {
          adv(lista, h.nombre, fila, colDe("CARRERA"), "advertencia", "OTRA_CARRERA", "La fila dice «" + x.carrera + "», que no es " + o.sigla + ": la app la ignora en este plan.");
          return;
        }
        var clave = (x.codigo || x.nombre) + "|" + x.grupo;
        if (x.codigo || x.nombre) {
          if (claves[clave]) {
            adv(lista, h.nombre, fila, colDe("CODIGO"), "error", "FILA_REPETIDA", "Código " + (x.codigo || x.nombre) + " con grupo " + x.grupo + " repetido (fila " + claves[clave] + "): la app no lee esta fila.");
          } else claves[clave] = fila;
        }
        if (vacia(x.semestre)) adv(lista, h.nombre, fila, colDe("SEMESTRE"), "advertencia", "SIN_SEMESTRE", "Sin semestre: la app la pone en el bloque «Sin semestre».");
        else if (!x.sem.ok) adv(lista, h.nombre, fila, colDe("SEMESTRE"), "advertencia", "SEMESTRE_TEXTO", "Semestre «" + x.semestre + "» no reconocido: la app crea un bloque con ese texto. Usa 5 o 1-2.");
        ["HT", "HP"].forEach(function (k) {
          var v = k === "HT" ? x.ht : x.hp;
          if (!vacia(v) && !esNumero(v)) adv(lista, h.nombre, fila, colDe(k), "advertencia", k + "_TEXTO", k + " «" + v + "» no es un número: la app conserva el texto y suma " + num(v) + " h.");
        });
        if (esNumero(x.ht) && esNumero(x.hp) && esNumero(x.th) && Math.abs(num(x.th) - num(x.ht) - num(x.hp)) > 0.001)
          adv(lista, h.nombre, fila, colDe("TOTAL HORAS"), "observacion", "TOTAL_DISTINTO", "El total (" + x.th + ") no es HT + HP (" + (num(x.ht) + num(x.hp)) + "): la app usa HT + HP.");
        if (!vacia(x.dpto) && !normalizarDpto(x.dpto))
          adv(lista, h.nombre, fila, colDe("DPTO"), "advertencia", "DPTO_DESCONOCIDO", "Departamento «" + x.dpto + "» no reconocido (DIMA, DAHUC, DACJ, DACTE).");
        if (x.grupoCol !== "" && !esEntero(x.grupoCol))
          adv(lista, h.nombre, fila, colDe("GRUPO"), "advertencia", "GRUPO_TEXTO", "Grupo «" + x.grupoCol + "» no es un número entero.");
      });
    });
    return lista;
  }

  /* Índice de cursos de la oferta: carrera|código|grupo y carrera|nombre|grupo. */
  function indiceOferta(hojas) {
    var idx = {};
    hojas.forEach(function (h) {
      var o = leerOferta(h.valores, h.original);
      if (!o.sigla) return;
      o.filas.forEach(function (x) {
        if (x.codigo) idx[o.sigla + "|C|" + x.codigo + "|" + x.grupo] = x;
        if (x.nombre) idx[o.sigla + "|N|" + normalizar(x.nombre) + "|" + x.grupo] = x;
      });
    });
    return idx;
  }

  /* ============================================================
     Catálogo de docentes (libro CargaDeDocentes, hoja «General»)
     ============================================================ */
  function cabeceraDocentes(valores) {
    for (var i = 0; i < Math.min(10, valores.length); i++) {
      var f = (valores[i] || []).map(normalizar);
      if (f.some(function (c) { return c.indexOf("NOMBRE") >= 0; }) && f.some(function (c) { return c.indexOf("PAT") >= 0 || c === "DNI"; })) {
        var col = {};
        f.forEach(function (c, j) {
          var fijar = function (k, cond) { if (cond && col[k] === undefined) col[k] = j; };
          fijar("dni", c === "DNI");
          fijar("pat", c.indexOf("PATERNO") >= 0 || c.indexOf("APELLIDO PAT") >= 0);
          fijar("mat", c.indexOf("MATERNO") >= 0 || c.indexOf("APELLIDO MAT") >= 0);
          fijar("nom", c === "NOMBRES" || c === "NOMBRE");
          fijar("cond", c.indexOf("CONDICION") >= 0);
          fijar("dpto", c.indexOf("DEPARTAMENTO") >= 0 || c === "DPTO");
          fijar("dedic", c.indexOf("DEDIC") >= 0);
          fijar("tcOtra", c.indexOf("OTRA") >= 0 && (c.indexOf("UNIV") >= 0 || c.indexOf("INSTIT") >= 0));
          fijar("cargo", c.indexOf("CARGO") >= 0);
          fijar("noLect", c.indexOf("NO LECTIV") >= 0);
          fijar("lectivas", c === "LECTIVAS");
        });
        return { fila: i, col: col };
      }
    }
    return null;
  }

  function leerCatalogo(valores) {
    var cab = cabeceraDocentes(valores);
    var docentes = [];
    if (!cab) return { cab: null, docentes: docentes };
    var c = cab.col;
    var v = function (f, k) { return c[k] !== undefined && f[c[k]] != null ? String(f[c[k]]).trim() : ""; };
    for (var r = cab.fila + 1; r < valores.length; r++) {
      var f = valores[r] || [];
      if (filaVacia(f)) continue;
      var pat = v(f, "pat"), mat = v(f, "mat"), nom = v(f, "nom");
      var dedic = normalizar(v(f, "dedic"));
      var si = function (t) { var n = normalizar(t); return /^(SI|S|X|1|TRUE|VERDADERO|TC)$/.test(n) || n.indexOf("SI ") === 0; };
      docentes.push({
        r: r, dni: v(f, "dni"), pat: pat, nom: nom,
        nombreCompleto: (pat + " " + mat).trim() + (nom ? ", " + nom : ""),
        condicion: v(f, "cond"), dptoTexto: v(f, "dpto"), dedicTexto: v(f, "dedic"),
        dedicacion: dedic.indexOf("TC") >= 0 || dedic.indexOf("COMPLETO") >= 0 ? "TC" : (dedic ? "TP" : ""),
        dedicClara: !dedic || /TC|COMPLETO|TP|PARCIAL/.test(dedic),
        tcOtra: c.tcOtra !== undefined && si(v(f, "tcOtra")),
        cargo: c.cargo !== undefined ? v(f, "cargo") : "",
        noLectivas: c.noLect !== undefined ? num(v(f, "noLect")) : null,
        lectivas: v(f, "lectivas")
      });
    }
    return { cab: cab, docentes: docentes };
  }

  function revisarDocentes(hoja) {
    var lista = [];
    var cat = leerCatalogo(hoja.valores);
    if (!cat.cab) {
      if (!hoja.valores.every(filaVacia) && /GENERAL/i.test(hoja.original))
        adv(lista, hoja.nombre, 1, 1, "error", "CATALOGO_SIN_CABECERAS", "No se reconocen las cabeceras (NOMBRES con APELLIDO PATERNO o DNI): la app no tendrá catálogo de docentes.");
      return lista;
    }
    var c = cat.cab.col, dnis = {};
    var colDe = function (k) { return c[k] !== undefined ? c[k] + 1 : 1; };
    cat.docentes.forEach(function (d) {
      var fila = d.r + 1;
      if (!d.pat && !d.nom) {
        var resumen = /TOTAL/i.test([d.dni, d.dptoTexto, d.dedicTexto, d.condicion].join(" "));
        if (!resumen && (d.dni || d.dptoTexto || d.dedicTexto || d.condicion)) adv(lista, hoja.nombre, fila, colDe("pat"), "advertencia", "SIN_NOMBRE", "Fila con datos pero sin apellidos ni nombres: la app la salta.");
        return;
      }
      if (!d.dni) adv(lista, hoja.nombre, fila, colDe("dni"), "advertencia", "SIN_DNI", "Docente sin DNI: la app lo reconoce solo por su nombre.");
      else if (dnis[d.dni]) adv(lista, hoja.nombre, fila, colDe("dni"), "error", "DNI_REPETIDO", "DNI " + d.dni + " repetido (fila " + dnis[d.dni] + ").");
      else dnis[d.dni] = fila;
      if (c.dpto !== undefined && (!d.dptoTexto || !normalizarDpto(d.dptoTexto)))
        adv(lista, hoja.nombre, fila, colDe("dpto"), "advertencia", "DPTO_DESCONOCIDO", d.dptoTexto ? "Departamento «" + d.dptoTexto + "» no reconocido." : "Sin departamento.");
      if (c.dedic !== undefined && !d.dedicacion)
        adv(lista, hoja.nombre, fila, colDe("dedic"), "advertencia", "DEDICACION", "Sin dedicación (TC o TP): la app no revisa sus mínimos de horas.");
      else if (c.dedic !== undefined && !d.dedicClara)
        adv(lista, hoja.nombre, fila, colDe("dedic"), "advertencia", "DEDICACION", "Dedicación «" + d.dedicTexto + "» no reconocida: la app la toma como tiempo parcial (TP).");
      if (c.lectivas !== undefined && esNumero(d.lectivas)) {
        var h = num(d.lectivas), ord = /ORDINARIO/.test(normalizar(d.condicion));
        if (h > LIMITES.MAXIMO) adv(lista, hoja.nombre, fila, colDe("lectivas"), "error", "A07", "A07 · " + h + " h lectivas: supera el máximo de " + LIMITES.MAXIMO + " h.");
        else if (ord && h > LIMITES.ORDINARIO) adv(lista, hoja.nombre, fila, colDe("lectivas"), "advertencia", "A09", "A09 · Ordinario con " + h + " h: supera " + LIMITES.ORDINARIO + " h.");
        else if (d.dedicacion === "TP" && h > 0 && h < LIMITES.MINIMO_TP) adv(lista, hoja.nombre, fila, colDe("lectivas"), "advertencia", "A10", "A10 · Tiempo parcial con " + h + " h: menos de " + LIMITES.MINIMO_TP + " h.");
      }
    });
    return lista;
  }

  /* ============================================================
     Carga por departamento (libro CargaXDepartamento: una hoja por departamento,
     el docente una vez y sus cursos debajo, con filas de TOTAL)
     ============================================================ */
  function cabeceraCarga(valores) {
    for (var i = 0; i < Math.min(15, valores.length); i++) {
      var pos = {};
      (valores[i] || []).map(normalizar).forEach(function (c, j) {
        var fijar = function (k, cond) { if (cond && pos[k] === undefined) pos[k] = j; };
        fijar("DOCENTE", c.indexOf("DOCENTE") >= 0 || c.indexOf("PROFESOR") >= 0);
        fijar("CARRERA", c === "CARRERA" || c === "CARR");
        fijar("SEMESTRE", c.indexOf("SEMESTRE") >= 0 || c === "SEM");
        fijar("CODIGO", c.indexOf("CODIGO") >= 0);
        fijar("ASIGNATURA", c.indexOf("ASIGNATURA") >= 0 || c === "CURSO");
        fijar("HT", c === "HT" || c.indexOf("HORAS TEORICAS") >= 0);
        fijar("HP", c === "HP" || c.indexOf("HORAS PRACTICAS") >= 0);
        fijar("TOTAL", c.indexOf("TOTAL") >= 0);
        fijar("CONDICION", c.indexOf("CONDICION") >= 0);
        fijar("GRUPO", c === "GRUPO" || c === "GRP");
      });
      if (pos.DOCENTE !== undefined && (pos.CODIGO !== undefined || pos.ASIGNATURA !== undefined)) return { fila: i, col: pos };
    }
    return null;
  }

  function leerCarga(valores) {
    var cab = cabeceraCarga(valores);
    var cursos = [], totales = [];
    if (!cab) return { cab: null, cursos: cursos, totales: totales };
    var col = cab.col;
    var val = function (f, k) { return col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : ""; };
    var docente = "", filaDocente = 0, bloque = null;
    for (var r = cab.fila + 1; r < valores.length; r++) {
      var f = valores[r] || [];
      if (filaVacia(f)) continue;
      /* Como la app: una fila con «TOTAL…» no es curso ni cambia el docente. El subtotal de
         cada docente es la fila que sigue a sus cursos con solo un número (o «TOTAL» y un
         número); las de «TOTAL HORAS … POR SEMANA» y similares resumen el departamento. */
      var textos = f.filter(function (c) { return !vacia(c) && !esNumero(c); }).map(function (c) { return normalizar(c); });
      var esTotal = textos.some(function (t) { return t.indexOf("TOTAL") === 0; });
      var codigo0 = val(f, "CODIGO"), nombre0 = val(f, "ASIGNATURA");
      var subtotal = !codigo0 && !nombre0 && !val(f, "DOCENTE") && (textos.length === 0 || (textos.length === 1 && textos[0] === "TOTAL"));
      if (esTotal || subtotal) {
        if (subtotal && bloque && bloque.n) {
          var jNum = col.TOTAL !== undefined && esNumero(val(f, "TOTAL")) ? col.TOTAL : -1;
          for (var j = f.length - 1; jNum < 0 && j >= 0; j--) if (esNumero(f[j])) jNum = j;
          if (jNum >= 0) totales.push({ r: r, docente: bloque.docente, suma: Math.round(bloque.suma * 100) / 100, total: num(f[jNum]), col: jNum });
        }
        bloque = null;
        continue;
      }
      if (val(f, "DOCENTE")) { docente = val(f, "DOCENTE"); filaDocente = r; bloque = { docente: docente, suma: 0, n: 0 }; }
      var codigo = val(f, "CODIGO"), nombre = val(f, "ASIGNATURA");
      if (!docente || (!codigo && !nombre)) continue;
      var sem = semestre(val(f, "SEMESTRE"));
      var grupoCol = val(f, "GRUPO");
      var ht = num(val(f, "HT")), hp = num(val(f, "HP"));
      /* El subtotal suma la columna TOTAL de cada curso (una fusión deja vacía la fila repetida); sin ella, HT + HP. */
      if (bloque) { bloque.suma += col.TOTAL !== undefined ? num(val(f, "TOTAL")) : ht + hp; bloque.n++; }
      cursos.push({
        r: r, docente: docente, filaDocente: filaDocente, carreraTexto: val(f, "CARRERA"), carrera: siglaDeCarrera(val(f, "CARRERA")),
        codigo: codigo, nombre: nombre, semestre: val(f, "SEMESTRE"), sem: sem,
        grupo: grupoCol !== "" ? String(num(grupoCol) || grupoCol) : String(sem.grupo || 1),
        ht: ht, hp: hp, condicion: val(f, "CONDICION")
      });
    }
    return { cab: cab, cursos: cursos, totales: totales };
  }

  /* Horas que la app le cuenta a una fila: las de su sección en la oferta (teoría si la fila
     trae HT, práctica si trae HP; sin horas, toda la sección). Sin oferta, las de la fila. */
  function horasDeFila(x, enOferta) {
    if (!enOferta) return x.ht + x.hp;
    var t = num(enOferta.ht), p = num(enOferta.hp);
    if (!x.ht && !x.hp) return t + p;
    return (x.ht > 0 ? t : 0) + (x.hp > 0 ? p : 0);
  }

  /* hojasCarga: [{nombre, original, valores}]; ctx: {oferta: índiceOferta, catalogo: [docente]}. */
  function revisarCarga(hojasCarga, ctx) {
    var lista = [];
    var porClave = {};
    var catalogo = {};
    (ctx.catalogo || []).forEach(function (d) { catalogo[claveDocente(d.nombreCompleto)] = d; });
    var hayCatalogo = (ctx.catalogo || []).length > 0;
    var hayOferta = Object.keys(ctx.oferta || {}).length > 0;

    hojasCarga.forEach(function (h) {
      var c = leerCarga(h.valores);
      if (!c.cab) {
        if (!h.valores.every(filaVacia)) adv(lista, h.nombre, 1, 1, "advertencia", "SIN_CABECERA", "No se reconoce la cabecera (DOCENTE con CÓDIGO o ASIGNATURA): la app usa las columnas habituales.");
        return;
      }
      var col = c.cab.col;
      var colDe = function (k) { return col[k] !== undefined ? col[k] + 1 : 1; };
      var avisadoCatalogo = {};
      c.cursos.forEach(function (x) {
        var fila = x.r + 1;
        var clave = claveDocente(x.docente);
        if (!x.carreraTexto && !x.codigo) {
          adv(lista, h.nombre, fila, colDe("ASIGNATURA"), "observacion", "FILA_SUELTA", "«" + x.nombre + "» no tiene carrera ni código: la app la lee como un curso de " + x.docente + " y no la aplica.");
          return;
        }
        if (hayCatalogo && !catalogo[clave] && !avisadoCatalogo[x.filaDocente]) {
          avisadoCatalogo[x.filaDocente] = true;
          adv(lista, h.nombre, x.filaDocente + 1, colDe("DOCENTE"), "advertencia", "FUERA_CATALOGO", "«" + x.docente + "» no está en el catálogo de docentes: al aplicar la carga habrá que elegirlo a mano.");
        }
        if (!x.carrera) {
          adv(lista, h.nombre, fila, colDe("CARRERA"), "advertencia", "CARRERA_DESCONOCIDA", (x.carreraTexto ? "Carrera «" + x.carreraTexto + "» desconocida" : "Sin carrera") + ": la app no la asocia a ninguna sección.");
          return;
        }
        var enOferta = (x.codigo && ctx.oferta[x.carrera + "|C|" + x.codigo + "|" + x.grupo]) || (x.nombre && ctx.oferta[x.carrera + "|N|" + normalizar(x.nombre) + "|" + x.grupo]) || null;
        if (hayOferta && !enOferta) {
          adv(lista, h.nombre, fila, colDe("CODIGO"), "advertencia", "FUERA_OFERTA", x.carrera + " " + (x.codigo || x.nombre) + " (grupo " + x.grupo + ") no está en la oferta: la app no encuentra su sección.");
          return;
        }
        var p = porClave[clave] || (porClave[clave] = { docente: x.docente, horas: 0, celdas: [], cursos: [], internacional: true, fusiones: {} });
        /* Una fusión es una sola sección: la app no cuenta dos veces sus horas. */
        var fusion = enOferta && /FUSI/i.test(enOferta.obs) ? normalizar(x.nombre) : "";
        if (!fusion || !p.fusiones[fusion]) p.horas += horasDeFila(x, enOferta);
        if (fusion) p.fusiones[fusion] = true;
        if (!p.celdas.some(function (z) { return z.hoja === h.nombre && z.fila === x.filaDocente + 1; }))
          p.celdas.push({ hoja: h.nombre, fila: x.filaDocente + 1, col: colDe("DOCENTE") });
        p.cursos.push({ hoja: h.nombre, fila: fila, col: colDe("CODIGO"), carrera: x.carrera, sem: x.sem.sem, codigo: x.codigo });
        if (!/INTERNACIONAL|VIRTUAL/i.test(enOferta ? enOferta.obs : x.condicion)) p.internacional = false;
      });
      c.totales.forEach(function (t) {
        if (Math.abs(t.suma - t.total) > 0.001)
          adv(lista, h.nombre, t.r + 1, t.col + 1, "observacion", "TOTAL_DISTINTO", "El TOTAL (" + t.total + ") no es la suma de los cursos de " + t.docente + " (" + t.suma + " h).");
      });
    });

    Object.keys(porClave).forEach(function (k) {
      var p = porClave[k], d = catalogo[k] || null, h = Math.round(p.horas * 100) / 100;
      var marcar = function (nivel, codigo, mensaje) { p.celdas.forEach(function (z) { adv(lista, z.hoja, z.fila, z.col, nivel, codigo, mensaje); }); };
      if (h > LIMITES.MAXIMO) marcar("error", "A07", "A07 · " + p.docente + " suma " + h + " h lectivas: supera las " + LIMITES.MAXIMO + " h y la app no guardará su carga.");
      if (d && d.tcOtra && h > LIMITES.TC_OTRA) marcar("advertencia", "A08", "A08 · Tiempo completo en otra universidad con " + h + " h: supera " + LIMITES.TC_OTRA + " h.");
      if (d && /ORDINARIO/.test(normalizar(d.condicion)) && h > LIMITES.ORDINARIO) marcar("advertencia", "A09", "A09 · Ordinario con " + h + " h: supera " + LIMITES.ORDINARIO + " h.");
      if (d && d.dedicacion === "TP" && h > 0 && h < LIMITES.MINIMO_TP && !p.internacional) marcar("advertencia", "A10", "A10 · Tiempo parcial con " + h + " h: menos de " + LIMITES.MINIMO_TP + " h.");
      if (d && d.cargo && h > LIMITES.CARGO_SEVERO) marcar("error", "A12", "A12 · Con cargo (" + d.cargo + ") y " + h + " h: pasa de " + LIMITES.CARGO_SEVERO + " h; la app pedirá un motivo.");
      else if (d && d.cargo && h > LIMITES.CARGO) marcar("advertencia", "A12", "A12 · Con cargo (" + d.cargo + ") y " + h + " h: pasa de las " + LIMITES.CARGO + " h recomendadas.");
      if (d && d.dedicacion === "TC" && d.noLectivas !== null && h + d.noLectivas < LIMITES.JORNADA_TC) marcar("advertencia", "A15", "A15 · Tiempo completo: " + h + " h lectivas + " + d.noLectivas + " h no lectivas no cubren sus " + LIMITES.JORNADA_TC + " h.");
      /* A11: dos cursos distintos en el mismo semestre de una carrera. */
      var porSem = {};
      p.cursos.forEach(function (cu) {
        if (!cu.carrera || cu.sem == null || !cu.codigo) return;
        var s = cu.carrera + "|" + cu.sem;
        (porSem[s] = porSem[s] || []).push(cu);
      });
      Object.keys(porSem).forEach(function (s) {
        var l = porSem[s], codigos = [];
        l.forEach(function (cu) { if (codigos.indexOf(cu.codigo) < 0) codigos.push(cu.codigo); });
        if (codigos.length > 1) {
          var partes = s.split("|");
          l.forEach(function (cu) { adv(lista, cu.hoja, cu.fila, cu.col, "advertencia", "A11", "A11 · " + p.docente + " dicta " + codigos.length + " cursos distintos en " + partes[0] + ", semestre " + partes[1] + " (" + codigos.join(", ") + ")."); });
        }
      });
    });
    return lista;
  }

  /* ============================================================
     Usuarios (pestaña Usuarios de SISCargaLectiva-BD)
     ============================================================ */
  function revisarUsuarios(hoja, dominio) {
    var lista = [], vistos = {};
    var dom = String(dominio || "ulasalle.edu.pe").toLowerCase();
    var v = hoja.valores;
    for (var r = 1; r < v.length; r++) {
      var f = v[r] || [];
      if (filaVacia(f.slice(0, 4))) continue;
      var fila = r + 1;
      var correo = String(f[0] || "").trim().toLowerCase(), rol = normalizar(f[1]), carreras = String(f[2] || "").trim(), dpto = String(f[3] || "").trim();
      if (!correo) { adv(lista, hoja.nombre, fila, 1, "error", "SIN_CORREO", "Fila sin correo: la app no la usa."); continue; }
      if (!/^[^@\s]+@[^@\s]+$/.test(correo) || correo.split("@")[1] !== dom)
        adv(lista, hoja.nombre, fila, 1, "error", "FUERA_DOMINIO", "«" + correo + "» no es una cuenta @" + dom + ": la app le niega el acceso.");
      if (vistos[correo]) adv(lista, hoja.nombre, fila, 1, "error", "CORREO_REPETIDO", "Correo repetido (fila " + vistos[correo] + "): la app usa la primera fila.");
      else vistos[correo] = fila;
      var esDirector = rol.indexOf("DIRECTOR") >= 0, esCoord = !esDirector && rol.indexOf("COORDINADOR") >= 0;
      if (!esDirector && !esCoord) { adv(lista, hoja.nombre, fila, 2, "error", "ROL", (rol ? "Rol «" + f[1] + "» no válido" : "Sin rol") + " (director o coordinador): la app le niega el acceso."); continue; }
      var tokens = function (t) { return t.split(/[,;\/\n]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
      if (esDirector) {
        var validos = [];
        tokens(dpto).forEach(function (t) {
          var sd = normalizarDpto(t);
          if (!sd) adv(lista, hoja.nombre, fila, 4, "advertencia", "DPTO_DESCONOCIDO", "Departamento «" + t + "» no reconocido (DIMA, DAHUC, DACJ, DACTE): la app lo ignora.");
          else if (validos.indexOf(sd) < 0) validos.push(sd);
        });
        if (!validos.length) adv(lista, hoja.nombre, fila, 4, "advertencia", "SIN_DEPARTAMENTO", "Director sin departamento válido: entra a la app, pero no puede asignar docentes.");
        else if (validos.length > 1) adv(lista, hoja.nombre, fila, 4, "observacion", "VARIOS_DPTOS", "Varios departamentos: la app solo usa el primero (" + validos[0] + ").");
        if (carreras) adv(lista, hoja.nombre, fila, 3, "observacion", "CARRERAS_DIRECTOR", "Un director no coordina carreras: la app ignora esta columna.");
      } else {
        var cs = tokens(carreras), siglas = [];
        cs.forEach(function (t) {
          var sc = siglaDeCarrera(t);
          if (!sc) adv(lista, hoja.nombre, fila, 3, "advertencia", "CARRERA_DESCONOCIDA", "Carrera «" + t + "» desconocida (ING, IND, ADM, DER, ARQ, PSI, COM, ICO): la app la ignora.");
          else if (siglas.indexOf(sc) < 0) siglas.push(sc);
        });
        if (!siglas.length) adv(lista, hoja.nombre, fila, 3, "advertencia", "SIN_CARRERAS", "Coordinador sin carreras válidas: solo podrá consultar.");
        if (dpto) adv(lista, hoja.nombre, fila, 4, "observacion", "DPTO_COORDINADOR", "Un coordinador no tiene departamento: la app ignora esta columna.");
      }
    }
    return lista;
  }

  /* Bloqueos de la BD: los vencidos (la app los ignora). ahora: milisegundos. */
  function revisarBloqueos(hoja, ahora) {
    var lista = [];
    for (var r = 1; r < hoja.valores.length; r++) {
      var f = hoja.valores[r] || [];
      if (filaVacia(f)) continue;
      var t = Date.parse(String(f[4] || ""));
      if (isFinite(t) && t < ahora) adv(lista, hoja.nombre, r + 1, 5, "observacion", "BLOQUEO_VENCIDO", "Bloqueo de " + f[2] + " sobre " + f[1] + " vencido: la app ya no lo respeta.");
    }
    return lista;
  }

  /* Fuentes de la BD: avisos que dejó la última lectura de los Excel. */
  function revisarFuentes(hoja) {
    var lista = [];
    for (var r = 1; r < hoja.valores.length; r++) {
      var f = hoja.valores[r] || [];
      var texto = String(f[5] || "").trim();
      if (!texto || texto === "[]") continue;
      var avisos = [];
      try { avisos = JSON.parse(texto); } catch (e) { avisos = [{ texto: texto }]; }
      avisos.forEach(function (a) {
        adv(lista, hoja.nombre, r + 1, 6, "advertencia", (a && a.tipo) || "AVISO_XLSX", (a && a.texto) || String(a));
      });
    }
    return lista;
  }

  var ORDEN = { error: 0, advertencia: 1, observacion: 2 };
  function ordenar(lista) {
    return lista.sort(function (a, b) { return ORDEN[a.nivel] - ORDEN[b.nivel] || (a.hoja < b.hoja ? -1 : a.hoja > b.hoja ? 1 : 0) || a.fila - b.fila || a.col - b.col; });
  }

  return {
    normalizar: normalizar, siglaDeCarrera: siglaDeCarrera, normalizarDpto: normalizarDpto, semestre: semestre,
    leerOferta: leerOferta, indiceOferta: indiceOferta, leerCatalogo: leerCatalogo, leerCarga: leerCarga,
    revisarOferta: revisarOferta, revisarDocentes: revisarDocentes, revisarCarga: revisarCarga,
    revisarUsuarios: revisarUsuarios, revisarBloqueos: revisarBloqueos, revisarFuentes: revisarFuentes,
    ordenar: ordenar, LIMITES: LIMITES, CARRERAS: CARRERAS
  };
})();

if (typeof module !== "undefined") module.exports = Reglas;
