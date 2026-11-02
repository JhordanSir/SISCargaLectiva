// @ts-check
/* Pestañas de datos de la hoja del sistema. La gente las edita en la hoja (con las
   advertencias de hoja/) y la app las lee sin modificarlas:
     «Oferta - <carrera>»       la oferta de cada carrera (CU-001 FA-009 a FA-012);
     «Carga - <departamento>»   la carga por departamento: aporta la CONDICIÓN de cada código;
     «Docentes - General»       el catálogo de docentes (CU-002 paso 10, FA-007 a FA-009);
     «Usuarios»                 las cuentas y sus roles, que también es una tabla del sistema.
   Las lee la oferta (cu001/logica/OfertaHoja.js), el catálogo (cu002/logica/CatalogoDocentes.js) y la
   revisión de la hoja (hoja/RevisionHoja.js). */

/** @type {Object<TipoPestana, {nombre?: string, prefijo?: string, etiqueta: string, color: string}>} */
var PESTANAS_DATOS_ = {
  usuarios: { nombre: "Usuarios", etiqueta: "Usuarios", color: "#5F6B7A" },
  carrera: { prefijo: "Oferta - ", etiqueta: "Oferta por carrera", color: "#1F3A5F" },
  departamento: { prefijo: "Carga - ", etiqueta: "Carga por departamento", color: "#00695C" },
  docentes: { prefijo: "Docentes - ", etiqueta: "Catálogo de docentes", color: "#7B1F3A" }
};

/** @type {TipoFuente[]} Las tres fuentes de la oferta y del catálogo. */
var TIPOS_FUENTE_ = ["carrera", "departamento", "docentes"];

/**
 * Qué datos tiene una pestaña por su nombre, o null si no es una pestaña de datos.
 * @param {string} nombre
 * @returns {TipoPestana|null}
 */
function tipoDePestana_(nombre) {
  const n = String(nombre);
  if (n === PESTANAS_DATOS_.usuarios.nombre) return "usuarios";
  for (let i = 0; i < TIPOS_FUENTE_.length; i++)
    if (n.indexOf(PESTANAS_DATOS_[TIPOS_FUENTE_[i]].prefijo) === 0) return TIPOS_FUENTE_[i];
  return null;
}

/**
 * Celdas de una pestaña tal como se ven en la hoja, sin espacios al principio ni al final.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} hoja
 * @returns {string[][]}
 */
function valoresPestana_(hoja) {
  const filas = hoja.getLastRow(), cols = hoja.getLastColumn();
  if (!filas || !cols) return [];
  return hoja.getRange(1, 1, filas, cols).getDisplayValues().map(function (f) {
    return f.map(function (c) { return String(c == null ? "" : c).trim(); });
  });
}

/**
 * Las pestañas de una fuente, en el orden de la hoja, con su nombre sin el prefijo
 * («Oferta - Derecho» → «Derecho»).
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {TipoFuente} tipo
 * @returns {PestanaFuente[]}
 */
function pestanasDeFuente_(libro, tipo) {
  const prefijo = PESTANAS_DATOS_[tipo].prefijo;
  return libro.getSheets().filter(function (h) { return h.getName().indexOf(prefijo) === 0; }).map(function (h) {
    return { nombre: h.getName().slice(prefijo.length), filas: valoresPestana_(h) };
  });
}

/**
 * Las tres fuentes de la hoja del sistema.
 * @returns {FuentesHoja}
 */
function leerFuentes_() {
  const libro = libroBd_();
  return {
    carrera: pestanasDeFuente_(libro, "carrera"),
    departamento: pestanasDeFuente_(libro, "departamento"),
    docentes: pestanasDeFuente_(libro, "docentes")
  };
}

/**
 * Nombre completo de una pestaña de una fuente, para los mensajes: «Oferta - Derecho».
 * @param {TipoFuente} tipo
 * @param {string} nombre Sin el prefijo.
 * @returns {string}
 */
function nombrePestana_(tipo, nombre) {
  return PESTANAS_DATOS_[tipo].prefijo + nombre;
}
