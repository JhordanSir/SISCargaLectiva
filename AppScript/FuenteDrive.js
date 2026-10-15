// @ts-check
/* Los .xlsx de la carpeta de Drive son la fuente de la oferta de SIS_CICLO_XLSX.
   Nunca se modifican. Cuando cambian (otro archivo o una fecha de modificación
   distinta), cada plan cuyo contenido en el xlsx cambió recibe una versión nueva:
   «importación desde xlsx» si no tenía ninguna, «actualización desde xlsx» si ya tenía. */

/**
 * Mirar la carpeta cuesta decenas de llamadas a Drive, así que se hace como mucho una
 * vez cada SIS_MINUTOS_REVISION_XLSX minutos; mientras tanto se repiten los avisos de la
 * última revisión. forzar (el botón «Releer Excel») mira la carpeta en el momento.
 * @param {boolean} forzar
 * @returns {Aviso[]}
 */
function sincronizarFuentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("xlsx", cfg.carpetaId);
  if (!forzar && cfg.minutosRevisionXlsx > 0) {
    const ultima = leerDeCache_(clave);
    if (ultima) return ultima.avisos.map(Dominio.comoAviso);
  }
  const avisos = revisarFuentes_();
  if (cfg.minutosRevisionXlsx > 0) guardarEnCache_(clave, { avisos: avisos }, cfg.minutosRevisionXlsx * 60);
  calentarCatalogo_(forzar);
  return avisos;
}

/**
 * Resultado de la última revisión de los xlsx si fue hace menos de SIS_MINUTOS_REVISION_XLSX, o null.
 * @returns {{avisos: Array<Aviso|string>}|null}
 */
function xlsxRevisadoHacePoco_() {
  const cfg = config_();
  return cfg.minutosRevisionXlsx > 0 ? leerDeCache_(claveCache_("xlsx", cfg.carpetaId)) : null;
}

/**
 * Mira la carpeta de Drive y, si los xlsx cambiaron, crea las versiones nuevas de los planes.
 * @returns {Aviso[]}
 */
