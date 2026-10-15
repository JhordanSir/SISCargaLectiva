/* Los .xlsx de la carpeta de Drive son la fuente de la oferta de SIS_CICLO_XLSX.
   Nunca se modifican. Cuando cambian (otro archivo o una fecha de modificación
   distinta), cada plan cuyo contenido en el xlsx cambió recibe una versión nueva:
   «importación desde xlsx» si no tenía ninguna, «actualización desde xlsx» si ya tenía. */

/* Mirar la carpeta cuesta decenas de llamadas a Drive, así que se hace como mucho una
   vez cada SIS_MINUTOS_REVISION_XLSX minutos; mientras tanto se repiten los avisos de la
   última revisión. forzar (el botón «Releer Excel») mira la carpeta en el momento. */
function sincronizarFuentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("xlsx", cfg.carpetaId);
  if (!forzar && cfg.minutosRevisionXlsx > 0) {
    const ultima = leerDeCache_(clave);
    if (ultima) return ultima.avisos;
  }
  const avisos = revisarFuentes_();
  if (cfg.minutosRevisionXlsx > 0) guardarEnCache_(clave, { avisos: avisos }, cfg.minutosRevisionXlsx * 60);
  return avisos;
}

function xlsxRevisadoHacePoco_() {
  const cfg = config_();
  return cfg.minutosRevisionXlsx > 0 ? leerDeCache_(claveCache_("xlsx", cfg.carpetaId)) : null;
}

function revisarFuentes_() {
  const cfg = config_();
  const avisos = [];
  const carpeta = abrirCarpeta_(cfg.carpetaId);
  if (!carpeta) return ["No se pudo abrir la carpeta de Drive del sistema (SIS_CARPETA_ID). Ejecuta instalar() desde el editor."];

  const f = localizarXlsx_(carpeta, avisos);
  if (!f.carrera) {
    avisos.push("La carpeta «" + carpeta.getName() + "» no tiene el archivo CargaXCarrera (.xlsx). " +
                "Súbelo para cargar la oferta de " + cfg.cicloXlsx + ".");
    return avisos;
  }

  /* Los avisos de la lectura (filas repetidas, hojas desconocidas) se guardan en Fuentes
     para mostrarlos a todos mientras el xlsx no cambie. Los xlsx se leen antes de tomar
     el candado: leerlos tarda, y mientras tanto los demás usuarios pueden seguir guardando. */
  const actuales = firmaFuentes_(f);
  const guardadas = leerTabla_("Fuentes");
  if (fuentesIguales_(guardadas, actuales)) return avisos.concat(avisosGuardados_(guardadas));
  try {
    const lectura = leerOfertaXlsx_(f);
    const deLectura = conCandado_(function () {
      const otraVez = leerTabla_("Fuentes");
      if (fuentesIguales_(otraVez, actuales)) return avisosGuardados_(otraVez);
      const nuevos = aplicarOferta_(f, lectura);
      const ahora = new Date().toISOString();
      reemplazarFilas_("Fuentes", actuales.map(function (a) {
        return [a.tipo, a.archivo_id, a.nombre, a.modificado, ahora, a.tipo === "carrera" ? JSON.stringify(nuevos) : ""];
      }));
      return nuevos;
    });
    return avisos.concat(deLectura);
  } catch (e) {
    avisos.push("No se pudieron leer los xlsx de la carpeta: " + e.message);
    return avisos;
  }
}

function avisosGuardados_(filas) {
  return filas.reduce(function (lista, f) {
    try { return lista.concat(f.avisos ? JSON.parse(f.avisos) : []); } catch (e) { return lista; }
  }, []);
}

function tipoDeFuente_(nombre) {
  const n = Dominio.normalizar(nombre).replace(/[^A-Z]/g, "");
  if (n.indexOf("CARGAXCARRERA") >= 0) return "carrera";
  if (n.indexOf("CARGAXDEPARTAMENTO") >= 0) return "departamento";
  if (n.indexOf("CARGADEDOCENTES") >= 0 || n.indexOf("DOCENTES") >= 0) return "docentes";
  return null;
}

function localizarXlsx_(carpeta, avisos) {
  const candidatos = { carrera: [], departamento: [], docentes: [] };
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const a = it.next();
    if (a.isTrashed()) continue;
    const tipo = tipoDeFuente_(a.getName());
    if (!tipo) continue;
    if (a.getMimeType() === MimeType.GOOGLE_SHEETS) {
      avisos.push("«" + a.getName() + "» está convertido a Hoja de cálculo de Google y no se lee: " +
                  "el sistema usa el .xlsx original. Súbelo sin convertir.");
      continue;
    }
    if (a.getMimeType() !== MimeType.MICROSOFT_EXCEL && !/\.xlsx$/i.test(a.getName())) continue;
    candidatos[tipo].push(a);
  }

  const elegir = function (lista, etiqueta) {
    if (!lista.length) return null;
    lista.sort(function (x, y) { return y.getLastUpdated().getTime() - x.getLastUpdated().getTime(); });
    if (lista.length > 1)
      avisos.push("Hay " + lista.length + " archivos " + etiqueta + " en la carpeta; se usa el más reciente, «" + lista[0].getName() + "».");
    return lista[0];
  };
  return {
    carrera: elegir(candidatos.carrera, "CargaXCarrera"),
    departamento: elegir(candidatos.departamento, "CargaXDepartamento"),
    docentes: elegir(candidatos.docentes, "CargaDeDocentes")
  };
}

function firmaFuentes_(f) {
  return ["carrera", "departamento", "docentes"].filter(function (t) { return f[t]; }).map(function (t) {
    return { tipo: t, archivo_id: f[t].getId(), nombre: f[t].getName(), modificado: f[t].getLastUpdated().toISOString() };
  });
}

function fuentesIguales_(guardadas, actuales) {
  const clave = function (a) { return a.tipo + "|" + a.archivo_id + "|" + a.modificado; };
  const g = guardadas.map(clave).sort().join("\n");
  return g !== "" && g === actuales.map(clave).sort().join("\n");
}

/* Lee los xlsx y arma la oferta de cada carrera. No toca la hoja del sistema. */
function leerOfertaXlsx_(f) {
  const libroCarrera = leerLibroXlsx_(descomprimirXlsx_(f.carrera.getBlob()));
  const libroDepartamento = f.departamento ? leerLibroXlsx_(descomprimirXlsx_(f.departamento.getBlob())) : null;
  return ofertaDesdeLibros_(libroCarrera, libroDepartamento);
}

/* Debe llamarse dentro de conCandado_. r: lo que devolvió leerOfertaXlsx_. Devuelve los
   avisos de la lectura. */
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
    const fecha = new Date(modificado).toISOString();
    registrarVersionPlan_(ciclo, sig, fila, {
      estado: p.estado === Dominio.ESTADOS.SIN ? Dominio.ESTADOS.REGISTRADO : p.estado,
      tipo: p.version ? "actualización desde xlsx" : "importación desde xlsx",
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
