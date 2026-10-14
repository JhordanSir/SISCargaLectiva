/* Lectura y escritura de las hojas de cada ciclo en el libro (RF-080, RF-086 a RF-089,
   RF-097, RF-098). La conversión entre el plan y las filas está en HojaCarrera.js; aquí
   solo se habla con Sheets.
   Cada ciclo tiene, en este orden y con el mismo color de pestaña: las 8 hojas de carrera,
   General y las 4 hojas CARGA {DPTO}. Se insertan antes de las hojas del sistema.
   Una hoja de carrera se escribe entera al guardar, sincronizar, restaurar o sembrar. Lo
   que alguien edita a mano (Edicion.js) se procesa escribiendo solo las celdas que
   cambian, sin mover filas, para no pisar lo que esa persona sigue escribiendo. */

var COLORES_CICLO_ = ["#1155cc", "#38761d", "#b45f06", "#741b47", "#0b5394", "#990000"];

/* Las hojas por departamento, en el orden de CargaXDepartamento. */
var ORDEN_DPTOS_HOJAS_ = ["DAHUC", "DACJ", "DIMA", "DACTE"];

var SEGUNDOS_CACHE_HOJA_ = 21600;

function colorDeCiclo_(ciclo) {
  const i = Math.max(0, config_().ciclos.indexOf(ciclo));
  return COLORES_CICLO_[i % COLORES_CICLO_.length];
}

function nombresHojasCiclo_(ciclo) {
  return Dominio.CARRERAS.map(function (c) { return nombreHojaCarrera(c.sig, ciclo); })
    .concat([nombreHojaGeneral(ciclo)])
    .concat(ORDEN_DPTOS_HOJAS_.map(function (d) { return nombreHojaDepartamento(d, ciclo); }));
}

