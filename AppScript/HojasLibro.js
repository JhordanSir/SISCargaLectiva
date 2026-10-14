/* Lectura y escritura de las hojas de cada ciclo en el libro (RF-080, RF-086 a RF-089,
   RF-097, RF-098). La conversión entre el plan y las filas está en HojaCarrera.js; aquí
   solo se habla con Sheets.
   Cada ciclo tiene, en este orden y con el mismo color de pestaña: las 8 hojas de carrera,
   General y las 4 hojas CARGA {DPTO}. Se insertan antes de las hojas del sistema. */

var COLORES_CICLO_ = ["#1155cc", "#38761d", "#b45f06", "#741b47", "#0b5394", "#990000"];

/* Las hojas por departamento, en el orden de CargaXDepartamento. */
var ORDEN_DPTOS_HOJAS_ = ["DAHUC", "DACJ", "DIMA", "DACTE"];

function colorDeCiclo_(ciclo) {
  const i = Math.max(0, config_().ciclos.indexOf(ciclo));
  return COLORES_CICLO_[i % COLORES_CICLO_.length];
}

function nombresHojasCiclo_(ciclo) {
  return Dominio.CARRERAS.map(function (c) { return nombreHojaCarrera(c.sig, ciclo); })
    .concat([nombreHojaGeneral(ciclo)])
    .concat(ORDEN_DPTOS_HOJAS_.map(function (d) { return nombreHojaDepartamento(d, ciclo); }));
}

function asegurarHoja_(nombre, ciclo) {
  const l = libro_();
  let h = l.getSheetByName(nombre);
  if (h) return h;
  const sistema = l.getSheets().filter(function (x) { return /^_SYS_/.test(x.getName()); })[0];
  h = sistema ? l.insertSheet(nombre, sistema.getIndex() - 1) : l.insertSheet(nombre);
  h.setTabColor(colorDeCiclo_(ciclo));
  return h;
}

function asegurarHojasCiclo_(ciclo) {
  nombresHojasCiclo_(ciclo).forEach(function (n) { asegurarHoja_(n, ciclo); });
}

function asegurarTamano_(h, filas, cols) {
  if (h.getMaxRows() < filas) h.insertRowsAfter(h.getMaxRows(), filas - h.getMaxRows());
  if (h.getMaxColumns() < cols) h.insertColumnsAfter(h.getMaxColumns(), cols - h.getMaxColumns());
}

/* Borra lo escrito desde «desde» hasta la última fila con datos. */
function vaciarDesde_(h, desde, ancho) {
  const ultima = h.getLastRow();
  if (ultima >= desde) h.getRange(desde, 1, ultima - desde + 1, Math.max(ancho, h.getLastColumn())).clear();
}

/* ============================================================
   Hojas de carrera
   ============================================================ */

function hojaCarrera_(ciclo, sig) {
  return libro_().getSheetByName(nombreHojaCarrera(sig, ciclo));
}

/* Escribe el plan de una carrera en su hoja. planes: los del ciclo, para nombrar en
   SECCIÓN el principal de una sección que une carreras. SEMESTRE, CODIGO y las columnas de
   texto van con formato de texto; HT, HP y TH, con números. */
function escribirHojaCarrera_(ciclo, sig, asignaturas, planes) {
  const h = asegurarHoja_(nombreHojaCarrera(sig, ciclo), ciclo);
  const ancho = COLUMNAS_HOJA_.length;
  const filas = filasDeCarrera(sig, asignaturas, planes);
  asegurarTamano_(h, PRIMERA_FILA_ + filas.length + 50, ancho);

  const titulo = COLUMNAS_HOJA_.map(function () { return ""; });
  titulo[col_("ASIGNATURA")] = tituloHojaCarrera(ciclo);
  h.getRange(FILA_TITULO_, 1, 1, ancho).setNumberFormat("@").setValues([titulo]).setFontWeight("bold");
  h.getRange(FILA_CABECERAS_, 1, 1, ancho).setNumberFormat("@").setValues([COLUMNAS_HOJA_]).setFontWeight("bold");

  vaciarDesde_(h, PRIMERA_FILA_, ancho);
  if (filas.length) {
    h.getRange(PRIMERA_FILA_, 1, filas.length, col_("HT")).setNumberFormat("@");
    h.getRange(PRIMERA_FILA_, col_("DOCENTE") + 1, filas.length, ancho - col_("DOCENTE")).setNumberFormat("@");
    const r = h.getRange(PRIMERA_FILA_, 1, filas.length, ancho);
    r.setValues(filas.map(function (f) { return f.valores; }));
    r.setNotes(filas.map(function (f) {
      return COLUMNAS_HOJA_.map(function (c, j) { return j === col_("DOCENTE") ? f.nota : ""; });
    }));
    r.setBackgrounds(filas.map(function (f) {
      return COLUMNAS_HOJA_.map(function (c, j) {
        return j === col_("DOCENTE") ? f.colorDocente : j === col_("SECCIÓN") ? f.colorSeccion : null;
      });
    }));
  }
  h.setFrozenRows(FILA_CABECERAS_);
  if (!h.isColumnHiddenByUser(col_("SIS") + 1)) h.hideColumns(col_("SIS") + 1);
  return filas.length;
}

