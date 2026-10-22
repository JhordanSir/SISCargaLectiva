// @ts-nocheck
/* ============================================================
   SISCargaLectiva · Centro de datos
   Reúne en una hoja de Google los tres Excel de la carpeta de la app y la pestaña
   Usuarios de la BD. Se editan aquí con las advertencias de la app a la vista.
   «Enviar cambios a la app» crea un .xlsx nuevo por cada archivo modificado (el anterior
   pasa a la subcarpeta «Anteriores») y copia Usuarios en la BD.
   El nombre de esta hoja no contiene «Docentes», «CargaXCarrera» ni «CargaXDepartamento»:
   la app no la confunde con sus Excel.
   ============================================================ */
var CENTRO = {
  NOMBRE: "SISCargaLectiva - Centro de datos",
  BD_ID: "11T-Y5P0bUk4d9Fm6fB1a4Do9cLmhM0mcK_Kw-kmCEJo",
  CARPETA_ID: "1oPNySoaa5KMnVTtLcHS-lmxMrecHOMlK",
  DOMINIO: "ulasalle.edu.pe",
  CONFIG_REGIONAL: "es_MX",
  ANTERIORES: "Anteriores",
  INICIO: "Inicio",
  CLAVE_META: "scl:meta",
  CLAVE_AVISOS: "scl:avisos:centro",
  GRUPOS: [
    { id: "usuarios", prefijo: "BD - ", etiqueta: "Usuarios", fuente: "SISCargaLectiva-BD, pestaña Usuarios", color: "#5F6B7A" },
    { id: "carrera", prefijo: "Oferta - ", etiqueta: "Oferta por carrera", fuente: "CargaXCarrera", color: "#1F3A5F" },
    { id: "departamento", prefijo: "Carga - ", etiqueta: "Carga por departamento", fuente: "CargaXDepartamento", color: "#00695C" },
    { id: "docentes", prefijo: "Docentes - ", etiqueta: "Catálogo de docentes", fuente: "CargaDeDocentes", color: "#7B1F3A" }
  ],
  /* Nombres de la primera versión, que Instalar renombra. */
  ANTERIOR: {
    inicio: "\u26A1 Inicio", meta: "hakai:meta",
    prefijos: { "\u{1F465} ": "usuarios", "\u{1F393} ": "carrera", "\u2694\uFE0F ": "departamento", "\u2694 ": "departamento", "\u{1F4DC} ": "docentes" }
  }
};
var ARCHIVOS_ = ["carrera", "departamento", "docentes"];
var TODOS_ = ["usuarios", "carrera", "departamento", "docentes"];

/* ============================================================
   Menú, disparadores y botones
   ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("SISCargaLectiva")
    .addItem("Panel de advertencias", "abrirPanel")
    .addSeparator()
    .addItem("Traer datos desde los archivos…", "abrirTraer")
    .addItem("Enviar cambios a la app…", "abrirEnviar")
    .addSeparator()
    .addItem("Actualizar la revisión", "actualizarRevision")
    .addItem("Instalar o reparar", "instalar")
    .addToUi();
}

/* Disparador simple: recalcula las advertencias del grupo editado, repinta lo que cambió
   y destaca la fila si aparece o se corrige una advertencia. */
function onEdit(e) {
  if (!e || !e.range) return;
  var hoja = e.range.getSheet();
  var g = grupoDeHoja_(hoja.getName());
  if (!g) return;
  var libro = hoja.getParent();
  var antes = leerAvisos_(CENTRO.CLAVE_AVISOS);
  var r = revisarCentro_(libro, g.id === "usuarios" ? ["usuarios"] : ARCHIVOS_, antes, false, hoja.getName());
  var filas = [];
  for (var f = e.range.getRow(); f <= e.range.getLastRow() && filas.length < 5; f++) filas.push(f);
  reaccionarEdicion_(libro, hoja, filas, antes, r.avisos);
  try { actualizarTablero_(libro, r, leerMeta_()); } catch (err) { /* el tablero se repara con Instalar */ }
}

function abrirPanel() { abrirPanel_("Centro de datos: Excel de la app y Usuarios", "centro"); }
function abrirTraer() { abrirDialogo_("traer"); }
function abrirEnviar() { abrirDialogo_("enviar"); }
function botonTraer() { abrirTraer(); }
function botonEnviar() { abrirEnviar(); }
function botonPanel() { abrirPanel(); }

