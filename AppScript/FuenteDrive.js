/* Los .xlsx de la carpeta de Drive son la fuente de la oferta de SIS_CICLO_XLSX.
   Nunca se modifican. Cuando cambian (otro archivo o una fecha de modificación
   distinta), cada plan cuyo contenido en el xlsx cambió recibe una versión nueva:
   «importación desde xlsx» si no tenía ninguna, «actualización desde xlsx» si ya tenía. */

function sincronizarFuentes_() {
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
     para mostrarlos a todos mientras el xlsx no cambie. */
  const actuales = firmaFuentes_(f);
  const guardadas = leerTabla_("Fuentes");
  if (fuentesIguales_(guardadas, actuales)) return avisos.concat(avisosGuardados_(guardadas));
  try {
    const deLectura = conCandado_(function () {
      const otraVez = leerTabla_("Fuentes");
      if (fuentesIguales_(otraVez, actuales)) return avisosGuardados_(otraVez);
      const nuevos = aplicarXlsx_(f);
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
  return null;
}

function localizarXlsx_(carpeta, avisos) {
  const candidatos = { carrera: [], departamento: [] };
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
  return { carrera: elegir(candidatos.carrera, "CargaXCarrera"), departamento: elegir(candidatos.departamento, "CargaXDepartamento") };
}

function firmaFuentes_(f) {
  return ["carrera", "departamento"].filter(function (t) { return f[t]; }).map(function (t) {
    return { tipo: t, archivo_id: f[t].getId(), nombre: f[t].getName(), modificado: f[t].getLastUpdated().toISOString() };
  });
}

function fuentesIguales_(guardadas, actuales) {
  const clave = function (a) { return a.tipo + "|" + a.archivo_id + "|" + a.modificado; };
  const g = guardadas.map(clave).sort().join("\n");
  return g !== "" && g === actuales.map(clave).sort().join("\n");
}

/* Debe llamarse dentro de conCandado_. Devuelve los avisos de la lectura. */
function aplicarXlsx_(f) {
  const cfg = config_();
  const libroCarrera = leerLibroXlsx(descomprimirXlsx_(f.carrera.getBlob()));
  const libroDepartamento = f.departamento ? leerLibroXlsx(descomprimirXlsx_(f.departamento.getBlob())) : null;
  const r = ofertaDesdeLibros(libroCarrera, libroDepartamento);

  const ciclo = cfg.cicloXlsx;
  const modificado = Math.max(f.carrera.getLastUpdated().getTime(),
                              f.departamento ? f.departamento.getLastUpdated().getTime() : 0);
  const usuario = "xlsx: " + f.carrera.getName();
  const planes = leerPlanes_();

  Object.keys(r.oferta).forEach(function (sig) {
    const asignaturas = r.oferta[sig];
    const firma = Dominio.hash(Dominio.contenidoCanonico(asignaturas));
    const fila = buscarPlan_(planes, ciclo, sig);
    if (fila && fila.firma_xlsx === firma) return;
    const p = estadoDePlan_(fila);
    registrarVersion_(ciclo, sig, fila, {
      estado: p.estado === Dominio.ESTADOS.SIN ? Dominio.ESTADOS.REGISTRADO : p.estado,
      tipo: p.version ? "actualización desde xlsx" : "importación desde xlsx",
      usuario: usuario,
      fecha: new Date(modificado).toISOString(),
      motivo: "",
      asignaturas: asignaturas,
      firma_xlsx: firma
    });
  });
  return r.avisos;
}
