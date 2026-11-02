// @ts-check
/* Documentos con versiones. Lo usan los planes de ciclo (REPO_PLAN_, cu001/logica/PlanRepositorio.js)
   y las cargas docentes (REPO_CARGA_, cu002/logica/CargaRepositorio.js), una por carrera y ciclo.
   Cada repositorio tiene dos tablas:
     - el índice, con una fila por documento: su versión vigente y en qué fila de la
       tabla de versiones está (para leerla sin recorrerla);
     - las versiones, con una fila por guardado: sus datos y el contenido completo en JSON,
       repartido en celdas a partir de la columna «contenido».
   El contenido de una versión nunca cambia, así que se guarda también en la caché del
   script; la lista de versiones de cada documento, también.

   Crecimiento (auditoría P3.6-j; solo política, sin implementar): cada guardado, también
   cada autoguardado y cada fusión llevada a otro plan, añade una fila con el contenido
   completo (con la oferta de ejemplo, un plan ocupa de 2 a 16 KB de JSON). Leer la vigente no se encarece,
   porque el índice dice su fila, pero el historial y la búsqueda de una versión sin fila
   conocida leen la tabla entera. Política propuesta para cuando exista el CU «Administrar
   ciclos»: al cerrar un ciclo, pasar a un libro de archivo sus versiones y dejar en
   Versiones y VersionesCarga solo la vigente y la última «registrar» de cada documento. */

var SEGUNDOS_CACHE_VERSION_ = 21600;   // el máximo que admite CacheService
var MAX_TEXTO_CACHE_ = 45000;          // holgura frente al límite de 100 KB por valor

/**
 * Guarda el texto de una versión en la caché si cabe.
 * @param {string} clave
 * @param {string} texto
 * @returns {void}
 */
function cachearTexto_(clave, texto) {
  if (texto.length > MAX_TEXTO_CACHE_) return;
  try {
    cache_().put(clave, texto, SEGUNDOS_CACHE_VERSION_);
  } catch (e) {
    /* No cabe: se leerá de la hoja. */
  }
}

/* ---------- índice ---------- */

/**
 * Filas del índice del repositorio (todos los ciclos).
 * @param {Repo} repo
 * @returns {FilaTabla[]}
 */
function leerIndice_(repo) {
  return leerTabla_(repo.indice);
}

/**
 * Fila de un documento entre las filas del índice, o null.
 * @param {Repo} repo
 * @param {FilaTabla[]} filas
 * @param {string} ciclo
 * @param {string} clave
 * @returns {FilaTabla|null}
 */
function buscarEnIndice_(repo, filas, ciclo, clave) {
  return filas.filter(function (f) { return f.ciclo === ciclo && f[repo.clave] === clave; })[0] || null;
}

/**
 * Fila de un documento en el índice, o null.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @returns {FilaTabla|null}
 */
function filaIndice_(repo, ciclo, clave) {
  return buscarEnIndice_(repo, leerIndice_(repo), ciclo, clave);
}

/**
 * Versión vigente de un documento según su fila del índice (null = sin guardar).
 * @param {FilaTabla|null|undefined} fila
 * @returns {{version: number, filaVersion: number}}
 */
function vigente_(fila) {
  return {
    version: fila ? parseInt(fila.version, 10) || 0 : 0,
    filaVersion: fila ? parseInt(fila.fila_version, 10) || 0 : 0
  };
}

/* ---------- versiones ---------- */

/**
 * Índice (desde 0) de la columna «contenido» en la tabla de versiones.
 * @param {Repo} repo
 * @returns {number}
 */
function columnaContenido_(repo) {
  return TABLAS_[repo.versiones].indexOf("contenido");
}

/**
 * Clave de caché del contenido de una versión.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @param {number} n
 * @returns {string}
 */
function claveContenido_(repo, ciclo, clave, n) {
  return claveCache_(repo.cache, ciclo + "|" + clave + "|" + n);
}

/**
 * Clave de caché de la lista de versiones de un documento.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @returns {string}
 */
function claveMetas_(repo, ciclo, clave) {
  return claveCache_(repo.cache + "m", ciclo + "|" + clave);
}

/**
 * Datos de cada versión de un documento (sin el contenido), de la más antigua a la más
 * reciente. Cada una lleva _fila, su fila en la tabla de versiones. vigente (opcional):
 * la versión vigente según el índice; si la lista en caché no llega a ella, se relee.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @param {number=} vigente
 * @returns {Array<FilaTabla & {n: number}>}
 */