function abrirDialogo_(modo) {
  var t = HtmlService.createTemplateFromFile("Dialogo");
  t.modo = modo;
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(680).setHeight(600),
    modo === "traer" ? "Traer datos desde los archivos" : "Enviar cambios a la app");
}

/* El panel pide las advertencias cada pocos segundos: salen de la caché que deja cada
   edición; si no hay, se calculan. */
function datosDelPanel() {
  var avisos = leerAvisos_(CENTRO.CLAVE_AVISOS);
  if (!avisos) avisos = revisarCentro_(SpreadsheetApp.getActiveSpreadsheet(), TODOS_, null, false).avisos;
  return datosPanel_(avisos, "Centro de datos");
}

function actualizarRevision() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var r = revisarCentro_(libro, TODOS_, null, true);
  actualizarTablero_(libro, r, leerMeta_());
  libro.toast(r.avisos.length ? r.avisos.length + " advertencias en total." : "Los datos no tienen advertencias.", "Revisión actualizada", 4);
}

/* ============================================================
   Grupos de pestañas
   ============================================================ */
function grupo_(id) { return CENTRO.GRUPOS.filter(function (g) { return g.id === id; })[0]; }

function grupoDeHoja_(nombre) {
  return CENTRO.GRUPOS.filter(function (g) { return String(nombre).indexOf(g.prefijo) === 0; })[0] || null;
}

function hojasDeGrupo_(libro, id) {
  var g = grupo_(id);
  return libro.getSheets().filter(function (h) { return h.getName().indexOf(g.prefijo) === 0; }).map(function (h) {
    return { hoja: h, nombre: h.getName(), original: h.getName().slice(g.prefijo.length), valores: valoresHoja_(h) };
  });
}

function filaCabecera_(id, item) {
  var c = null;
  if (id === "carrera") c = Reglas.leerOferta(item.valores, item.original).cab;
  else if (id === "departamento") c = Reglas.leerCarga(item.valores).cab;
  else if (id === "docentes") c = Reglas.leerCatalogo(item.valores).cab;
  return c ? c.fila + 1 : 1;
}

function catalogoDe_(docentes) {
  var general = docentes.filter(function (d) { return /GENERAL/i.test(d.original); })[0] || docentes[0];
  return general || null;
}

/* Calcula las advertencias de los grupos pedidos (los otros salen de «previos»), pinta
   las hojas que cambiaron y deja todo en la caché del panel.
   Con «editada» (desde onEdit) solo se relee esa pestaña: las demás salen de la caché de
   valores que deja cada lectura, porque solo cambian cuando se las edita. */