/* Ciclo y carrera de una hoja de carrera por su nombre; null si no es una. */
function hojaDeCarrera_(nombre) {
  const cfg = config_();
  for (let i = 0; i < cfg.ciclos.length; i++) {
    for (let j = 0; j < Dominio.CARRERAS.length; j++) {
      const sig = Dominio.CARRERAS[j].sig;
      if (nombreHojaCarrera(sig, cfg.ciclos[i]) === nombre) return { ciclo: cfg.ciclos[i], sig: sig };
    }
  }
  return null;
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

/* Texto en las columnas de CARRERA a ASIGNATURA y de DOCENTE a SIS, también en las filas
   vacías: así un «1-2» escrito a mano en SEMESTRE no se convierte en una fecha. */
function formatoTexto_(h, desde, filas) {
  if (filas < 1) return;
  h.getRange(desde, 1, filas, col_("HT")).setNumberFormat("@");
  h.getRange(desde, col_("DOCENTE") + 1, filas, COLUMNAS_HOJA_.length - col_("DOCENTE")).setNumberFormat("@");
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
  formatoTexto_(h, PRIMERA_FILA_, h.getMaxRows() - PRIMERA_FILA_ + 1);
  if (filas.length) escribirFilasCompletas_(h, PRIMERA_FILA_, filas);
  h.setFrozenRows(FILA_CABECERAS_);
  if (!h.isColumnHiddenByUser(col_("SIS") + 1)) h.hideColumns(col_("SIS") + 1);
  guardarIdsHoja_(ciclo, sig, filas);
  return filas.length;
}

/* Filas enteras (valores, notas y colores) a partir de «desde». */
function escribirFilasCompletas_(h, desde, filas) {
  const r = h.getRange(desde, 1, filas.length, COLUMNAS_HOJA_.length);
  r.setValues(filas.map(function (f) { return f.valores; }));
  r.setNotes(filas.map(function (f) {
    return COLUMNAS_HOJA_.map(function (c, j) {
      return j === col_("DOCENTE") ? f.nota : j === col_("OBSERVACIONES") ? f.notaObs : "";
    });
  }));
  r.setBackgrounds(filas.map(function (f) {
    return COLUMNAS_HOJA_.map(function (c, j) {
      return j === col_("DOCENTE") ? f.colorDocente : j === col_("SECCIÓN") ? f.colorSeccion : null;
    });
  }));
}

/* Columnas que, si difieren de lo leído, se escriben celda a celda: las que edita una
   persona. TH y las del sistema se escriben por tramos de filas. */
var COLUMNAS_SISTEMA_ESCRITURA_ = ["TH", "SUBGRUPO", "SECCIÓN", "SIS"];

/* Escribe en la hoja de la carrera solo lo que cambió respecto de lo que se leyó
   (lectura.crudas): las celdas que el sistema corrige (SEMESTRE y GRUPO de un «1-2», el
   DOCENTE que no se aceptó, las horas de una fusión, los datos de la asignatura en sus
   otras filas), TH, las columnas del sistema, las notas y los colores. No mueve filas.
   opciones.blanquear: filas vaciadas a mano cuyo grupo o subgrupo se eliminó, a las que se
   quitan TH y las columnas del sistema. Un grupo que no tiene fila (se restauró después de
   que se eliminara su fila entera) se añade al final; con opciones.soloAnexar, solo se
   hace eso. Devuelve cuántas celdas cambió. */
function escribirCambiosHoja_(ciclo, sig, asignaturas, planes, lectura, opciones) {
  const h = hojaCarrera_(ciclo, sig);
  if (!h) return 0;
  const ancho = COLUMNAS_HOJA_.length;
  const crudas = lectura.crudas || [];
  const deseadas = filasDeCarrera(sig, asignaturas, planes);
  const porGrupo = {};
  deseadas.forEach(function (d) { (porGrupo[d.id] = porGrupo[d.id] || []).push(d); });

  const objetivo = crudas.map(function () { return null; });
  const ubicadas = [];
  Object.keys(lectura.ubicaciones || {}).forEach(function (id) {
    const lista = porGrupo[id] || [];
    lectura.ubicaciones[id].forEach(function (u, k) {
      const d = lista.filter(function (x) { return x.sub === u.sub && ubicadas.indexOf(x) < 0; })[0] ||
                lista.filter(function (x) { return ubicadas.indexOf(x) < 0; })[0];
      if (!d || k >= lista.length) return;
      objetivo[u.fila - PRIMERA_FILA_] = d;
      ubicadas.push(d);
    });
  });
  const blanquear = (opciones && opciones.blanquear) || [];
  const anexar = deseadas.filter(function (d) { return ubicadas.indexOf(d) < 0; });
  if (opciones && opciones.soloAnexar) return anexarFilas_(ciclo, sig, h, crudas.length, anexar, deseadas);

  let celdas = 0;
  const usuario = [], sistemaFilas = [];
  const jSistema = COLUMNAS_SISTEMA_ESCRITURA_.map(col_);
  objetivo.forEach(function (d, i) {
    const fila = PRIMERA_FILA_ + i, leida = crudas[i];
    if (!d) {
      if (blanquear.indexOf(fila) >= 0 && jSistema.some(function (j) { return String(leida[j]) !== ""; })) sistemaFilas.push(i);
      return;
    }
    COLUMNAS_FIRMA_.forEach(function (c) {
      const j = col_(c);
      if (String(d.valores[j] == null ? "" : d.valores[j]).trim() !== String(leida[j] == null ? "" : leida[j]).trim())
        usuario.push({ fila: fila, j: j, valor: d.valores[j] });
    });
    if (jSistema.some(function (j) { return String(d.valores[j] == null ? "" : d.valores[j]) !== String(leida[j] == null ? "" : leida[j]); }))
      sistemaFilas.push(i);
  });

  /* Las celdas que edita una persona, una a una y con formato de texto donde corresponde. */
  usuario.forEach(function (u) {
    const c = h.getRange(u.fila, u.j + 1);
    if (u.j !== col_("HT") && u.j !== col_("HP")) c.setNumberFormat("@");
    c.setValue(u.valor);
    celdas++;
  });

  /* TH y las columnas del sistema, por tramos de filas consecutivas. */
  tramos_(sistemaFilas).forEach(function (t) {
    const valores = [];
    for (let i = t.desde; i <= t.hasta; i++) {
      const d = objetivo[i];
      valores.push(jSistema.map(function (j) { return d ? d.valores[j] : ""; }));
    }
    h.getRange(PRIMERA_FILA_ + t.desde, col_("TH") + 1, valores.length, 1).setValues(valores.map(function (v) { return [v[0]]; }));
    h.getRange(PRIMERA_FILA_ + t.desde, col_("SUBGRUPO") + 1, valores.length, 3).setNumberFormat("@")
      .setValues(valores.map(function (v) { return v.slice(1); }));
    celdas += valores.length * jSistema.length;
  });

  /* Notas y colores de DOCENTE y de SECCIÓN, y las notas del sistema en OBSERVACIONES. */
  if (crudas.length) {
    const n = crudas.length;
    const docente = h.getRange(PRIMERA_FILA_, col_("DOCENTE") + 1, n, 1);
    const notas = docente.getNotes(), fondos = docente.getBackgrounds();
    const seccion = h.getRange(PRIMERA_FILA_, col_("SECCIÓN") + 1, n, 1), fondosSeccion = seccion.getBackgrounds();
    const obs = h.getRange(PRIMERA_FILA_, col_("OBSERVACIONES") + 1, n, 1), notasObs = obs.getNotes();
    const color = function (c) { return c ? String(c).toLowerCase() : "#ffffff"; };
    const blanca = function (i) { return blanquear.indexOf(PRIMERA_FILA_ + i) >= 0; };
    const nuevasNotas = objetivo.map(function (d, i) { return [d ? d.nota || "" : (blanca(i) ? "" : notas[i][0])]; });
    const nuevosFondos = objetivo.map(function (d, i) { return [d ? d.colorDocente : (blanca(i) ? null : fondos[i][0])]; });
    const nuevosFondosSeccion = objetivo.map(function (d, i) { return [d ? d.colorSeccion : (blanca(i) ? null : fondosSeccion[i][0])]; });
    const nuevasNotasObs = objetivo.map(function (d, i) {
      const actual = notasObs[i][0] || "";
      const propia = !actual || actual.indexOf(NOTA_SISTEMA_) === 0;
      return [propia ? (d ? d.notaObs || "" : "") : actual];
    });
    const distintas = function (a, b, f) { return a.some(function (x, i) { return f(x[0]) !== f(b[i][0]); }); };
    const texto = function (x) { return String(x || ""); };
    if (distintas(nuevasNotas, notas, texto)) { docente.setNotes(nuevasNotas); celdas++; }
    if (distintas(nuevosFondos, fondos, color)) { docente.setBackgrounds(nuevosFondos); celdas++; }
    if (distintas(nuevosFondosSeccion, fondosSeccion, color)) { seccion.setBackgrounds(nuevosFondosSeccion); celdas++; }
    if (distintas(nuevasNotasObs, notasObs, texto)) { obs.setNotes(nuevasNotasObs); celdas++; }
  }

  return celdas + anexarFilas_(ciclo, sig, h, crudas.length, anexar, deseadas);
}

/* Añade «anexar» después de las «leidas» filas de datos y recuerda los grupos de la hoja. */
function anexarFilas_(ciclo, sig, h, leidas, anexar, deseadas) {
  let celdas = 0;
  if (anexar.length) {
    const desde = PRIMERA_FILA_ + leidas;
    asegurarTamano_(h, desde + anexar.length + 50, COLUMNAS_HOJA_.length);
    formatoTexto_(h, desde, anexar.length);
    escribirFilasCompletas_(h, desde, anexar);
    celdas = anexar.length * COLUMNAS_HOJA_.length;
  }
  guardarIdsHoja_(ciclo, sig, deseadas);
  return celdas;
}

/* Índices consecutivos agrupados en tramos { desde, hasta }. */
function tramos_(indices) {
  const res = [];
  indices.slice().sort(function (a, b) { return a - b; }).forEach(function (i) {
    const t = res[res.length - 1];
    if (t && i === t.hasta + 1) t.hasta = i;
    else res.push({ desde: i, hasta: i });
  });
  return res;
}

/* Los grupos que tenía la hoja la última vez que el sistema la escribió: sirven para saber
   qué grupos se fueron al eliminar filas enteras (P140). */
function guardarIdsHoja_(ciclo, sig, filas) {
  const ids = [];
  filas.forEach(function (f) { if (ids.indexOf(f.id) < 0) ids.push(f.id); });
  guardarEnCache_(claveCache_("ids", ciclo + "|" + sig), ids, SEGUNDOS_CACHE_HOJA_);
}

function leerIdsHoja_(ciclo, sig) {
  return leerDeCache_(claveCache_("ids", ciclo + "|" + sig));
}

/* Plan de una carrera leído de su hoja (HojaCarrera.planDeFilas), con las filas tal como
   se leyeron en «crudas»; null si la hoja no existe. */
function leerHojaCarrera_(ciclo, sig) {
  const h = hojaCarrera_(ciclo, sig);
  if (!h) return null;
  const ultima = h.getLastRow();
  let crudas = [];
  if (ultima >= PRIMERA_FILA_) {
    crudas = h.getRange(PRIMERA_FILA_, 1, ultima - PRIMERA_FILA_ + 1, COLUMNAS_HOJA_.length).getDisplayValues();
    corregirFechasSemestre_(h, crudas);
  }
  const l = planDeFilas(sig, crudas);
  l.crudas = crudas;
  return l;
}

/* Si Sheets convirtió un «1-2» de SEMESTRE en una fecha (por ejemplo, al pegar desde
   Excel), se reconstruye desde el día y el mes según la configuración regional del libro. */
function corregirFechasSemestre_(h, crudas) {
  const j = col_("SEMESTRE");
  const pareceFecha = function (t) {
    return /^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}$/.test(t) || (/[A-Za-zÁÉÍÓÚáéíóú]{3}/.test(t) && /\d/.test(t));
  };
  if (!crudas.some(function (f) { return pareceFecha(String(f[j]).trim()); })) return;
  const valores = h.getRange(PRIMERA_FILA_, j + 1, crudas.length, 1).getValues();
  const region = String(libro_().getSpreadsheetLocale ? libro_().getSpreadsheetLocale() : "");
  const mesPrimero = /^en_(US|PH|CA)/.test(region);
  valores.forEach(function (v, i) {
    const d = v[0];
    if (Object.prototype.toString.call(d) !== "[object Date]" || isNaN(d.getTime())) return;
    crudas[i][j] = mesPrimero ? (d.getMonth() + 1) + "-" + d.getDate() : d.getDate() + "-" + (d.getMonth() + 1);
  });
}