function metaVersiones_(repo, ciclo, clave, vigente) {
  const k = claveMetas_(repo, ciclo, clave);
  const guardadas = leerDeCache_(k);
  const ultima = guardadas && guardadas.length ? guardadas[guardadas.length - 1].n : 0;
  if (guardadas && (vigente == null || ultima === vigente)) return guardadas;
  const campos = TABLAS_[repo.versiones].slice(0, columnaContenido_(repo));
  const metas = leerTabla_(repo.versiones, campos.length)
    .filter(function (v) { return v.ciclo === ciclo && v[repo.clave] === clave; })
    .map(function (v) { return Object.assign({}, v, { n: parseInt(v.n, 10) }); })
    .sort(function (a, b) { return a.n - b.n; });
  guardarEnCache_(k, metas, SEGUNDOS_CACHE_VERSION_);
  return metas;
}

/**
 * ¿La fila leída es esa versión de ese documento?
 * @param {Repo} repo
 * @param {Array<*>} valores
 * @param {string} ciclo
 * @param {string} clave
 * @param {number} n
 * @returns {boolean}
 */
function esLaVersion_(repo, valores, ciclo, clave, n) {
  const campos = TABLAS_[repo.versiones];
  return String(valores[campos.indexOf("ciclo")]) === ciclo &&
         String(valores[campos.indexOf(repo.clave)]) === clave &&
         parseInt(valores[campos.indexOf("n")], 10) === n;
}

/**
 * Columnas que hay que leer de la tabla de versiones.
 * @param {Repo} repo
 * @param {GoogleAppsScript.Spreadsheet.Sheet} h
 * @returns {number}
 */
function anchoVersiones_(repo, h) {
  return Math.max(TABLAS_[repo.versiones].length, h.getLastColumn());
}

/**
 * Texto JSON de una versión. filaVersion evita recorrer la tabla; si no coincide (o no se
 * conoce), se busca la fila entre las versiones del documento.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @param {number} n
 * @param {number} filaVersion
 * @returns {string}
 */
function textoDeVersion_(repo, ciclo, clave, n, filaVersion) {
  const h = hojaBd_(repo.versiones);
  const ancho = anchoVersiones_(repo, h);
  if (filaVersion > 1 && filaVersion <= h.getLastRow()) {
    const valores = h.getRange(filaVersion, 1, 1, ancho).getValues()[0];
    if (esLaVersion_(repo, valores, ciclo, clave, n)) return unirDesde_(valores, columnaContenido_(repo));
  }
  /* Se busca su fila en la lista de versiones; si la lista en caché quedó vieja (la fila
     no es esa versión), se vuelve a leer de la hoja. */
  for (let intento = 0; intento < 2; intento++) {
    if (intento) cache_().remove(claveMetas_(repo, ciclo, clave));
    const v = metaVersiones_(repo, ciclo, clave).filter(function (x) { return x.n === n; })[0];
    if (!v) continue;
    const valores = h.getRange(v._fila, 1, 1, ancho).getValues()[0];
    if (esLaVersion_(repo, valores, ciclo, clave, n)) return unirDesde_(valores, columnaContenido_(repo));
  }
  fallo_("NO_ENCONTRADO", "No se encontró la versión v" + n + " " + repo.nombre + ".");
}

/**
 * Contenido de una versión: de la caché o de la hoja.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @param {number} n
 * @param {number=} filaVersion
 * @returns {*}
 */
function contenidoVersion_(repo, ciclo, clave, n, filaVersion) {
  const k = claveContenido_(repo, ciclo, clave, n);
  const guardado = cache_().get(k);
  if (guardado != null) return JSON.parse(guardado);
  const texto = textoDeVersion_(repo, ciclo, clave, n, filaVersion || 0);
  cachearTexto_(k, texto);
  return JSON.parse(texto || "[]");
}

/**
 * Contenido vigente de varios documentos de un ciclo ({clave: contenido}): primero de la
 * caché y, lo que falte, de la hoja, en un solo bloque si sus filas están cerca (como
 * tras leer las pestañas de oferta). filasIndice: filas del índice de ese ciclo.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {FilaTabla[]} filasIndice
 * @returns {Object<string, *>}
 */