function revisarCentro_(libro, ids, previos, forzar, editada) {
  var pedir = {};
  (previos ? ids : TODOS_).forEach(function (id) { pedir[id] = true; });
  if (pedir.carrera || pedir.departamento || pedir.docentes) ARCHIVOS_.forEach(function (id) { pedir[id] = true; });
  var calculados = TODOS_.filter(function (id) { return pedir[id]; });
  var cache = CacheService.getDocumentCache();
  var hojas = libro.getSheets().map(function (h) { return { hoja: h, nombre: h.getName() }; });
  var delGrupo = {};
  calculados.forEach(function (id) {
    var g = grupo_(id);
    delGrupo[id] = hojas.filter(function (x) { return x.nombre.indexOf(g.prefijo) === 0; });
  });
  var nombres = [].concat.apply([], calculados.map(function (id) { return delGrupo[id].map(function (x) { return x.nombre; }); }));
  var usarValores = !!editada && !forzar;
  var guardado = cache.getAll(nombres.map(claveFirma_).concat(usarValores ? nombres.map(claveValores_) : []));
  var leidos = {};
  var datos = {};
  calculados.forEach(function (id) {
    var g = grupo_(id);
    datos[id] = delGrupo[id].map(function (x) {
      var k = claveValores_(x.nombre), valores = null;
      if (usarValores && x.nombre !== editada && guardado[k]) { try { valores = JSON.parse(guardado[k]); } catch (e) { valores = null; } }
      if (!valores) { valores = valoresHoja_(x.hoja); leidos[k] = JSON.stringify(valores); }
      return { hoja: x.hoja, nombre: x.nombre, original: x.nombre.slice(g.prefijo.length), valores: valores };
    });
  });

  var avisos = [];
  if (datos.usuarios) datos.usuarios.forEach(function (u) { avisos = avisos.concat(Reglas.revisarUsuarios(u, CENTRO.DOMINIO)); });
  if (datos.carrera) {
    var general = catalogoDe_(datos.docentes);
    avisos = avisos.concat(Reglas.revisarOferta(datos.carrera));
    if (general) avisos = avisos.concat(Reglas.revisarDocentes(general));
    avisos = avisos.concat(Reglas.revisarCarga(datos.departamento, {
      oferta: Reglas.indiceOferta(datos.carrera),
      catalogo: general ? Reglas.leerCatalogo(general.valores).docentes : []
    }));
  }
  (previos || []).forEach(function (a) {
    var g = grupoDeHoja_(a.hoja);
    if (g && calculados.indexOf(g.id) < 0) avisos.push(a);
  });

  var porHoja = {};
  avisos.forEach(function (a) { (porHoja[a.hoja] = porHoja[a.hoja] || []).push(a); });
  var hashes = {}, pestanas = {}, nuevas = {};
  calculados.forEach(function (id) {
    datos[id].forEach(function (item) {
      var firma = pintarRevision_(item.hoja, porHoja[item.nombre] || [], filaCabecera_(id, item), forzar, guardado);
      if (firma) nuevas[claveFirma_(item.nombre)] = firma;
    });
    hashes[id] = hashGrupo_(id, datos[id]);
    pestanas[id] = datos[id].length;
  });
  guardarEnCache_(cache, nuevas);
  guardarEnCache_(cache, leidos);
  guardarAvisos_(CENTRO.CLAVE_AVISOS, avisos);
  return { avisos: avisos, hashes: hashes, pestanas: pestanas, cuentas: cuentasPorGrupo_(avisos) };
}

function claveValores_(nombreHoja) { return "scl:val:" + nombreHoja; }

/* Cada valor de la caché admite 100 KB: lo que no cabe se vuelve a leer la próxima vez. */
function guardarEnCache_(cache, pares) {
  var juntos = {};
  Object.keys(pares).forEach(function (k) { if (pares[k].length < 95000) juntos[k] = pares[k]; });
  if (!Object.keys(juntos).length) return;
  try { cache.putAll(juntos, 21600); } catch (e) {
    Object.keys(juntos).forEach(function (k) { try { cache.put(k, juntos[k], 21600); } catch (err) { /* se relee */ } });
  }
}

function cuentasPorGrupo_(avisos) {
  var c = {};
  TODOS_.forEach(function (id) { c[id] = { error: 0, advertencia: 0, observacion: 0 }; });
  avisos.forEach(function (a) { var g = grupoDeHoja_(a.hoja); if (g) c[g.id][a.nivel]++; });
  return c;
}

/* ============================================================
   Huellas para saber qué cambió
   ============================================================ */
function huella_(objeto) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(objeto), Utilities.Charset.UTF_8));
}

/* Usuarios se compara por filas con datos y recortadas, igual en el Centro y en la BD. */
function filasUsuarios_(valores) {
  var ancho = Math.max(4, (valores[0] || []).length);
  return valores.slice(1).map(function (f) {
    var fila = [];
    for (var j = 0; j < ancho; j++) fila.push(String(f[j] == null ? "" : f[j]).trim());
    return fila;
  }).filter(function (f) { return f.some(function (c) { return c !== ""; }); });
}

function hashGrupo_(id, items) {
  if (id === "usuarios") return items.length ? huella_(filasUsuarios_(items[0].valores)) : "";
  return huella_(items.map(function (i) { return [i.original, i.valores]; }));
}

/* ============================================================
   Metadatos (propiedades del documento)
   ============================================================ */
function leerMeta_() {
  var props = PropertiesService.getDocumentProperties();
  var t = props.getProperty(CENTRO.CLAVE_META) || props.getProperty(CENTRO.ANTERIOR.meta);
  var m = null;
  try { m = t ? JSON.parse(t) : null; } catch (e) { m = null; }
  m = m || {};
  m.grupos = m.grupos || {};
  return m;
}

