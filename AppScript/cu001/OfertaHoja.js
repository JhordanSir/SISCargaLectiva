// @ts-check
/* CU-001 FA-009 a FA-012: las pestañas «Oferta - …» de la hoja del sistema son la fuente
   de la oferta de SIS_CICLO_HOJA; las de «Carga - …» aportan la CONDICIÓN de cada código.
   La app nunca las modifica. Cuando cambia su contenido, cada plan cuyo contenido cambió
   recibe una versión nueva: «importación desde la hoja» si no tenía ninguna, «actualización
   desde la hoja» si ya tenía. Qué pestañas son de cada fuente lo dice comun/FuenteHoja.js;
   cómo se lee la oferta, OfertaPestanas.js. */

/**
 * Leer las pestañas cuesta unos segundos, así que se hace como mucho una vez cada
 * SIS_MINUTOS_REVISION_HOJA minutos; mientras tanto se repiten los avisos de la última
 * revisión. forzar (el botón «Releer la hoja») las lee en el momento.
 * @param {boolean} forzar
 * @returns {Aviso[]}
 */
function sincronizarFuentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("fuentes", cfg.bdId);
  if (!forzar && cfg.minutosRevisionHoja > 0) {
    const ultima = leerDeCache_(clave);
    if (ultima) return ultima.avisos.map(Dominio.comoAviso);
  }
  const avisos = revisarFuentes_();
  if (cfg.minutosRevisionHoja > 0) guardarEnCache_(clave, { avisos: avisos }, cfg.minutosRevisionHoja * 60);
  calentarCatalogo_(forzar);
  return avisos;
}

/**
 * Resultado de la última revisión de las pestañas si fue hace menos de
 * SIS_MINUTOS_REVISION_HOJA minutos, o null.
 * @returns {{avisos: Array<Aviso|string>}|null}
 */
function fuentesRevisadasHacePoco_() {
  const cfg = config_();
  return cfg.minutosRevisionHoja > 0 ? leerDeCache_(claveCache_("fuentes", cfg.bdId)) : null;
}

/**
 * Lee las pestañas de datos y, si cambiaron, crea las versiones nuevas de los planes.
 * @returns {Aviso[]}
 */
function revisarFuentes_() {
  const cfg = config_();
  const avisos = [];
  const f = leerFuentes_();
  if (!f.carrera.length) {
    avisos.push(Dominio.aviso("FALTA_OFERTA", "La hoja del sistema no tiene pestañas «" + PESTANAS_DATOS_.carrera.prefijo + "…». " +
                "Agrega una por carrera para cargar la oferta de " + cfg.cicloHoja + ".", { ciclo: cfg.cicloHoja }));
    return avisos;
  }

  /* Los avisos de la lectura (filas repetidas, pestañas desconocidas) se guardan en Fuentes
     para mostrarlos a todos mientras las pestañas no cambien. La oferta se interpreta antes
     de tomar el candado: tarda, y mientras tanto los demás usuarios pueden seguir guardando. */
  const actuales = firmaFuentes_(f);
  const guardadas = leerTabla_(TABLA_.FUENTES);
  if (fuentesIguales_(guardadas, actuales)) return avisos.concat(avisosGuardados_(guardadas));
  try {
    const lectura = ofertaDesdePestanas_(f.carrera, f.departamento.length ? f.departamento : null);
    const deLectura = conCandado_(function () {
      const otraVez = leerTabla_(TABLA_.FUENTES);
      if (fuentesIguales_(otraVez, actuales)) return avisosGuardados_(otraVez);
      const nuevos = aplicarOferta_(lectura);
      const ahora = Dominio.isoPeru();
      reemplazarFilas_(TABLA_.FUENTES, actuales.map(function (a) {
        return [a.tipo, a.pestanas, a.firma, ahora, a.tipo === "carrera" ? JSON.stringify(nuevos) : ""];
      }));
      return nuevos;
    });
    return avisos.concat(deLectura);
  } catch (e) {
    avisos.push(Dominio.aviso("LECTURA_FALLIDA", "No se pudieron leer las pestañas de la hoja: " + e.message));
    return avisos;
  }
}