/* Los planes del ciclo tal como están en sus hojas. «leidas»: lecturas ya hechas que se
   reutilizan ({ SIGLA: lectura }). */
function leerPlanesCiclo_(ciclo, leidas) {
  const planes = {}, lecturas = {};
  Dominio.CARRERAS.forEach(function (c) {
    const l = leidas && leidas[c.sig] ? leidas[c.sig] : leerHojaCarrera_(ciclo, c.sig);
    lecturas[c.sig] = l;
    planes[c.sig] = l ? l.asignaturas : [];
  });
  return { planes: planes, lecturas: lecturas };
}

/* ============================================================
   General y hojas por departamento (solo lectura)
   ============================================================ */

function filasReportes_(planes, catalogo) {
  const C = dominioCarga_();
  const dptos = {};
  ORDEN_DPTOS_HOJAS_.forEach(function (d) { dptos[d] = filasDeDepartamento(C.consolidadoDepartamento(planes, catalogo, d)); });
  return { general: filasDeGeneral(catalogo, C.horasGeneral(planes, catalogo)), dptos: dptos };
}

function escribirGeneral_(ciclo, g) {
  const h = asegurarHoja_(nombreHojaGeneral(ciclo), ciclo);
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

function escribirHojasDepartamento_(ciclo, dptos) {
  const ancho = COLUMNAS_DEPARTAMENTO_.length;
  ORDEN_DPTOS_HOJAS_.forEach(function (d) {
    const h = asegurarHoja_(nombreHojaDepartamento(d, ciclo), ciclo);
    const filas = [COLUMNAS_DEPARTAMENTO_].concat(dptos[d]);
    asegurarTamano_(h, filas.length + 20, ancho);
    vaciarDesde_(h, 1, ancho);
    h.getRange(1, 1, filas.length, COLUMNAS_DEPARTAMENTO_.indexOf("CURSO") + 1).setNumberFormat("@");
    h.getRange(1, COLUMNAS_DEPARTAMENTO_.indexOf("CONDICIÓN") + 1, filas.length, 1).setNumberFormat("@");
    h.getRange(1, 1, filas.length, ancho).setValues(filas);
    h.getRange(1, 1, 1, ancho).setFontWeight("bold");
    h.setFrozenRows(1);
  });
}

/* General y las hojas por departamento a partir de los planes del ciclo. Con
   opciones.siCambian, no se escriben si su contenido es el de la última vez (la firma se
   guarda en la caché): una edición que no cambia horas ni docentes no reescribe 5 hojas.
   Devuelve si se escribieron. */
function actualizarReportes_(ciclo, planes, catalogo, opciones) {
  const r = filasReportes_(planes, catalogo);
  const firma = Dominio.hash(JSON.stringify(r));
  const clave = claveCache_("reportes", ciclo);
  if (opciones && opciones.siCambian && cache_().get(clave) === firma) return false;
  escribirGeneral_(ciclo, r.general);
  escribirHojasDepartamento_(ciclo, r.dptos);
  try { cache_().put(clave, firma, SEGUNDOS_CACHE_HOJA_); } catch (e) { /* se reescribirán la próxima vez */ }
  return true;
}

/* ============================================================
   Protecciones (P112, P114, P138)
   ============================================================ */

/* Si Sheets no deja añadir una cuenta (por ejemplo, porque todavía no tiene acceso al
   libro), se añaden las demás y esa cuenta queda en «fallidos» para avisar. */
function agregarEditores_(p, editores, fallidos) {
  if (!editores.length) return;
  try {
    p.addEditors(editores);
  } catch (e) {
    editores.forEach(function (c) {
      try { p.addEditor(c); } catch (e2) { if (fallidos && fallidos.indexOf(c) < 0) fallidos.push(c); }
    });
  }
}

function protegerPara_(objetivo, descripcion, editores, fallidos) {
  const p = protegerSoloSistema_(objetivo, descripcion);
  agregarEditores_(p, editores, fallidos);
  return p;
}

/* Quienes escriben la hoja de una carrera sin bloqueo: los Directores y sus Coordinadores. */
function editoresDeCarrera_(usuarios, sig) {
  const correos = function (pred) {
    return usuarios.filter(pred).map(function (u) { return u.correo.trim().toLowerCase(); }).filter(Boolean);
  };
  return correos(function (u) { return rolNormalizado_(u.rol) === "director"; })
    .concat(correos(function (u) {
      return rolNormalizado_(u.rol) === "coordinador" && carrerasDeTexto_(u.carreras).indexOf(sig) >= 0;
    }));
}

function descripcionHoja_(sig) {
  return "hoja de " + sig;
}

function proteccionDeHoja_(h, sig) {
  const descripcion = MARCA_PROTECCION_ + ": " + descripcionHoja_(sig);
  return h.getProtections(SpreadsheetApp.ProtectionType.SHEET).filter(function (p) {
    return String(p.getDescription()) === descripcion;
  })[0] || null;
}

/* Con bloqueo, la hoja de la carrera la escribe solo quien lo tiene; sin él, sus
   Coordinadores y los Directores. DOCENTE y las columnas del sistema conservan sus propias
   protecciones. Devuelve las cuentas que no se pudieron añadir. */
function protegerSegunBloqueo_(ciclo, sig, correo) {
  const h = hojaCarrera_(ciclo, sig);
  if (!h) return [];
  const p = proteccionDeHoja_(h, sig);
  if (!p) return [];
  const fallidos = [];
  p.removeEditors(p.getEditors());
  agregarEditores_(p, correo ? [correo] : editoresDeCarrera_(leerTabla_("_SYS_USUARIOS"), sig), fallidos);
  return fallidos;
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

/* Cada hoja de carrera la escriben sus Coordinadores y los Directores, o solo quien tiene
   su bloqueo; DOCENTE, solo los Directores; el título, las cabeceras y las columnas del
   sistema, nadie más que la cuenta propietaria. General y las hojas por departamento son
   de solo lectura. Se rehacen desde _SYS_USUARIOS cada vez. Devuelve los avisos de las
   cuentas que no se pudieron añadir. */
function protegerHojasCiclo_(ciclo) {
  const fallidos = [];
  const usuarios = leerTabla_("_SYS_USUARIOS");
  const directores = usuarios.filter(function (u) { return rolNormalizado_(u.rol) === "director"; })
    .map(function (u) { return u.correo.trim().toLowerCase(); }).filter(Boolean);
  const planes = leerPlanes_();
  Dominio.CARRERAS.forEach(function (c) {
    const h = hojaCarrera_(ciclo, c.sig);
    if (!h) return;
    quitarProtecciones_(h);
    const b = bloqueoDeFila_(buscarPlan_(planes, ciclo, c.sig));
    const editores = vigente_(b) ? [b.correo] : editoresDeCarrera_(usuarios, c.sig);
    protegerPara_(h, descripcionHoja_(c.sig), editores, fallidos);
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
