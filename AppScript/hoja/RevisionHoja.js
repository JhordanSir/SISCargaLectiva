// @ts-check
/* Revisión de las pestañas de datos de la hoja del sistema: calcula sus advertencias
   (ReglasHoja.js), las pinta (PintadoHoja.js) y las deja en la caché del documento para el
   panel de advertencias y para la siguiente edición. La oferta, la carga y el catálogo se
   revisan juntos (la carga se cruza con los otros dos); Usuarios, por su cuenta. */

var CLAVE_AVISOS_HOJA_ = "scl:avisos:hoja";
var SEGUNDOS_CACHE_HOJA_ = 21600;

/** @type {TipoPestana[]} */
var TIPOS_REVISADOS_ = ["usuarios", "carrera", "departamento", "docentes"];

/**
 * Clave de caché de las celdas de una pestaña.
 * @param {string} nombreHoja
 * @returns {string}
 */
function claveValoresPestana_(nombreHoja) { return "scl:val:" + nombreHoja; }

/**
 * Guarda varios valores en la caché del documento. Cada valor admite 100 KB: lo que no
 * cabe se vuelve a leer la próxima vez.
 * @param {Object<string, string>} pares
 * @returns {void}
 */
function guardarEnCacheHoja_(pares) {
  const cache = CacheService.getDocumentCache();
  const juntos = {};
  Object.keys(pares).forEach(function (k) { if (pares[k].length < 95000) juntos[k] = pares[k]; });
  if (!Object.keys(juntos).length) return;
  try { cache.putAll(juntos, SEGUNDOS_CACHE_HOJA_); } catch (e) {
    Object.keys(juntos).forEach(function (k) { try { cache.put(k, juntos[k], SEGUNDOS_CACHE_HOJA_); } catch (err) { /* se relee */ } });
  }
}

/**
 * Las advertencias de la última revisión, o null si ya no están en la caché.
 * @returns {AvisoCelda[]|null}
 */
function avisosGuardadosHoja_() {
  const t = CacheService.getDocumentCache().get(CLAVE_AVISOS_HOJA_);
  try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
}

/**
 * Fila de cabeceras de una pestaña (desde 1), la que se resalta.
 * @param {TipoPestana} tipo
 * @param {PestanaRevisada} p
 * @returns {number}
 */
function filaCabeceraPestana_(tipo, p) {
  if (tipo === "carrera") { const o = leerOfertaHoja_(p.valores, p.original); return o ? o.filaCab + 1 : 1; }
  if (tipo === "departamento") { const c = leerCargaHoja_(p.valores); return c.conCabecera ? Dominio.ubicarColumnasCarga(p.valores).cab + 1 : 1; }
  if (tipo === "docentes") { const c = catalogoDesdeFilas_(p.valores); return c ? c.fila + 1 : 1; }
  return 1;
}

/**
 * Calcula las advertencias de los tipos pedidos (las de los demás salen de «previos»),
 * pinta las pestañas que cambiaron y deja todo en la caché. Con «editada» (desde onEdit)
 * solo se relee esa pestaña: las demás salen de la caché de celdas que deja cada lectura,
 * porque solo cambian cuando se las edita. Sin «previos», revisa todo.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @param {TipoPestana[]} tipos
 * @param {AvisoCelda[]|null} previos
 * @param {boolean} forzar Repinta aunque no hayan cambiado.
 * @param {string=} editada
 * @returns {{avisos: AvisoCelda[], pestanas: Object<string, number>, cuentas: Object<string, Object<NivelHoja, number>>}}
 */