/* Plan de una carrera leído de su hoja (HojaCarrera.planDeFilas); null si la hoja no existe. */
function leerHojaCarrera_(ciclo, sig) {
  const h = hojaCarrera_(ciclo, sig);
  if (!h) return null;
  const ultima = h.getLastRow();
  if (ultima < PRIMERA_FILA_) return planDeFilas(sig, []);
  return planDeFilas(sig, h.getRange(PRIMERA_FILA_, 1, ultima - PRIMERA_FILA_ + 1, COLUMNAS_HOJA_.length).getDisplayValues());
}

/* Los planes del ciclo tal como están en sus hojas, con lo aceptado de lo editado a mano. */
function leerPlanesCiclo_(ciclo) {
  const planes = {}, lecturas = {};
  Dominio.CARRERAS.forEach(function (c) {
    const l = leerHojaCarrera_(ciclo, c.sig);
    lecturas[c.sig] = l;
    planes[c.sig] = l ? l.asignaturas : [];
  });
  return { planes: planes, lecturas: lecturas };
}

/* ============================================================
   General y hojas por departamento (solo lectura)
   ============================================================ */

function escribirGeneral_(ciclo, catalogo, planes) {
  const h = asegurarHoja_(nombreHojaGeneral(ciclo), ciclo);
  const g = filasDeGeneral(catalogo, dominioCarga_().horasGeneral(planes, catalogo));
  const ancho = COLUMNAS_GENERAL_.length;
  const filas = [COLUMNAS_GENERAL_].concat(g.filas, [g.total]);
  asegurarTamano_(h, filas.length + 20, ancho);
  vaciarDesde_(h, 1, ancho);
  h.getRange(1, 1, filas.length, COLUMNAS_GENERAL_.indexOf("DEDIC.") + 1).setNumberFormat("@");
  h.getRange(1, COLUMNAS_GENERAL_.indexOf("TC_OTRA_UNIV") + 1, filas.length, 3).setNumberFormat("@");
  h.getRange(1, 1, filas.length, ancho).setValues(filas);
  h.getRange(1, 1, 1, ancho).setFontWeight("bold");
  h.setFrozenRows(1);
  const id = COLUMNAS_GENERAL_.indexOf("ID") + 1;
  if (!h.isColumnHiddenByUser(id)) h.hideColumns(id);
}

/* Catálogo de docentes del ciclo: la hoja General (P126). */
function leerGeneral_(ciclo) {
  const h = libro_().getSheetByName(nombreHojaGeneral(ciclo));
  if (!h || h.getLastRow() < 1) return [];
  return dominioCarga_().leerGeneral(h.getRange(1, 1, h.getLastRow(), COLUMNAS_GENERAL_.length).getDisplayValues());
}

function escribirHojasDepartamento_(ciclo, planes, catalogo) {
  const C = dominioCarga_();
  const ancho = COLUMNAS_DEPARTAMENTO_.length;
  ORDEN_DPTOS_HOJAS_.forEach(function (d) {
    const h = asegurarHoja_(nombreHojaDepartamento(d, ciclo), ciclo);
    const filas = [COLUMNAS_DEPARTAMENTO_].concat(filasDeDepartamento(C.consolidadoDepartamento(planes, catalogo, d)));
    asegurarTamano_(h, filas.length + 20, ancho);
    vaciarDesde_(h, 1, ancho);
    h.getRange(1, 1, filas.length, COLUMNAS_DEPARTAMENTO_.indexOf("CURSO") + 1).setNumberFormat("@");
    h.getRange(1, COLUMNAS_DEPARTAMENTO_.indexOf("CONDICIÓN") + 1, filas.length, 1).setNumberFormat("@");
    h.getRange(1, 1, filas.length, ancho).setValues(filas);
    h.getRange(1, 1, 1, ancho).setFontWeight("bold");
    h.setFrozenRows(1);
  });
}