function revisarFuentes_() {
  const cfg = config_();
  const avisos = [];
  const carpeta = abrirCarpeta_(cfg.carpetaId);
  if (!carpeta) return [Dominio.aviso("CARPETA_INACCESIBLE", "No se pudo abrir la carpeta de Drive del sistema (SIS_CARPETA_ID). Ejecuta instalar() desde el editor.")];

  const f = localizarXlsx_(carpeta, avisos);
  if (!f.carrera) {
    avisos.push(Dominio.aviso("FALTA_CARGA_CARRERA", "La carpeta «" + carpeta.getName() + "» no tiene el archivo CargaXCarrera (.xlsx). " +
                "Súbelo para cargar la oferta de " + cfg.cicloXlsx + ".", { ciclo: cfg.cicloXlsx }));
    return avisos;
  }

  /* Los avisos de la lectura (filas repetidas, hojas desconocidas) se guardan en Fuentes
     para mostrarlos a todos mientras el xlsx no cambie. Los xlsx se leen antes de tomar
     el candado: leerlos tarda, y mientras tanto los demás usuarios pueden seguir guardando. */
  const actuales = firmaFuentes_(f);
  const guardadas = leerTabla_(TABLA_.FUENTES);
  if (fuentesIguales_(guardadas, actuales)) return avisos.concat(avisosGuardados_(guardadas));
  try {
    const lectura = leerOfertaXlsx_(f);
    const deLectura = conCandado_(function () {
      const otraVez = leerTabla_(TABLA_.FUENTES);
      if (fuentesIguales_(otraVez, actuales)) return avisosGuardados_(otraVez);
      const nuevos = aplicarOferta_(f, lectura);
      const ahora = Dominio.isoPeru();
      reemplazarFilas_(TABLA_.FUENTES, actuales.map(function (a) {
        return [a.tipo, a.archivo_id, a.nombre, a.modificado, ahora, a.tipo === "carrera" ? JSON.stringify(nuevos) : ""];
      }));
      return nuevos;
    });
    return avisos.concat(deLectura);
  } catch (e) {
    avisos.push(Dominio.aviso("LECTURA_XLSX_FALLIDA", "No se pudieron leer los xlsx de la carpeta: " + e.message));
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
 * Qué archivo es por su nombre: «carrera», «departamento», «docentes» o null.
 * @param {string} nombre
 * @returns {"carrera"|"departamento"|"docentes"|null}
 */
function tipoDeFuente_(nombre) {
  const n = Dominio.normalizar(nombre).replace(/[^A-Z]/g, "");
  if (n.indexOf("CARGAXCARRERA") >= 0) return "carrera";
  if (n.indexOf("CARGAXDEPARTAMENTO") >= 0) return "departamento";
  if (n.indexOf("CARGADEDOCENTES") >= 0 || n.indexOf("DOCENTES") >= 0) return "docentes";
  return null;
}

/**
 * El .xlsx más reciente de cada tipo en la carpeta. Añade a «avisos» lo que no se puede leer.
 * @param {GoogleAppsScript.Drive.Folder} carpeta
 * @param {Aviso[]} avisos
 * @returns {FuentesXlsx}
 */
function localizarXlsx_(carpeta, avisos) {
  const candidatos = { carrera: [], departamento: [], docentes: [] };
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const a = it.next();
    if (a.isTrashed()) continue;
    const tipo = tipoDeFuente_(a.getName());
    if (!tipo) continue;
    if (a.getMimeType() === MimeType.GOOGLE_SHEETS) {
      avisos.push(Dominio.aviso("XLSX_CONVERTIDO", "«" + a.getName() + "» está convertido a Hoja de cálculo de Google y no se lee: " +
                  "el sistema usa el .xlsx original. Súbelo sin convertir.", { archivo: a.getName() }));
      continue;
    }
    if (a.getMimeType() !== MimeType.MICROSOFT_EXCEL && !/\.xlsx$/i.test(a.getName())) continue;
    candidatos[tipo].push(a);
  }

  const elegir = function (lista, etiqueta) {
    if (!lista.length) return null;
    lista.sort(function (x, y) { return y.getLastUpdated().getTime() - x.getLastUpdated().getTime(); });
    if (lista.length > 1)
      avisos.push(Dominio.aviso("VARIOS_ARCHIVOS", "Hay " + lista.length + " archivos " + etiqueta + " en la carpeta; se usa el más reciente, «" +
                  lista[0].getName() + "».", { cuantos: lista.length, usado: lista[0].getName() }));
    return lista[0];
  };
  return {
    carrera: elegir(candidatos.carrera, "CargaXCarrera"),
    departamento: elegir(candidatos.departamento, "CargaXDepartamento"),
    docentes: elegir(candidatos.docentes, "CargaDeDocentes")
  };
}

/**
 * Identidad de los xlsx elegidos: tipo, id, nombre y fecha de modificación.
 * @param {FuentesXlsx} f
 * @returns {Array<{tipo: string, archivo_id: string, nombre: string, modificado: string}>}
 */
function firmaFuentes_(f) {
  return ["carrera", "departamento", "docentes"].filter(function (t) { return f[t]; }).map(function (t) {
    return { tipo: t, archivo_id: f[t].getId(), nombre: f[t].getName(), modificado: Dominio.isoPeru(f[t].getLastUpdated()) };
  });
}

/**
 * ¿Son los mismos archivos, sin cambios, que los ya procesados?
 * @param {Array<Object>} guardadas
 * @param {Array<Object>} actuales
 * @returns {boolean}
 */
function fuentesIguales_(guardadas, actuales) {
  const clave = function (a) { return a.tipo + "|" + a.archivo_id + "|" + a.modificado; };
  const g = guardadas.map(clave).sort().join("\n");
  return g !== "" && g === actuales.map(clave).sort().join("\n");
}

/**
 * Lee los xlsx y arma la oferta de cada carrera. No toca la hoja del sistema.
 * @param {FuentesXlsx} f
 * @returns {{oferta: Object<string, Asignatura[]>, avisos: Aviso[]}}
 */
function leerOfertaXlsx_(f) {
  const libroCarrera = leerLibroXlsx_(descomprimirXlsx_(f.carrera.getBlob()));
  const libroDepartamento = f.departamento ? leerLibroXlsx_(descomprimirXlsx_(f.departamento.getBlob())) : null;
  return ofertaDesdeLibros_(libroCarrera, libroDepartamento);
}

/**
 * Debe llamarse dentro de conCandado_. r: lo que devolvió leerOfertaXlsx_. Devuelve los
 * avisos de la lectura.
 * @param {FuentesXlsx} f
 * @param {{oferta: Object<string, Asignatura[]>, avisos: Aviso[]}} r
 * @returns {Aviso[]}
 */
function aplicarOferta_(f, r) {
  const cfg = config_();

  const ciclo = cfg.cicloXlsx;
  const modificado = Math.max(f.carrera.getLastUpdated().getTime(),
                              f.departamento ? f.departamento.getLastUpdated().getTime() : 0);
  const usuario = "xlsx: " + f.carrera.getName();
  let planes = leerPlanes_();

  Object.keys(r.oferta).forEach(function (sig) {
    const asignaturas = r.oferta[sig];
    const firma = Dominio.hash(Dominio.contenidoCanonico(asignaturas));
    const fila = buscarPlan_(planes, ciclo, sig);
    if (fila && fila.firma_xlsx === firma) return;
    const p = estadoDePlan_(fila);
    /* Los grupos que siguen existiendo conservan su identificador (sus docentes los
       siguen) y las fusiones que se pierdan se deshacen también en las otras carreras. */
    const antes = p.version ? contenidoPlan_(ciclo, sig, p.version, p.filaVersion) : [];
    Dominio.conservarIds(asignaturas, antes);
    const fus = prepararFusiones_(ciclo, sig, antes, asignaturas, [], null, { sinBloqueo: true });
    const fecha = Dominio.isoPeru(modificado);
    registrarVersionPlan_(ciclo, sig, fila, {
      estado: p.estado === Dominio.ESTADOS.SIN ? Dominio.ESTADOS.REGISTRADO : p.estado,
      tipo: p.version ? Dominio.TIPO_VERSION.ACTUALIZACION_XLSX : Dominio.TIPO_VERSION.IMPORTACION_XLSX,
      usuario: usuario,
      fecha: fecha,
      motivo: "",
      asignaturas: fus.asignaturas,
      firma_xlsx: firma
    });
    if (fus.otros.length) {
      guardarFusionesAjenas_(ciclo, fus.otros, usuario, fecha);
      planes = leerPlanes_();   // cambió la versión de otros planes
    }
  });
  return r.avisos;
}
