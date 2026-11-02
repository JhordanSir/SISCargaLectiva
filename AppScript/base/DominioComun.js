// @ts-check
/* Dominio común a CU-001 y CU-002: datos maestros, normalización, números, saneadores y
   firma del contenido. Es una de las tres fábricas que combina Dominio.js; se usa en
   el servidor y, como texto, en el navegador (fuenteDominio_), así que no puede usar nada
   definido fuera de ella. */

/**
 * Lo común: datos maestros, normalización, números, saneadores y firma del contenido.
 * @returns Todas sus declaraciones (tsc deduce el tipo); crearDominio_() elige las públicas.
 */
function crearDominioComun_() {
  "use strict";

  /* ============================================================
     Datos maestros
     ============================================================ */
  const DPTOS = ["DIMA", "DAHUC", "DACJ", "DACTE"];

  /* «alias» recoge las formas con que cada carrera aparece en las hojas reales (las siglas
     de la columna CARRERA y los nombres de las pestañas). */
  /* dpto: el departamento al que pertenece la carrera. Su director asigna los docentes de
     todos los cursos del plan de la carrera, diga lo que diga la columna DPTO de la oferta,
     salvo los cursos que se deriven a otro departamento (asignatura.derivado). */
  const CARRERAS = [
    { sig: "ING", nombre: "Ingeniería de Software", dpto: "DIMA", alias: ["Ing. Software"] },
    { sig: "IND", nombre: "Ingeniería Industrial", dpto: "DIMA", alias: ["Ing. Industrial"] },
    { sig: "ADM", nombre: "Administración de Empresas", dpto: "DACTE",
      alias: ["Adm. Neg. Int.", "Administración de Negocios Internacionales"] },
    { sig: "DER", nombre: "Derecho", dpto: "DACJ", alias: [] },
    { sig: "ARQ", nombre: "Arquitectura", dpto: "DIMA", alias: [] },
    { sig: "PSI", nombre: "Psicología", dpto: "DAHUC", alias: [] },
    { sig: "COM", nombre: "Comunicación", dpto: "DAHUC",
      alias: ["Cs. de la Comunicación", "Ciencias de la Comunicación"] },
    { sig: "ICO", nombre: "Ingeniería Comercial", dpto: "DIMA", alias: ["Ing. Comercial"] }
  ];

  const COLUMNAS = ["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "GRUPO",
                    "HT", "HP", "TOTAL HORAS", "DPTO", "OBSERVACIONES"];
  const SINONIMOS = { "OBSERVACION": "OBSERVACIONES", "TH": "TOTAL HORAS", "TOTAL DE HORAS": "TOTAL HORAS" };

  const ESTADOS = { SIN: "Sin Iniciar", BORRADOR: "Borrador", REGISTRADO: "Registrado" };

  /* Tipo de cada guardado, tal como queda escrito en el historial de versiones. */
  const TIPO_VERSION = {
    BORRADOR: "guardar borrador", REGISTRAR: "registrar", CAMBIOS: "guardar cambios", AUTOGUARDADO: "autoguardado",
    FUSION: "fusión", CAMBIO_DPTO: "cambio de departamento",
    IMPORTACION_HOJA: "importación desde la hoja", ACTUALIZACION_HOJA: "actualización desde la hoja",
    GUARDAR_CARGA: "guardar", MIGRACION_CARGA: "migración a carga por carrera",
    restauracion: n => "restauración de v" + n,
    esRestauracion: t => /^restauración de v\d+$/.test(String(t))
  };

  /* Documento que se bloquea o se recupera: el plan de una carrera («plan:ADM») o su carga
     docente («carga:ADM»). */
  const REF = { plan: sig => "plan:" + sig, carga: sig => "carga:" + sig };

  /* Avisos que el servidor manda al navegador: {tipo, nivel, texto, datos}. El navegador
     decide por el tipo, nunca por el texto. Cada tipo trae su nivel: "info", "aviso" o
     "error". TEXTO es un aviso guardado antes de que los avisos tuvieran tipo. */
  const TIPOS_AVISO = {
    FALTA_OFERTA: "aviso", LECTURA_FALLIDA: "error",
    HOJA_DESCONOCIDA: "aviso", HOJA_REPETIDA: "aviso", FILA_REPETIDA: "aviso",
    PLAN_CAMBIADO: "aviso", SIN_SECCION: "aviso",
    CATALOGO_FALTA: "aviso", CATALOGO_SIN_CABECERAS: "aviso", CATALOGO_ILEGIBLE: "aviso",
    TEXTO: "aviso"
  };
  const aviso = (tipo, texto, datos, nivel) =>
    ({ tipo: tipo, nivel: nivel || TIPOS_AVISO[tipo] || "aviso", texto: String(texto), datos: datos || null });
  const comoAviso = a => a && typeof a === "object" && typeof a.texto === "string" ? a : aviso("TEXTO", a == null ? "" : a);

  const nombreCarrera = sig => (CARRERAS.find(c => c.sig === sig) || {}).nombre || sig;

  /** @type {function(string): string} Departamento al que pertenece una carrera ("" si no se conoce). */
  const dptoDeCarrera = sig => (CARRERAS.find(c => c.sig === sig) || {}).dpto || "";
  /** @type {function(string): string[]} Siglas de las carreras de un departamento. */
  const carrerasDeDpto = dpto => CARRERAS.filter(c => c.dpto === dpto).map(c => c.sig);

  /* Hora de Perú (America/Lima: UTC−5 todo el año, sin horario de verano). Las fechas se
     guardan en ISO 8601 con su desfase, «2026-10-15T11:01:11-05:00»: en la hoja se leen
     como hora de Perú y Date.parse las entiende igual que las antiguas en UTC («…Z»). */
  const DESFASE_PERU_MIN = -300;
  /**
   * Fecha en ISO 8601 con la hora de Perú, al segundo. Sin argumento, la hora actual.
   * @param {Date|number|string=} fecha
   * @returns {string}
   */
  const isoPeru = fecha => {
    const t = fecha == null ? Date.now()
      : typeof fecha === "number" ? fecha
      : typeof fecha === "string" ? Date.parse(fecha)
      : fecha && typeof fecha.getTime === "function" ? fecha.getTime() : NaN;
    if (isNaN(t)) return String(fecha == null ? "" : fecha);
    return new Date(t + DESFASE_PERU_MIN * 60000).toISOString().slice(0, 19) + "-05:00";
  };

  /**
   * Ícono del sprite (Iconos.html). Lo usan el navegador (icono) y las plantillas del
   * servidor (icono_), así que el marcado es el mismo en los dos lados.
   * @param {string} nombre Nombre en estilos/iconos.mjs, sin «i-».
   * @param {string=} clase Clases que se añaden a «ico».
   * @returns {string}
   */
  const htmlIcono = (nombre, clase) =>
    '<svg class="ico' + (clase ? " " + clase : "") + '" aria-hidden="true" focusable="false"><use href="#i-' + nombre + '"></use></svg>';

  /**
   * ============================================================
   * Normalización
   * ============================================================
   * @param {*} s
   * @returns {string}
   */
  function normalizar(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase().trim().replace(/\s+/g, " ");
  }
  const canonica = s => { const n = normalizar(s); return SINONIMOS[n] || n; };

  /**
   * Divide un texto pegado (tabulaciones) o un CSV (comas o punto y coma, con comillas).
   * @param {string} txt
   * @returns {string[][]}
   */
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

  /**
   * Localiza la fila de cabeceras. Devuelve la primera fila completa y sin repeticiones;
   * si no existe, devuelve la mejor candidata.
   * @param {Array<Array<*>>} matriz
   * @returns {{fila: number, mapa: Object<string, number>, repetidas: string[], extras: string[], faltan: string[], encontradas: number}|null}
   */
  function ubicarCabeceras(matriz) {
    let mejor = null;
    for (let i = 0; i < matriz.length; i++) {
      const celdas = matriz[i].map(canonica);
      /** @type {Object<string, number>} */
      const mapa = {};
      const repetidas = [];
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

  /**
   * Sigla, nombre y alias de una carrera.
   * @param {Sigla} sigla
   * @returns {string[]}
   */
  function formasCarrera(sigla) {
    const c = CARRERAS.find(x => x.sig === sigla);
    return c ? [c.sig, c.nombre].concat(c.alias || []) : [];
  }

  /**
   * La columna CARRERA puede traer la sigla («ING»), el nombre o cualquier alias.
   * @param {*} valor
   * @param {Sigla} sigla
   * @returns {boolean}
   */
  function coincideCarrera(valor, sigla) {
    const v = claveCarrera(valor);
    return formasCarrera(sigla).some(f => claveCarrera(f) === v);
  }

  /**
   * Sigla de la carrera que corresponde a un valor (sigla, nombre o alias); null si ninguna.
   * @param {*} valor
   * @returns {Sigla|null}
   */
  function siglaDeCarrera(valor) {
    if (!claveCarrera(valor)) return null;
    const c = CARRERAS.find(x => coincideCarrera(valor, x.sig));
    return c ? c.sig : null;
  }

  /**
   * SEMESTRE admite «5» (semestre 5, grupo 1) y «1-2» (semestre 1, grupo 2), con «/»
   * como separador alternativo. Devuelve sem = NaN si no encaja; entonces se conserva
   * el texto original.
   * @param {*} bruto
   * @returns {{sem: number, grupo: number, compuesto: boolean}}
   */
  function descomponerSemestre(bruto) {
    const t = String(bruto == null ? "" : bruto).trim();
    if (entero(t)) return { sem: parseInt(t, 10), grupo: 1, compuesto: false };
    const m = t.match(/^(\d+)\s*[-\/]\s*(\d+)$/);
    if (m) return { sem: parseInt(m[1], 10), grupo: parseInt(m[2], 10), compuesto: true };
    return { sem: NaN, grupo: NaN, compuesto: false };
  }

  /**
   * ============================================================
   * Números, identificadores y asignaturas internacionales: los usan el
   * plan, la carga y los saneadores
   * ============================================================
   * @param {*} v
   * @returns {number}
   */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const m = String(v == null ? "" : v).replace(",", ".").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }
  const th = g => num(g.ht) + num(g.hp);

  const idGrupo = () => "g" + Math.random().toString(36).slice(2);
  const esInternacional = a => /INTERNACIONAL|VIRTUAL/i.test(a.obs || "");

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

  /**
   * Falla con DATO_INVALIDO si no es una lista o pasa del máximo.
   * @param {*} v
   * @param {number} max
   * @param {string} que Qué es, para el mensaje.
   * @returns {void}
   */
  function exigirLista(v, max, que) {
    if (!Array.isArray(v)) throw errorDato(que + ": se esperaba una lista.");
    if (v.length > max) throw errorDato(que + ": tiene " + v.length + " elementos y el máximo es " + max + ".");
  }

  /**
   * Falla con DATO_INVALIDO si el JSON pasa de LIMITES_DATOS.CARACTERES.
   * @param {*} v
   * @param {string} que
   * @returns {void}
   */
  function exigirTamano(v, que) {
    const n = JSON.stringify(v).length;
    if (n > LIMITES_DATOS.CARACTERES)
      throw errorDato(que + " es demasiado grande (" + Math.round(n / 1024) + " KB; el máximo es " + Math.round(LIMITES_DATOS.CARACTERES / 1024) + " KB).");
  }

  /**
   * Un grupo con solo los campos del modelo, recortados.
   * @param {*} g
   * @returns {Grupo}
   */
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

  /**
   * Contenido de un plan. Una asignatura sin grupos no es válida y se descarta.
   * @param {*} lista
   * @returns {Asignatura[]}
   */
  function sanearAsignaturas(lista) {
    exigirLista(lista, LIMITES_DATOS.ASIGNATURAS, "El plan");
    exigirTamano(lista, "El plan");
    return lista.map(objeto).map(a => {
      const grupos = Array.isArray(a.grupos) ? a.grupos : [];
      exigirLista(grupos, LIMITES_DATOS.GRUPOS, "Los grupos de «" + recortar(a.nombre || a.codigo, 60) + "»");
      const r = { sem: textoONumero(a.sem, 40), malla: textoONumero(a.malla, 20), codigo: recortar(a.codigo, 40), nombre: recortar(a.nombre, 250),
                  dpto: recortar(a.dpto, 60), obs: recortar(a.obs, 500), grupos: grupos.map(sanearGrupo) };
      if (DPTOS.includes(a.derivado)) r.derivado = a.derivado;
      return r;
    }).filter(a => a.grupos.length);
  }

  /**
   * Marcas de fusión válidas de una lista (las fusiones que el usuario deshizo).
   * @param {*} lista
   * @returns {string[]}
   */
  function sanearMarcas(lista) {
    if (lista == null) return [];
    exigirLista(lista, LIMITES_DATOS.MARCAS, "Las fusiones deshechas");
    return lista.map(marcaSegura).filter(Boolean);
  }

  /**
   * Horas de una asignación: null es «las del componente»; si no, un número entre 0 y 60.
   * @param {*} v
   * @returns {number|null}
   */
  function horasSeguras(v) {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    return Math.round(Math.min(60, Math.max(0, num(v))) * 100) / 100;
  }

  /**
   * Historial de reemplazos de una asignación, con sus campos recortados; null si no hay.
   * @param {*} lista
   * @returns {Array<Object>|null}
   */
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

  /**
   * Asignaciones de una carga docente. Descarta los campos que solo usa la pantalla
   * (heredada, dptoCarga) y cualquier otro que no sea del modelo.
   * @param {*} lista
   * @returns {Asignacion[]}
   */
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

  /**
   * ============================================================
   * Firma del contenido, para saber si un plan cambió entre dos lecturas
   * ============================================================
   * @param {Asignatura[]} asignaturas
   * @returns {string}
   */
  function contenidoCanonico(asignaturas) {
    return JSON.stringify((asignaturas || []).map(a => [
      a.sem, a.malla, a.codigo, a.nombre, a.dpto, a.obs,
      a.grupos.map(g => [g.n, g.ht, g.hp, g.desdoble || null, g.fusion || null])
    ]));
  }

  /**
   * cyrb53: hash de 53 bits, suficiente para detectar cambios.
   * @param {string} texto
   * @returns {string} En hexadecimal.
   */
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
    DPTOS, CARRERAS, COLUMNAS, SINONIMOS, ESTADOS, TIPO_VERSION, REF, TIPOS_AVISO, aviso, comoAviso,
    nombreCarrera, htmlIcono, dptoDeCarrera, carrerasDeDpto, isoPeru, normalizar, canonica, matrizDesdeTexto, ubicarCabeceras, entero, claveCarrera,
    formasCarrera, coincideCarrera, siglaDeCarrera, descomponerSemestre, num, th, idGrupo, esInternacional,
    LIMITES_DATOS, MARCA_FUSION, DESDOBLE, COMPONENTE, FECHA_ISO, objeto, recortar, textoONumero, idSeguro,
    marcaSegura, esSigla, errorDato, exigirLista, exigirTamano, sanearGrupo, sanearAsignaturas, sanearMarcas,
    horasSeguras, sanearHistorial, sanearAsignaciones, contenidoCanonico, hash
  };
}