function guardarMeta_(meta) {
  PropertiesService.getDocumentProperties().setProperty(CENTRO.CLAVE_META, JSON.stringify(meta));
}

function ahoraIso_() { return Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd'T'HH:mm:ss") + "-05:00"; }
function isoDe_(fecha) { return Utilities.formatDate(fecha, "America/Lima", "yyyy-MM-dd'T'HH:mm:ss") + "-05:00"; }
function legible_(iso) {
  if (!iso) return "—";
  var t = Date.parse(iso);
  return isFinite(t) ? Utilities.formatDate(new Date(t), "America/Lima", "dd/MM/yyyy HH:mm") : String(iso);
}

/* ============================================================
   Archivos de la carpeta (igual que la app: solo los de arriba, por nombre)
   ============================================================ */
function tipoDeFuente_(nombre) {
  var n = Reglas.normalizar(nombre).replace(/[^A-Z]/g, "");
  if (n.indexOf("CARGAXCARRERA") >= 0) return "carrera";
  if (n.indexOf("CARGAXDEPARTAMENTO") >= 0) return "departamento";
  if (n.indexOf("CARGADEDOCENTES") >= 0 || n.indexOf("DOCENTES") >= 0) return "docentes";
  return null;
}

function archivosDelTipo_(carpeta, tipo) {
  var lista = [];
  var it = carpeta.getFiles();
  while (it.hasNext()) {
    var a = it.next();
    if (a.isTrashed() || tipoDeFuente_(a.getName()) !== tipo) continue;
    if (a.getMimeType() === MimeType.GOOGLE_SHEETS) continue;
    if (a.getMimeType() !== MimeType.MICROSOFT_EXCEL && !/\.xlsx$/i.test(a.getName())) continue;
    lista.push(a);
  }
  return lista.sort(function (x, y) { return y.getLastUpdated().getTime() - x.getLastUpdated().getTime(); });
}

function fuentes_() {
  var carpeta = DriveApp.getFolderById(CENTRO.CARPETA_ID);
  var res = { carpeta: carpeta };
  ARCHIVOS_.forEach(function (t) { res[t] = archivosDelTipo_(carpeta, t)[0] || null; });
  return res;
}

function carpetaAnteriores_(carpeta) {
  var it = carpeta.getFoldersByName(CENTRO.ANTERIORES);
  return it.hasNext() ? it.next() : carpeta.createFolder(CENTRO.ANTERIORES);
}

function hojaUsuariosBD_() {
  var h = SpreadsheetApp.openById(CENTRO.BD_ID).getSheetByName("Usuarios");
  if (!h) throw new Error("La BD no tiene la pestaña Usuarios.");
  return h;
}

/* ============================================================
   Copia de pestañas entre libros sin romper fórmulas
   ============================================================ */
/* Al copiar una pestaña a otro libro, Sheets cambia para siempre por #REF! las
   referencias a pestañas que no existen allí con ese nombre. Por eso cada copia toma
   primero el nombre que tenía en el origen, después se reescriben las fórmulas que
   apuntan a otras pestañas (ya existen todas) y al final se renombran: al renombrar,
   Sheets actualiza esas referencias. nombreFinal(nombreEnOrigen) da el nombre final. */
function copiarHojas_(hojas, destino, nombreFinal) {
  var copias = hojas.map(function (h) {
    var c = h.copyTo(destino);
    c.setName(nombreLibre_(destino, h.getName()));
    return { origen: h, copia: c };
  });
  copias.forEach(function (x) {
    var filas = x.origen.getLastRow(), cols = x.origen.getLastColumn();
    if (!filas || !cols) return;
    x.origen.getRange(1, 1, filas, cols).getFormulas().forEach(function (fila, i) {
      fila.forEach(function (f, j) { if (f && f.indexOf("!") >= 0) x.copia.getRange(i + 1, j + 1).setFormula(f); });
    });
  });
  copias.forEach(function (x) {
    var final = nombreFinal(x.origen.getName());
    if (x.copia.getName() !== final) x.copia.setName(nombreLibre_(destino, final));
    if (x.origen.isSheetHidden()) x.copia.hideSheet();
  });
  return copias;
}

function nombreLibre_(libro, base) {
  var nombre = base.slice(0, 95), n = 2;
  while (libro.getSheetByName(nombre)) nombre = base.slice(0, 90) + " (" + (n++) + ")";
  return nombre;
}

/* ============================================================
   Diálogo de Traer y Enviar
   ============================================================ */
function datosDialogo(modo) {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var meta = leerMeta_();
  var r = revisarCentro_(libro, TODOS_, null, false);
  var f = fuentes_();
  var bdUsuarios = null, errorBD = null;
  try { bdUsuarios = huella_(filasUsuarios_(valoresHoja_(hojaUsuariosBD_()))); } catch (e) { errorBD = e.message; }

  var grupos = CENTRO.GRUPOS.map(function (g) {
    var m = meta.grupos[g.id] || {};
    var archivo = g.id === "usuarios" ? null : f[g.id];
    var pestanas = r.pestanas[g.id] || 0;
    var editado = pestanas > 0 && (!m.hash || r.hashes[g.id] !== m.hash);
    var conflicto = null;
    if (g.id === "usuarios") {
      if (m.hashBD && bdUsuarios && bdUsuarios !== m.hashBD) conflicto = "La pestaña Usuarios de la BD cambió desde que se trajo al Centro.";
    } else if (archivo && m.archivoId && (archivo.getId() !== m.archivoId || isoDe_(archivo.getLastUpdated()) !== m.modificado)) {
      conflicto = "El archivo de la carpeta cambió desde que se trajo al Centro (" + legible_(isoDe_(archivo.getLastUpdated())) + ").";
    }
    var muestras = Reglas.ordenar(r.avisos.filter(function (a) { var x = grupoDeHoja_(a.hoja); return x && x.id === g.id; })).slice(0, 4)
      .map(function (a) { return { nivel: a.nivel, hoja: a.hoja.slice(g.prefijo.length), a1: columnaA1_(a.col) + a.fila, mensaje: a.mensaje }; });
    var disponible, motivo = "";
    if (modo === "traer") {
      disponible = g.id === "usuarios" ? !errorBD : !!archivo;
      if (!disponible) motivo = g.id === "usuarios" ? "No se pudo abrir la BD: " + errorBD : "La carpeta no tiene el archivo " + g.fuente + " (.xlsx).";
    } else {
      disponible = editado;
      if (!pestanas) motivo = "Todavía no se trajo al Centro.";
      else if (!editado) motivo = "Sin cambios desde que se trajo.";
      if (g.id === "usuarios" && errorBD) { disponible = false; motivo = "No se pudo abrir la BD: " + errorBD; }
    }
    return {
      id: g.id, etiqueta: g.etiqueta, fuente: g.fuente, color: g.color,
      archivo: archivo ? { nombre: archivo.getName(), modificado: legible_(isoDe_(archivo.getLastUpdated())), url: archivo.getUrl() } : null,
      pestanas: pestanas, traido: legible_(m.traido), enviado: legible_(m.enviado),
      editado: editado, conflicto: conflicto, cuentas: r.cuentas[g.id], muestras: muestras,
      disponible: disponible, motivo: motivo
    };
  });
  return {
    modo: modo, grupos: grupos,
    carpeta: { nombre: f.carpeta.getName(), url: f.carpeta.getUrl() },
    cuenta: Session.getActiveUser().getEmail()
  };
}

/* ============================================================
   Traer: los archivos de la carpeta y Usuarios de la BD pasan al Centro
   ============================================================ */
function traer(ids) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error("Otra persona está trayendo o enviando datos. Inténtalo en unos momentos.");
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var meta = leerMeta_();
    var f = fuentes_();
    meta.carpeta = f.carpeta.getName();
    var hechos = [];
    (ids || []).forEach(function (id) {
      try {
        if (id === "usuarios") hechos.push(traerUsuarios_(libro, meta));
        else if (!f[id]) hechos.push({ id: id, ok: false, texto: "La carpeta no tiene el archivo " + grupo_(id).fuente + "." });
        else hechos.push(traerArchivo_(libro, id, f[id], meta));
      } catch (e) {
        hechos.push({ id: id, ok: false, texto: e.message });
      }
    });
    ordenarPestanas_(libro);
    var r = revisarCentro_(libro, TODOS_, null, true);
    hechos.forEach(function (h) { if (h.ok) meta.grupos[h.id].hash = r.hashes[h.id]; });
    guardarMeta_(meta);
    actualizarTablero_(libro, r, meta);
    bitacora_(libro, "Traer datos", hechos.map(function (h) { return (h.ok ? "Correcto. " : "Error. ") + grupo_(h.id).etiqueta + ": " + h.texto; }).join("\n"));
    var inicio = libro.getSheetByName(CENTRO.INICIO);
    if (inicio) inicio.activate();
    return { hechos: hechos, cuentas: r.cuentas, total: r.avisos.length };
  } finally {
    lock.releaseLock();
  }
}