/* General y las hojas por departamento a partir de los planes del ciclo. */
function actualizarReportes_(ciclo, planes, catalogo) {
  escribirGeneral_(ciclo, catalogo, planes);
  escribirHojasDepartamento_(ciclo, planes, catalogo);
}

/* ============================================================
   Protecciones (P112, P114)
   ============================================================ */

/* Si Sheets no deja añadir una cuenta a la protección (por ejemplo, porque todavía no tiene
   acceso al libro), se añaden las demás y esa cuenta queda en «fallidos» para avisar. */
function protegerPara_(objetivo, descripcion, editores, fallidos) {
  const p = protegerSoloSistema_(objetivo, descripcion);
  if (!editores.length) return p;
  try {
    p.addEditors(editores);
  } catch (e) {
    editores.forEach(function (c) {
      try { p.addEditor(c); } catch (e2) { if (fallidos && fallidos.indexOf(c) < 0) fallidos.push(c); }
    });
  }
  return p;
}

/* Rehace las protecciones del ciclo actual después de añadir o quitar cuentas en
   _SYS_USUARIOS. Solo la cuenta propietaria, desde el editor del proyecto. */
function protegerHojasCicloActual() {
  exigirPropietario_();
  const c = config_().cicloActual;
  const avisos = conCandado_(function () { return protegerHojasCiclo_(c); });
  const texto = ["Protecciones del ciclo " + c + " rehechas desde _SYS_USUARIOS."].concat(avisos).join("\n");
  Logger.log(texto);
  return texto;
}

/* Cada hoja de carrera la escriben sus Coordinadores y los Directores; DOCENTE, solo los
   Directores; el título, las cabeceras y las columnas del sistema, nadie más que la cuenta
   propietaria. General y las hojas por departamento son de solo lectura. Se rehacen desde
   _SYS_USUARIOS cada vez. Devuelve los avisos de las cuentas que no se pudieron añadir. */
function protegerHojasCiclo_(ciclo) {
  const fallidos = [];
  const usuarios = leerTabla_("_SYS_USUARIOS");
  const correos = function (pred) {
    return usuarios.filter(pred).map(function (u) { return u.correo.trim().toLowerCase(); }).filter(Boolean);
  };
  const directores = correos(function (u) { return rolNormalizado_(u.rol) === "director"; });
  Dominio.CARRERAS.forEach(function (c) {
    const h = hojaCarrera_(ciclo, c.sig);
    if (!h) return;
    quitarProtecciones_(h);
    const coordinadores = correos(function (u) {
      return rolNormalizado_(u.rol) === "coordinador" && carrerasDeTexto_(u.carreras).indexOf(c.sig) >= 0;
    });
    protegerPara_(h, "hoja de " + c.sig, directores.concat(coordinadores), fallidos);
    protegerPara_(h.getRange(1, 1, FILA_CABECERAS_, COLUMNAS_HOJA_.length), "título y cabeceras", []);
    protegerPara_(h.getRange(1, col_("DOCENTE") + 1, h.getMaxRows(), 1), "DOCENTE: solo Directores (P114)", directores, fallidos);
    protegerPara_(h.getRange(1, col_("SUBGRUPO") + 1, h.getMaxRows(), COLUMNAS_SISTEMA_.length), "columnas del sistema", []);
  });
  [nombreHojaGeneral(ciclo)].concat(ORDEN_DPTOS_HOJAS_.map(function (d) { return nombreHojaDepartamento(d, ciclo); }))
    .forEach(function (n) {
      const h = libro_().getSheetByName(n);
      if (!h) return;
      quitarProtecciones_(h);
      protegerPara_(h, "solo lectura", []);
    });
  return fallidos.length
    ? ["No se pudo dar permiso de edición a " + fallidos.join(", ") + ": comparte el libro con esas cuentas como editoras y vuelve a ejecutar protegerHojasCicloActual()."]
    : [];
}
