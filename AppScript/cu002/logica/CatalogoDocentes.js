// @ts-check
/* Catálogo de docentes (CU-002 paso 10, FA-007 a FA-009): sale de la pestaña
   «Docentes - General» de la hoja del sistema (o de la primera «Docentes - …») y se guarda
   una hora en la caché. La app nunca modifica la pestaña. catalogoDesdeFilas_() es la
   lectura pura que comparte con la revisión de la hoja (hoja/ReglasHoja.js). */

var SEGUNDOS_CACHE_CATALOGO_ = 3600;
/* Para que ninguna consulta espere la lectura, la revisión de las pestañas
   (sincronizarFuentes_, que el tablero pide en segundo plano) vuelve a leer el catálogo
   cuando falta en la caché o le quedan menos de estos segundos; «Releer la hoja», siempre. */
var SEGUNDOS_RENOVAR_CATALOGO_ = 600;

/**
 * Deja el catálogo en la caché si falta, está por caducar o se pide con forzar.
 * @param {boolean} forzar
 * @returns {void}
 */
function calentarCatalogo_(forzar) {
  const guardado = leerDeCache_(claveCache_("catalogo", config_().bdId));
  const leidoEn = guardado && guardado.leidoEn ? Date.parse(guardado.leidoEn) : 0;
  if (forzar || !leidoEn || Date.now() - leidoEn > (SEGUNDOS_CACHE_CATALOGO_ - SEGUNDOS_RENOVAR_CATALOGO_) * 1000)
    leerCatalogoDocentes_(true);
}

/**
 * La pestaña del catálogo: «Docentes - General» o, si no hay, la primera «Docentes - …».
 * @param {PestanaFuente[]} pestanas
 * @returns {PestanaFuente|null}
 */
function pestanaCatalogo_(pestanas) {
  return pestanas.filter(function (p) { return /general/i.test(p.nombre); })[0] || pestanas[0] || null;
}

/**
 * Columnas opcionales que amplían el catálogo: «TC OTRA UNIVERSIDAD» (Sí/No), «CARGO»
 * (texto; si tiene algo, el docente tiene cargo administrativo) y «NO LECTIVAS» (horas).
 * @param {boolean} forzar Lee la pestaña aunque haya copia en caché.
 * @returns {Catalogo}
 */
function leerCatalogoDocentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("catalogo", cfg.bdId);
  if (!forzar) {
    const guardado = leerDeCache_(clave);
    if (guardado && Array.isArray(guardado.docentes)) return guardado;
  }
  const res = { docentes: [], avisos: [], columnas: {} };
  try {
    const pestana = pestanaCatalogo_(pestanasDeFuente_(libroBd_(), "docentes"));
    if (!pestana) {
      res.avisos.push(Dominio.aviso("CATALOGO_FALTA", "La hoja del sistema no tiene la pestaña «" + nombrePestana_("docentes", "General") +
                      "»: no hay catálogo de docentes. Puedes escribir los nombres a mano."));
      return res;
    }
    const cat = catalogoDesdeFilas_(pestana.filas);
    if (!cat) {
      res.avisos.push(Dominio.aviso("CATALOGO_SIN_CABECERAS", "No se reconocen las cabeceras de la pestaña «" + nombrePestana_("docentes", pestana.nombre) + "»."));
      return res;
    }
    res.columnas = { tcOtra: cat.col.tcOtra !== undefined, cargo: cat.col.cargo !== undefined, noLectivas: cat.col.noLect !== undefined };
    res.docentes = cat.docentes.filter(function (d) { return d.pat || d.nom; }).map(function (d) {
      return {
        dni: d.dni, nombreCompleto: d.nombreCompleto, condicion: d.condicion, categoria: d.categoria,
        dpto: Dominio.normalizarDpto(d.dptoTexto) || d.dptoTexto, dedicacion: d.dedicacion,
        tcOtra: d.tcOtra, cargo: d.cargo, noLectivas: d.noLectivas
      };
    });
    res.leidoEn = Dominio.isoPeru();
    guardarEnCache_(clave, res, SEGUNDOS_CACHE_CATALOGO_);
  } catch (e) {
    res.avisos.push(Dominio.aviso("CATALOGO_ILEGIBLE", "No se pudo leer el catálogo de docentes: " + e.message));
  }
  return res;
}