/* El .xlsx se convierte en una hoja temporal (en tu unidad, fuera de la carpeta de la
   app), sus pestañas se copian al Centro con el prefijo del grupo y la temporal va a la
   papelera. */
function traerArchivo_(libro, id, archivo, meta) {
  var g = grupo_(id);
  var tmp = Drive.Files.copy({ name: "Temporal SISCargaLectiva - " + archivo.getName(), mimeType: MimeType.GOOGLE_SHEETS }, archivo.getId(), { supportsAllDrives: true });
  try {
    var origen = SpreadsheetApp.openById(tmp.id);
    libro.getSheets().filter(function (h) { return h.getName().indexOf(g.prefijo) === 0; }).forEach(function (h) { libro.deleteSheet(h); });
    var copias = copiarHojas_(origen.getSheets(), libro, function (n) { return g.prefijo + n; });
    copias.forEach(function (x) { x.copia.setTabColor(g.color); });
    meta.grupos[id] = {
      archivoId: archivo.getId(), nombre: archivo.getName(), url: archivo.getUrl(),
      modificado: isoDe_(archivo.getLastUpdated()), traido: ahoraIso_(),
      enviado: (meta.grupos[id] || {}).enviado || null
    };
    var nombres = copias.map(function (x) { return x.origen.getName(); });
    return { id: id, ok: true, texto: "«" + archivo.getName() + "», " + nombres.length + " pestañas (" + nombres.join(", ") + ")." };
  } finally {
    DriveApp.getFileById(tmp.id).setTrashed(true);
  }
}

