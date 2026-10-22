// @ts-check
/* Dominio: la lógica de CU-001 y CU-002 que comparten el servidor y el navegador. Son tres
   fábricas, cada una en la carpeta de su caso de uso:
     comun/DominioComun.js   datos maestros, normalización, saneadores y firma;
     cu001/DominioPlan.js    plan de ciclo (CU-001);
     cu002/DominioCarga.js   carga docente (CU-002).
   crearDominio_() las combina y decide qué es público. El navegador recibe el texto de las
   cuatro funciones (fuenteDominio_) y lo ejecuta tal cual.

   Apps Script ejecuta los archivos en el orden del proyecto, y una fábrica de un archivo
   posterior todavía no existe mientras se ejecuta uno anterior. Para que el orden no
   importe, Dominio se crea la primera vez que se usa. Su tipo para tsc está en Globales.d.ts. */

/**
 * Combina las tres fábricas. Lo que devuelve es lo único público de Dominio.
 * @returns Lo público de Dominio (tsc deduce el tipo).
 */
function crearDominio_() {
  "use strict";
  const comun = crearDominioComun_();
  const plan = crearDominioPlan_(comun);
  const t = Object.assign({}, comun, plan, crearDominioCarga_(comun));
  return {
    DPTOS: t.DPTOS, normalizarDpto: t.normalizarDpto, nombreDpto: t.nombreDpto,
    claveDocente: t.claveDocente, LIMITES: t.LIMITES, PENDIENTE_INTERNACIONAL: t.PENDIENTE_INTERNACIONAL,
    esPendienteInternacional: t.esPendienteInternacional,
    unidadesDelCiclo: t.unidadesDelCiclo, indiceUnidades: t.indiceUnidades, unidadDe: t.unidadDe,
    asignacionesVigentes: t.asignacionesVigentes, coberturaUnidad: t.coberturaUnidad,
    claveDeDocente: t.claveDeDocente, calcularBalance: t.calcularBalance, excesosAlGuardar: t.excesosAlGuardar,
    sugerirDocentes: t.sugerirDocentes, interpretarCargaDepartamento: t.interpretarCargaDepartamento,
    CARRERAS: t.CARRERAS, ESTADOS: t.ESTADOS, TIPO_VERSION: t.TIPO_VERSION, REF: t.REF,
    TIPOS_AVISO: t.TIPOS_AVISO, aviso: t.aviso, comoAviso: t.comoAviso, htmlIcono: t.htmlIcono,
    dptoDeCarrera: t.dptoDeCarrera, carrerasDeDpto: t.carrerasDeDpto, isoPeru: t.isoPeru,
    nombreCarrera: t.nombreCarrera, normalizar: t.normalizar, canonica: t.canonica,
    matrizDesdeTexto: t.matrizDesdeTexto, ubicarCabeceras: t.ubicarCabeceras,
    siglaDeCarrera: t.siglaDeCarrera,
    interpretar: t.interpretar, num: t.num, th: t.th, totales: t.totales, esInternacional: t.esInternacional,
    agregarAsignatura: t.agregarAsignatura, eliminarAsignatura: t.eliminarAsignatura,
    agregarGrupo: t.agregarGrupo, agregarGrupoSemestre: t.agregarGrupoSemestre,
    eliminarGrupo: t.eliminarGrupo, desdoblar: t.desdoblar, quitarDesdoble: t.quitarDesdoble,
    fusionar: t.fusionar, deshacerFusion: t.deshacerFusion,
    conservarIds: t.conservarIds,
    marcasAfectadas: t.marcasAfectadas, reconciliarFusiones: t.reconciliarFusiones,
    sanearAsignaturas: t.sanearAsignaturas, sanearAsignaciones: t.sanearAsignaciones, sanearMarcas: t.sanearMarcas,
    contenidoCanonico: t.contenidoCanonico, hash: t.hash
  };
}

/**
 * Texto que recrea Dominio en el navegador (Index.js lo inserta en la página).
 * @returns {string}
 */
function fuenteDominio_() {
  return "(function () {\n" + [crearDominioComun_, crearDominioPlan_, crearDominioCarga_, crearDominio_].map(String).join("\n\n") +
         "\nreturn crearDominio_();\n})()";
}

/** @type {ReturnType<typeof crearDominio_>|null} */
var dominioCreado_ = null;

Object.defineProperty(globalThis, "Dominio", {
  configurable: true,
  get: function () { return dominioCreado_ || (dominioCreado_ = crearDominio_()); }
});
