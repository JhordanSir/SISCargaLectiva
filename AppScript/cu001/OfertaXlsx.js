// @ts-check
/* Oferta de las carreras a partir de los dos libros .xlsx de Drive (CargaXCarrera y,
   opcional, CargaXDepartamento), ya leídos con LectorXlsx.js. Funciones puras: no tocan
   Drive ni la hoja del sistema. */

/**
 * libroCarrera: una hoja por carrera. libroDepartamento (opcional) aporta la
 * CONDICIÓN de cada código: si la asignatura no trae OBSERVACIONES y la condición
 * habla de INTERNACIONAL, VIRTUAL o FUSIÓN, esa condición pasa a ser su observación.
 * @param {HojaXlsx[]} libroCarrera
 * @param {HojaXlsx[]|null} libroDepartamento
 * @returns {{oferta: Object<string, Asignatura[]>, avisos: Aviso[]}}
 */
function ofertaDesdeLibros_(libroCarrera, libroDepartamento) {
  /** @type {Object<string, Asignatura[]>} */
  const oferta = {};
  const avisos = [];

  libroCarrera.forEach(function (hoja) {
    const sig = Dominio.siglaDeCarrera(hoja.nombre) || siglaMayoritaria_(hoja.filas);
    if (!sig) {
      if (hoja.filas.some(function (f) { return f.some(function (c) { return c !== ""; }); }))
        avisos.push(Dominio.aviso("HOJA_DESCONOCIDA", "La hoja «" + hoja.nombre + "» no corresponde a ninguna carrera conocida y no se leyó.", { hoja: hoja.nombre }));
      return;
    }
    if (oferta[sig]) {
      avisos.push(Dominio.aviso("HOJA_REPETIDA", "La hoja «" + hoja.nombre + "» repite la carrera " + sig + "; se usó la primera hoja.", { hoja: hoja.nombre, carrera: sig }));
      return;
    }
    const r = Dominio.interpretar(hoja.filas, { carrera: sig, sinDuplicados: true });
    oferta[sig] = r.asignaturas;
    r.duplicadas.forEach(function (d) {
      avisos.push(Dominio.aviso("FILA_REPETIDA", "Hoja «" + hoja.nombre + "»: la fila de «" + d.nombre + "» (código " + d.codigo + ", grupo " + d.grupo +
        ") repite un código y grupo que ya aparecen antes en la hoja, así que no se leyó. Corrige el código en el Excel.",
        { hoja: hoja.nombre, carrera: sig, codigo: d.codigo, grupo: d.grupo }));
    });
  });

  const marcas = libroDepartamento ? marcasDeCondicion_(libroDepartamento) : {};
  Object.keys(oferta).forEach(function (sig) {
    oferta[sig].forEach(function (a) {
      if (!a.obs && marcas[a.codigo]) a.obs = marcas[a.codigo];
    });
  });

  return { oferta: oferta, avisos: avisos };
}

/**
 * Carrera que más aparece en las celdas de una hoja sin nombre de carrera.
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
 * CONDICIÓN de cada código en CargaXDepartamento cuando habla de INTERNACIONAL, VIRTUAL o FUSIÓN.
 * @param {HojaXlsx[]} libro
 * @returns {Object<string, string>}
 */
function marcasDeCondicion_(libro) {
  /** @type {Object<string, string>} */
  const marcas = {};
  libro.forEach(function (hoja) {
    let jCodigo = -1, jCondicion = -1, filaCab = -1;
    for (let i = 0; i < Math.min(hoja.filas.length, 15) && filaCab < 0; i++) {
      const cab = hoja.filas[i].map(Dominio.canonica);
      if (cab.indexOf("CODIGO") >= 0 && cab.indexOf("CONDICION") >= 0) {
        filaCab = i; jCodigo = cab.indexOf("CODIGO"); jCondicion = cab.indexOf("CONDICION");
      }
    }
    if (filaCab < 0) return;
    hoja.filas.slice(filaCab + 1).forEach(function (f) {
      const codigo = (f[jCodigo] || "").trim(), condicion = (f[jCondicion] || "").trim();
      if (codigo && condicion && !marcas[codigo] && /INTERNACIONAL|VIRTUAL|FUSION/.test(Dominio.normalizar(condicion)))
        marcas[codigo] = condicion;
    });
  });
  return marcas;
}