function traerUsuarios_(libro, meta) {
  var g = grupo_("usuarios");
  var valores = valoresHoja_(hojaUsuariosBD_());
  if (!valores.length) valores = [["correo", "rol", "carreras", "departamento"]];
  var nombre = g.prefijo + "Usuarios";
  var hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  hoja.clear();
  hoja.getRange(1, 1, Math.max(hoja.getMaxRows(), 200), Math.max(valores[0].length, 4)).setNumberFormat("@");
  hoja.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
  hoja.setFrozenRows(1);
  hoja.setTabColor(g.color);
  hoja.getRange(1, 1, 1, valores[0].length).setFontWeight("bold");
  hoja.setColumnWidth(1, 260); hoja.setColumnWidth(2, 120); hoja.setColumnWidth(3, 240); hoja.setColumnWidth(4, 140);
  var dv = SpreadsheetApp.newDataValidation().requireValueInList(["director", "coordinador"], true).setAllowInvalid(true)
    .setHelpText("director (asigna docentes de su departamento) o coordinador (edita el plan de sus carreras)").build();
  hoja.getRange(2, 2, hoja.getMaxRows() - 1, 1).setDataValidation(dv);
  meta.grupos.usuarios = { traido: ahoraIso_(), hashBD: huella_(filasUsuarios_(valores)), enviado: (meta.grupos.usuarios || {}).enviado || null };
  return { id: "usuarios", ok: true, texto: (valores.length - 1) + " cuentas desde la BD." };
}

function ordenarPestanas_(libro) {
  var orden = [CENTRO.INICIO];
  var hojas = libro.getSheets();
  CENTRO.GRUPOS.forEach(function (g) {
    hojas.forEach(function (h) { if (h.getName().indexOf(g.prefijo) === 0) orden.push(h.getName()); });
  });
  orden.forEach(function (nombre, i) {
    var h = libro.getSheetByName(nombre);
    if (!h) return;
    var oculta = h.isSheetHidden();
    if (oculta) h.showSheet();
    libro.setActiveSheet(h);
    libro.moveActiveSheet(i + 1);
    if (oculta) h.hideSheet();
  });
}

