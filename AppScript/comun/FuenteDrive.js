// @ts-check
/* Archivos .xlsx de la carpeta de Drive del sistema: qué es cada uno por su nombre y cuál es
   el más reciente de cada tipo. Lo usan la lectura de la oferta (cu001/OfertaDrive.js) y el
   catálogo de docentes (cu002/CatalogoDocentes.js). Nunca se modifican. */

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