function revisarHoja_(libro, tipos, previos, forzar, editada) {
  const pedir = {};
  (previos ? tipos : TIPOS_REVISADOS_).forEach(function (t) { pedir[t] = true; });
  if (pedir.carrera || pedir.departamento || pedir.docentes) TIPOS_FUENTE_.forEach(function (t) { pedir[t] = true; });
  const calculados = TIPOS_REVISADOS_.filter(function (t) { return pedir[t]; });

  const hojas = libro.getSheets().map(function (h) { return { hoja: h, nombre: h.getName(), tipo: tipoDePestana_(h.getName()) }; })
    .filter(function (x) { return x.tipo && pedir[x.tipo]; });
  const usarCache = !!editada && !forzar;
  const cache = CacheService.getDocumentCache();
  const guardado = cache.getAll(hojas.map(function (x) { return claveFirmaPestana_(x.nombre); })
    .concat(usarCache ? hojas.map(function (x) { return claveValoresPestana_(x.nombre); }) : [])) || {};
  const leidos = {};
  /** @type {Object<string, Array<PestanaRevisada & {hoja: GoogleAppsScript.Spreadsheet.Sheet}>>} */
  const datos = { usuarios: [], carrera: [], departamento: [], docentes: [] };
  hojas.forEach(function (x) {
    const k = claveValoresPestana_(x.nombre);
    let valores = null;
    if (usarCache && x.nombre !== editada && guardado[k]) { try { valores = JSON.parse(guardado[k]); } catch (e) { valores = null; } }
    if (!valores) { valores = valoresPestana_(x.hoja); leidos[k] = JSON.stringify(valores); }
    const prefijo = PESTANAS_DATOS_[x.tipo].prefijo || "";
    datos[x.tipo].push({ hoja: x.hoja, nombre: x.nombre, original: x.nombre.slice(prefijo.length), valores: valores });
  });

  let avisos = [];
  if (pedir.usuarios) datos.usuarios.forEach(function (u) { avisos = avisos.concat(revisarUsuariosHoja_(u, config_().dominio)); });
  if (pedir.carrera) {
    const general = datos.docentes.filter(function (d) { return /GENERAL/i.test(d.original); })[0] || datos.docentes[0] || null;
    const catalogo = general ? catalogoDesdeFilas_(general.valores) : null;
    avisos = avisos.concat(revisarOfertaHoja_(datos.carrera));
    if (general) avisos = avisos.concat(revisarCatalogoHoja_(general));
    avisos = avisos.concat(revisarCargaHoja_(datos.departamento, { oferta: indiceOfertaHoja_(datos.carrera), catalogo: catalogo ? catalogo.docentes : [] }));
  }
  (previos || []).forEach(function (a) {
    const t = tipoDePestana_(a.hoja);
    if (t && !pedir[t]) avisos.push(a);
  });

  const porHoja = {};
  avisos.forEach(function (a) { (porHoja[a.hoja] = porHoja[a.hoja] || []).push(a); });
  /** @type {Object<string, number>} */
  const pestanas = {};
  /** @type {Object<string, string>} */
  const nuevas = {};
  calculados.forEach(function (t) {
    datos[t].forEach(function (p) {
      const firma = pintarRevision_(p.hoja, porHoja[p.nombre] || [], filaCabeceraPestana_(t, p), forzar, guardado);
      if (firma) nuevas[claveFirmaPestana_(p.nombre)] = firma;
    });
    pestanas[t] = datos[t].length;
  });
  nuevas[CLAVE_AVISOS_HOJA_] = JSON.stringify(avisos);
  guardarEnCacheHoja_(Object.assign(nuevas, leidos));
  return { avisos: avisos, pestanas: pestanas, cuentas: cuentasPorTipo_(avisos) };
}

/**
 * Cuántas advertencias de cada nivel tiene cada tipo de pestaña.
 * @param {AvisoCelda[]} avisos
 * @returns {Object<string, Object<NivelHoja, number>>}
 */
function cuentasPorTipo_(avisos) {
  const c = {};
  TIPOS_REVISADOS_.forEach(function (t) { c[t] = { error: 0, advertencia: 0, observacion: 0 }; });
  avisos.forEach(function (a) { const t = tipoDePestana_(a.hoja); if (t) c[t][a.nivel]++; });
  return c;
}