/* ============================================================
   Enviar: cada archivo modificado vuelve a la carpeta como un .xlsx nuevo
   ============================================================ */
function enviar(ids) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) throw new Error("Otra persona está trayendo o enviando datos. Inténtalo en unos momentos.");
  try {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    var meta = leerMeta_();
    var carpeta = DriveApp.getFolderById(CENTRO.CARPETA_ID);
    var hechos = [];
    (ids || []).forEach(function (id) {
      try {
        hechos.push(id === "usuarios" ? enviarUsuarios_(libro, meta) : enviarArchivo_(libro, id, carpeta, meta));
      } catch (e) {
        hechos.push({ id: id, ok: false, texto: e.message });
      }
    });
    var r = revisarCentro_(libro, TODOS_, null, false);
    hechos.forEach(function (h) { if (h.ok) meta.grupos[h.id].hash = r.hashes[h.id]; });
    if (hechos.some(function (h) { return h.ok; })) meta.ultimoEnvio = ahoraIso_();
    guardarMeta_(meta);
    actualizarTablero_(libro, r, meta);
    bitacora_(libro, "Enviar cambios", hechos.map(function (h) { return (h.ok ? "Correcto. " : "Error. ") + grupo_(h.id).etiqueta + ": " + h.texto; }).join("\n"));
    return { hechos: hechos };
  } finally {
    lock.releaseLock();
  }
}