/**
 * Los avisos guardados antes de que tuvieran tipo son textos: se convierten al leerlos.
 * @param {FilaTabla[]} filas Filas de Fuentes.
 * @returns {Aviso[]}
 */
function avisosGuardados_(filas) {
  return filas.reduce(function (lista, f) {
    try { return lista.concat(f.avisos ? JSON.parse(f.avisos) : []); } catch (e) { return lista; }
  }, []).map(Dominio.comoAviso);
}

/**
 * Identidad del contenido de cada fuente: sus pestañas y la firma de sus celdas.
 * @param {FuentesHoja} f
 * @returns {Array<{tipo: string, pestanas: string, firma: string}>}
 */
function firmaFuentes_(f) {
  return TIPOS_FUENTE_.filter(function (t) { return f[t].length; }).map(function (t) {
    return {
      tipo: t,
      pestanas: f[t].map(function (p) { return nombrePestana_(t, p.nombre); }).join("\n"),
      firma: Dominio.hash(JSON.stringify(f[t].map(function (p) { return [p.nombre, p.filas]; })))
    };
  });
}

/**
 * ¿Es el mismo contenido que el ya procesado?
 * @param {Array<Object>} guardadas
 * @param {Array<Object>} actuales
 * @returns {boolean}
 */
function fuentesIguales_(guardadas, actuales) {
  const clave = function (a) { return a.tipo + "|" + a.firma; };
  const g = guardadas.map(clave).sort().join("\n");
  return g !== "" && g === actuales.map(clave).sort().join("\n");
}

/**
 * Debe llamarse dentro de conCandado_. r: lo que devolvió ofertaDesdePestanas_. Devuelve
 * los avisos de la lectura.
 * @param {{oferta: Object<string, Asignatura[]>, avisos: Aviso[]}} r
 * @returns {Aviso[]}
 */
function aplicarOferta_(r) {
  const ciclo = config_().cicloHoja;
  const usuario = USUARIO_HOJA_;
  const fecha = Dominio.isoPeru();
  let planes = leerPlanes_();

  Object.keys(r.oferta).forEach(function (sig) {
    const asignaturas = r.oferta[sig];
    const firma = Dominio.hash(Dominio.contenidoCanonico(asignaturas));
    const fila = buscarPlan_(planes, ciclo, sig);
    if (fila && fila.firma_hoja === firma) return;
    const p = estadoDePlan_(fila);
    /* Los grupos que siguen existiendo conservan su identificador (sus docentes los
       siguen) y las fusiones que se pierdan se deshacen también en las otras carreras. */
    const antes = p.version ? contenidoPlan_(ciclo, sig, p.version, p.filaVersion) : [];
    Dominio.conservarIds(asignaturas, antes);
    const fus = prepararFusiones_(ciclo, sig, antes, asignaturas, [], null, { sinBloqueo: true });
    registrarVersionPlan_(ciclo, sig, fila, {
      estado: p.estado === Dominio.ESTADOS.SIN ? Dominio.ESTADOS.REGISTRADO : p.estado,
      tipo: p.version ? Dominio.TIPO_VERSION.ACTUALIZACION_HOJA : Dominio.TIPO_VERSION.IMPORTACION_HOJA,
      usuario: usuario,
      fecha: fecha,
      motivo: "",
      asignaturas: fus.asignaturas,
      firma_hoja: firma
    });
    if (fus.otros.length) {
      guardarFusionesAjenas_(ciclo, fus.otros, usuario, fecha);
      planes = leerPlanes_();   // cambió la versión de otros planes
    }
  });
  return r.avisos;
}

/* Autor de las versiones que salen de las pestañas, en el historial. */
var USUARIO_HOJA_ = "hoja: pestañas de oferta";
