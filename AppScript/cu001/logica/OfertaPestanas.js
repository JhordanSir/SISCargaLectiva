// @ts-check
/* Oferta de las carreras a partir de las pestañas «Oferta - …» (una por carrera) y, si las
   hay, «Carga - …» de la hoja del sistema, ya leídas con base/FuenteHoja.js. Funciones
   puras: no tocan la hoja. */

/**
 * pestanasCarrera: una por carrera. pestanasDepartamento (opcional) aportan la CONDICIÓN de
 * cada código: si la asignatura no trae OBSERVACIONES y la condición habla de INTERNACIONAL,
 * VIRTUAL o FUSIÓN, esa condición pasa a ser su observación.
 * @param {PestanaFuente[]} pestanasCarrera
 * @param {PestanaFuente[]|null} pestanasDepartamento
 * @returns {{oferta: Object<string, Asignatura[]>, avisos: Aviso[]}}
 */
function ofertaDesdePestanas_(pestanasCarrera, pestanasDepartamento) {
  /** @type {Object<string, Asignatura[]>} */
  const oferta = {};
  const avisos = [];

  pestanasCarrera.forEach(function (p) {
    const nombre = nombrePestana_("carrera", p.nombre);
    const sig = Dominio.siglaDeCarrera(p.nombre) || siglaMayoritaria_(p.filas);
    if (!sig) {
      if (p.filas.some(function (f) { return f.some(function (c) { return c !== ""; }); }))
        avisos.push(Dominio.aviso("HOJA_DESCONOCIDA", "La pestaña «" + nombre + "» no corresponde a ninguna carrera conocida y no se leyó.", { hoja: nombre }));
      return;
    }
    if (oferta[sig]) {
      avisos.push(Dominio.aviso("HOJA_REPETIDA", "La pestaña «" + nombre + "» repite la carrera " + sig + "; se usó la primera pestaña.", { hoja: nombre, carrera: sig }));
      return;
    }
    const r = Dominio.interpretar(p.filas, { carrera: sig, sinDuplicados: true });
    oferta[sig] = r.asignaturas;
    r.duplicadas.forEach(function (d) {
      avisos.push(Dominio.aviso("FILA_REPETIDA", "Pestaña «" + nombre + "»: la fila de «" + d.nombre + "» (código " + d.codigo + ", grupo " + d.grupo +
        ") repite un código y grupo que ya aparecen antes en la pestaña, así que no se leyó. Corrige el código en la hoja.",
        { hoja: nombre, carrera: sig, codigo: d.codigo, grupo: d.grupo }));
    });
  });

  const marcas = pestanasDepartamento ? marcasDeCondicion_(pestanasDepartamento) : {};
  Object.keys(oferta).forEach(function (sig) {
    oferta[sig].forEach(function (a) {
      if (!a.obs && marcas[a.codigo]) a.obs = marcas[a.codigo];
    });
  });

  return { oferta: oferta, avisos: avisos };
}

/**
 * Carrera que más aparece en las celdas de una pestaña sin nombre de carrera.
 * @param {string[][]} filas
 * @returns {Sigla|null}
 */
function siglaMayoritaria_(filas) {
  const cuenta = {};
  filas.forEach(function (f) {
    f.forEach(function (c) {
      const s = c ? Dominio.siglaDeCarrera(c) : null;
      if (s) cuenta[s] = (cuenta[s] || 0) + 1;
    });
  });
  const orden = Object.keys(cuenta).sort(function (a, b) { return cuenta[b] - cuenta[a]; });
  return orden[0] || null;
}

/**
 * CONDICIÓN de cada código en las pestañas «Carga - …» cuando habla de INTERNACIONAL,
 * VIRTUAL o FUSIÓN.
 * @param {PestanaFuente[]} pestanas
 * @returns {Object<string, string>}
 */
function marcasDeCondicion_(pestanas) {
  /** @type {Object<string, string>} */
  const marcas = {};
  pestanas.forEach(function (p) {
    let jCodigo = -1, jCondicion = -1, filaCab = -1;
    for (let i = 0; i < Math.min(p.filas.length, 15) && filaCab < 0; i++) {
      const cab = p.filas[i].map(Dominio.canonica);
      if (cab.indexOf("CODIGO") >= 0 && cab.indexOf("CONDICION") >= 0) {
        filaCab = i; jCodigo = cab.indexOf("CODIGO"); jCondicion = cab.indexOf("CONDICION");
      }
    }
    if (filaCab < 0) return;
    p.filas.slice(filaCab + 1).forEach(function (f) {
      const codigo = (f[jCodigo] || "").trim(), condicion = (f[jCondicion] || "").trim();
      if (codigo && condicion && !marcas[codigo] && /INTERNACIONAL|VIRTUAL|FUSION/.test(Dominio.normalizar(condicion)))
        marcas[codigo] = condicion;
    });
  });
  return marcas;
}