function enviarArchivo_(libro, id, carpeta, meta) {
  var g = grupo_(id);
  var items = hojasDeGrupo_(libro, id);
  if (!items.length) throw new Error("No hay pestañas «" + g.prefijo + "…» que enviar.");
  var previo = meta.grupos[id] || {};
  var nombre = previo.nombre || ("SISCargaLectiva-" + g.fuente + ".xlsx");
  if (!/\.xlsx$/i.test(nombre)) nombre += ".xlsx";
  var tmp = SpreadsheetApp.create("Temporal SISCargaLectiva - " + nombre);
  var tmpId = tmp.getId();
  try {
    var vacia = tmp.getSheets()[0];
    vacia.setName("__vacia__");
    copiarHojas_(items.map(function (it) { return it.hoja; }), tmp, function (n) { return n.slice(g.prefijo.length); })
      .forEach(function (x) { quitarRevision_(x.copia); });
    tmp.deleteSheet(vacia);
    SpreadsheetApp.flush();
    var resp = UrlFetchApp.fetch("https://docs.google.com/spreadsheets/d/" + tmpId + "/export?format=xlsx", {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) throw new Error("Google no pudo exportar el .xlsx (HTTP " + resp.getResponseCode() + ").");
    var nuevo = carpeta.createFile(resp.getBlob().setName(nombre).setContentType(MimeType.MICROSOFT_EXCEL));

    /* El anterior de cada tipo pasa a «Anteriores» con la fecha en el nombre: la app solo
       mira los archivos de arriba y, si quedaran varios, usaría el más reciente. */
    var anteriores = carpetaAnteriores_(carpeta);
    var sello = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd HH.mm");
    var movidos = [], quedan = [];
    archivosDelTipo_(carpeta, id).forEach(function (a) {
      if (a.getId() === nuevo.getId()) return;
      try {
        a.moveTo(anteriores);
        try { a.setName(a.getName().replace(/\.xlsx$/i, "") + " (anterior " + sello + ").xlsx"); } catch (e) { /* sin permiso para renombrar */ }
        movidos.push(a.getName());
      } catch (e) {
        quedan.push(a.getName());
      }
    });
    meta.grupos[id] = {
      archivoId: nuevo.getId(), nombre: nombre, url: nuevo.getUrl(), modificado: isoDe_(nuevo.getLastUpdated()),
      traido: previo.traido || null, enviado: ahoraIso_()
    };
    var texto = "«" + nombre + "» creado en la carpeta.";
    if (movidos.length) texto += " El archivo anterior se movió a «" + CENTRO.ANTERIORES + "».";
    if (quedan.length) texto += " No se pudo mover «" + quedan.join("», «") + "» (solo su propietario puede hacerlo): la app usará el nuevo por ser el más reciente.";
    return { id: id, ok: true, texto: texto, url: nuevo.getUrl() };
  } finally {
    DriveApp.getFileById(tmpId).setTrashed(true);
  }
}

function enviarUsuarios_(libro, meta) {
  var item = hojasDeGrupo_(libro, "usuarios")[0];
  if (!item) throw new Error("No hay pestaña de Usuarios que enviar.");
  var bd = hojaUsuariosBD_();
  var ancho = Math.max(4, bd.getLastColumn());
  var filas = filasUsuarios_(item.valores).map(function (f) {
    var x = f.slice(0, ancho);
    while (x.length < ancho) x.push("");
    x[0] = x[0].toLowerCase();
    return x;
  });
  var ultima = bd.getLastRow();
  if (ultima > 1) bd.getRange(2, 1, ultima - 1, ancho).clearContent();
  if (filas.length) {
    var rango = bd.getRange(2, 1, filas.length, ancho);
    rango.setNumberFormat("@");
    rango.setValues(filas);
  }
  SpreadsheetApp.flush();
  meta.grupos.usuarios = meta.grupos.usuarios || {};
  meta.grupos.usuarios.enviado = ahoraIso_();
  meta.grupos.usuarios.hashBD = huella_(filasUsuarios_(valoresHoja_(bd)));
  return { id: "usuarios", ok: true, texto: filas.length + " cuentas copiadas en la BD. La app tarda hasta 5 minutos en aplicar los roles nuevos.", url: SpreadsheetApp.openById(CENTRO.BD_ID).getUrl() };
}

/* ============================================================
   Instalar: nombre, carpeta, zona horaria, pestañas y tablero
   ============================================================ */
function instalar() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  libro.setSpreadsheetTimeZone("America/Lima");
  /* Las fórmulas del formato condicional usan comas, como la BD (es_MX): con una
     configuración regional que separa con punto y coma no se aplicarían. */
  if (libro.getSpreadsheetLocale() !== CENTRO.CONFIG_REGIONAL) libro.setSpreadsheetLocale(CENTRO.CONFIG_REGIONAL);
  if (libro.getName() !== CENTRO.NOMBRE) libro.rename(CENTRO.NOMBRE);
  var archivo = DriveApp.getFileById(libro.getId());
  var carpeta = DriveApp.getFolderById(CENTRO.CARPETA_ID);
  var enCarpeta = false, padres = archivo.getParents();
  while (padres.hasNext()) if (padres.next().getId() === carpeta.getId()) enCarpeta = true;
  if (!enCarpeta) archivo.moveTo(carpeta);
  var meta = leerMeta_();
  meta.carpeta = carpeta.getName();
  guardarMeta_(meta);
  migrarNombres_(libro);
  construirInicio_(libro);
  libro.getSheets().forEach(function (h) {
    if (h.getName() !== CENTRO.INICIO && !grupoDeHoja_(h.getName()) && h.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(h);
  });
  ordenarPestanas_(libro);
  var r = revisarCentro_(libro, TODOS_, null, true);
  actualizarTablero_(libro, r, meta);
  libro.getSheetByName(CENTRO.INICIO).activate();
  libro.toast(r.pestanas.carrera ? "Las pestañas y el tablero están actualizados." : "Usa «Traer datos» para cargar los archivos de la carpeta.", "Centro de datos instalado", 6);
}

/* Renombra las pestañas de la primera versión (con íconos) a los prefijos actuales. */
function migrarNombres_(libro) {
  var vieja = libro.getSheetByName(CENTRO.ANTERIOR.inicio);
  if (vieja && !libro.getSheetByName(CENTRO.INICIO)) vieja.setName(CENTRO.INICIO);
  libro.getSheets().forEach(function (h) {
    var nombre = h.getName();
    Object.keys(CENTRO.ANTERIOR.prefijos).forEach(function (p) {
      if (nombre.indexOf(p) !== 0) return;
      var g = grupo_(CENTRO.ANTERIOR.prefijos[p]);
      h.setName(nombreLibre_(libro, g.prefijo + nombre.slice(p.length)));
      h.setTabColor(g.color);
    });
  });
}