function contenidosVigentes_(repo, ciclo, filasIndice) {
  /** @type {Object<string, *>} */
  const res = {};
  const conVersion = filasIndice.filter(function (f) { return vigente_(f).version > 0; });
  if (!conVersion.length) return res;

  const claves = conVersion.map(function (f) { return claveContenido_(repo, ciclo, f[repo.clave], vigente_(f).version); });
  const enCache = cache_().getAll(claves);
  const faltan = [];
  conVersion.forEach(function (f, i) {
    if (enCache[claves[i]] != null) res[f[repo.clave]] = JSON.parse(enCache[claves[i]]);
    else faltan.push(f);
  });
  if (!faltan.length) return res;

  const h = hojaBd_(repo.versiones);
  const ancho = anchoVersiones_(repo, h);
  const ultima = h.getLastRow();
  const filas = faltan.map(function (f) { return vigente_(f).filaVersion; }).filter(function (n) { return n > 1 && n <= ultima; });
  let bloque = null, desde = 0;
  if (filas.length) {
    desde = Math.min.apply(null, filas);
    const alto = Math.max.apply(null, filas) - desde + 1;
    if (alto <= Math.max(10, filas.length * 3)) bloque = h.getRange(desde, 1, alto, ancho).getValues();
  }
  faltan.forEach(function (f) {
    const clave = f[repo.clave], v = vigente_(f);
    const valores = bloque && v.filaVersion >= desde && v.filaVersion - desde < bloque.length ? bloque[v.filaVersion - desde] : null;
    const texto = valores && esLaVersion_(repo, valores, ciclo, clave, v.version)
      ? unirDesde_(valores, columnaContenido_(repo))
      : textoDeVersion_(repo, ciclo, clave, v.version, v.filaVersion);
    cachearTexto_(claveContenido_(repo, ciclo, clave, v.version), texto);
    res[clave] = JSON.parse(texto || "[]");
  });
  return res;
}

/**
 * Debe llamarse dentro de conCandado_. Añade una versión y actualiza (o crea) la fila del
 * documento en el índice. fila: su fila del índice, o null si es el primer guardado.
 * datos: {usuario, fecha, contenido, meta: {campos de la versión}, indice: {campos del índice}}.
 * Los campos que no se indiquen en el índice conservan su valor anterior. Devuelve el
 * número de la versión nueva.
 * @param {Repo} repo
 * @param {string} ciclo
 * @param {string} clave
 * @param {FilaTabla|null} fila
 * @param {{usuario: string, fecha: string, contenido: *, meta?: Object, indice?: Object}} datos
 * @returns {number}
 */
function registrarVersion_(repo, ciclo, clave, fila, datos) {
  const n = vigente_(fila).version + 1;
  const texto = JSON.stringify(datos.contenido);
  const comunes = { ciclo: ciclo, n: n, usuario: datos.usuario, fecha: datos.fecha };
  comunes[repo.clave] = clave;
  const meta = Object.assign({}, datos.meta || {}, comunes);
  const camposVersion = TABLAS_[repo.versiones].slice(0, columnaContenido_(repo));
  const filaVersion = agregarFila_(repo.versiones,
    camposVersion.map(function (c) { return meta[c] == null ? "" : meta[c]; }).concat(trocear_(texto)));

  const indice = Object.assign({}, fila || {}, datos.indice || {}, {
    ciclo: ciclo, version: n, actualizado_por: datos.usuario, actualizado_en: datos.fecha, fila_version: filaVersion
  });
  indice[repo.clave] = clave;
  const valores = TABLAS_[repo.indice].map(function (c) { return indice[c] == null ? "" : indice[c]; });
  if (fila) escribirFila_(repo.indice, fila._fila, valores);
  else agregarFila_(repo.indice, valores);

  cachearTexto_(claveContenido_(repo, ciclo, clave, n), texto);
  /* La lista de versiones en caché se completa con la nueva, si estaba. */
  const k = claveMetas_(repo, ciclo, clave);
  const metas = leerDeCache_(k);
  if (metas) {
    const nueva = { _fila: filaVersion };
    camposVersion.forEach(function (c) { nueva[c] = meta[c] == null ? "" : String(meta[c]); });
    nueva.n = n;
    guardarEnCache_(k, metas.concat([nueva]), SEGUNDOS_CACHE_VERSION_);
  }
  return n;
}