/**
 * Lee el catálogo de las celdas de su pestaña. La cabecera es la primera fila (de las 10
 * primeras) con NOMBRE y APELLIDO PATERNO o DNI. Devuelve cada fila con algún dato, también
 * las que no tienen nombre (la app las salta; la revisión de la hoja las señala). r es el
 * índice de la fila en filas; col, la columna de cada campo. Función pura.
 * @param {string[][]} filas
 * @returns {{fila: number, col: Object<string, number>, docentes: Array<FilaCatalogo>}|null}
 */
function catalogoDesdeFilas_(filas) {
  let cab = -1;
  for (let i = 0; i < Math.min(10, filas.length) && cab < 0; i++) {
    const f = (filas[i] || []).map(Dominio.normalizar);
    if (f.some(function (c) { return c.indexOf("NOMBRE") >= 0; }) && f.some(function (c) { return c.indexOf("PAT") >= 0 || c === "DNI"; })) cab = i;
  }
  if (cab < 0) return null;
  /** @type {Object<string, number>} */
  const col = {};
  filas[cab].map(Dominio.normalizar).forEach(function (c, j) {
    const fijar = function (k, cond) { if (cond && col[k] === undefined) col[k] = j; };
    fijar("dni", c === "DNI");
    fijar("pat", c.indexOf("PATERNO") >= 0 || c.indexOf("APELLIDO PAT") >= 0);
    fijar("mat", c.indexOf("MATERNO") >= 0 || c.indexOf("APELLIDO MAT") >= 0);
    fijar("nom", c === "NOMBRES" || c === "NOMBRE");
    fijar("cond", c.indexOf("CONDICION") >= 0);
    fijar("cat", c.indexOf("CATEGORIA") >= 0);
    fijar("dpto", c.indexOf("DEPARTAMENTO") >= 0 || c === "DPTO");
    fijar("dedic", c.indexOf("DEDIC") >= 0);
    fijar("tcOtra", c.indexOf("OTRA") >= 0 && (c.indexOf("UNIV") >= 0 || c.indexOf("INSTIT") >= 0));
    fijar("cargo", c.indexOf("CARGO") >= 0);
    fijar("noLect", c.indexOf("NO LECTIV") >= 0);
    fijar("lectivas", c === "LECTIVAS");
  });
  const v = function (f, k) { return col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : ""; };
  const si = function (t) { const n = Dominio.normalizar(t); return /^(SI|S|X|1|TRUE|VERDADERO|TC)$/.test(n) || n.indexOf("SI ") === 0; };
  /** @type {FilaCatalogo[]} */
  const docentes = [];
  for (let r = cab + 1; r < filas.length; r++) {
    const f = filas[r] || [];
    if (f.every(function (c) { return String(c == null ? "" : c).trim() === ""; })) continue;
    const pat = v(f, "pat"), mat = v(f, "mat"), nom = v(f, "nom");
    const dedic = Dominio.normalizar(v(f, "dedic"));
    const dedicacion = /** @type {"TC"|"TP"|""} */ (dedic.indexOf("TC") >= 0 || dedic.indexOf("COMPLETO") >= 0 ? "TC" : (dedic ? "TP" : ""));
    docentes.push({
      r: r, dni: v(f, "dni"), pat: pat, nom: nom,
      nombreCompleto: (pat + " " + mat).trim() + (nom ? ", " + nom : ""),
      condicion: v(f, "cond"), categoria: v(f, "cat"), dptoTexto: v(f, "dpto"), dedicTexto: v(f, "dedic"),
      dedicacion: dedicacion,
      dedicClara: !dedic || /TC|COMPLETO|TP|PARCIAL/.test(dedic),
      tcOtra: col.tcOtra !== undefined && si(v(f, "tcOtra")),
      cargo: col.cargo !== undefined ? v(f, "cargo") : "",
      noLectivas: col.noLect !== undefined ? Dominio.num(v(f, "noLect")) : null,
      lectivas: v(f, "lectivas")
    });
  }
  return { fila: cab, col: col, docentes: docentes };
}
