// @ts-check
/* Catálogo de docentes (CU-002): sale de CargaDeDocentes.xlsx, en la carpeta de Drive del
   sistema, y se guarda una hora en la caché. Nunca se modifica el archivo. */

var SEGUNDOS_CACHE_CATALOGO_ = 3600;
/* Leer CargaDeDocentes tarda unos segundos. Para que ninguna consulta lo espere, la revisión
   de los xlsx (sincronizarFuentes_, que el tablero pide en segundo plano) lo vuelve a leer
   cuando falta en la caché o le quedan menos de estos segundos; «Releer Excel», siempre. */
var SEGUNDOS_RENOVAR_CATALOGO_ = 600;

/**
 * Deja el catálogo en la caché si falta, está por caducar o se pide con forzar.
 * @param {boolean} forzar
 * @returns {void}
 */
function calentarCatalogo_(forzar) {
  const guardado = leerDeCache_(claveCache_("catalogo", config_().carpetaId));
  const leidoEn = guardado && guardado.leidoEn ? Date.parse(guardado.leidoEn) : 0;
  if (forzar || !leidoEn || Date.now() - leidoEn > (SEGUNDOS_CACHE_CATALOGO_ - SEGUNDOS_RENOVAR_CATALOGO_) * 1000)
    leerCatalogoDocentes_(true);
}

/**
 * Columnas opcionales que amplían el catálogo: «TC OTRA UNIVERSIDAD» (Sí/No), «CARGO»
 * (texto; si tiene algo, el docente tiene cargo administrativo) y «NO LECTIVAS» (horas).
 * @param {boolean} forzar Lee el archivo aunque haya copia en caché.
 * @returns {Catalogo}
 */
function leerCatalogoDocentes_(forzar) {
  const cfg = config_();
  const clave = claveCache_("catalogo", cfg.carpetaId);
  if (!forzar) {
    const guardado = leerDeCache_(clave);
    if (guardado && Array.isArray(guardado.docentes)) return guardado;
  }
  const res = { docentes: [], avisos: [], columnas: {} };
  const carpeta = abrirCarpeta_(cfg.carpetaId);
  if (!carpeta) { res.avisos.push(Dominio.aviso("CATALOGO_SIN_CARPETA", "No se pudo abrir la carpeta de Drive del sistema.")); return res; }
  const fuentes = localizarXlsx_(carpeta, []);
  if (!fuentes.docentes) {
    res.avisos.push(Dominio.aviso("CATALOGO_FALTA", "La carpeta no tiene el archivo CargaDeDocentes (.xlsx): no hay catálogo de docentes. Puedes escribir los nombres a mano."));
    return res;
  }
  try {
    const libro = leerLibroXlsx_(descomprimirXlsx_(fuentes.docentes.getBlob()));
    const hoja = libro.filter(function (h) { return /general/i.test(h.nombre); })[0] || libro[0];
    const filas = hoja && hoja.filas ? hoja.filas : [];
    let cab = -1;
    for (let i = 0; i < Math.min(10, filas.length) && cab < 0; i++) {
      const f = (filas[i] || []).map(Dominio.normalizar);
      if (f.some(function (c) { return c.indexOf("NOMBRE") >= 0; }) && f.some(function (c) { return c.indexOf("PAT") >= 0 || c === "DNI"; })) cab = i;
    }
    if (cab < 0) { res.avisos.push(Dominio.aviso("CATALOGO_SIN_CABECERAS", "No se reconocen las cabeceras de CargaDeDocentes.")); return res; }
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
    });
    res.columnas = { tcOtra: col.tcOtra !== undefined, cargo: col.cargo !== undefined, noLectivas: col.noLect !== undefined };
    const v = function (f, k) { return col[k] !== undefined && f[col[k]] != null ? String(f[col[k]]).trim() : ""; };
    const si = function (t) { const n = Dominio.normalizar(t); return /^(SI|S|X|1|TRUE|VERDADERO|TC)$/.test(n) || n.indexOf("SI ") === 0; };
    for (let r = cab + 1; r < filas.length; r++) {
      const f = filas[r] || [];
      const pat = v(f, "pat"), mat = v(f, "mat"), nom = v(f, "nom");
      if (!pat && !nom) continue;
      const dptoTexto = v(f, "dpto");
      const dedic = Dominio.normalizar(v(f, "dedic"));
      res.docentes.push({
        dni: v(f, "dni"),
        nombreCompleto: (pat + " " + mat).trim() + (nom ? ", " + nom : ""),
        condicion: v(f, "cond"), categoria: v(f, "cat"),
        dpto: Dominio.normalizarDpto(dptoTexto) || dptoTexto,
        dedicacion: dedic.indexOf("TC") >= 0 || dedic.indexOf("COMPLETO") >= 0 ? "TC" : (dedic ? "TP" : ""),
        tcOtra: col.tcOtra !== undefined && si(v(f, "tcOtra")),
        cargo: col.cargo !== undefined ? v(f, "cargo") : "",
        noLectivas: col.noLect !== undefined ? Dominio.num(v(f, "noLect")) : null
      });
    }
    res.leidoEn = new Date().toISOString();
    guardarEnCache_(clave, res, SEGUNDOS_CACHE_CATALOGO_);
  } catch (e) {
    res.avisos.push(Dominio.aviso("CATALOGO_ILEGIBLE", "No se pudo leer CargaDeDocentes: " + e.message));
  }
  return res;
}
