/* Imitación, en memoria, de los servicios de Apps Script que usa el servidor.
   Es estricta donde Apps Script lo es (rangos fuera de la hoja, dimensiones de
   setValues) y avisa de lo que en Sheets saldría mal (texto sin formato «@»). */
import fs from "node:fs";
import path from "node:path";
import { descomprimir, cargar, plano, RAIZ } from "./soporte.mjs";

let secuencia = 0;
const nuevoId = prefijo => prefijo + (++secuencia).toString(36).padStart(6, "0");

class Rango {
  constructor(hoja, fila, col, filas, cols) {
    const fuera = fila < 1 || col < 1 || filas < 1 || cols < 1 ||
      fila + filas - 1 > hoja.maxFilas || col + cols - 1 > hoja.maxCols;
    if (fuera) throw new Error(`Las coordenadas del rango están fuera de la hoja «${hoja.nombre}» (${fila},${col},${filas},${cols}).`);
    Object.assign(this, { hoja, fila, col, filas, cols });
  }
  celdas(fn) {
    for (let i = 0; i < this.filas; i++) for (let j = 0; j < this.cols; j++) fn(this.fila + i, this.col + j, i, j);
  }
  /* Como Sheets: lo que se ejecuta con la cuenta de quien hace clic (menú, panel lateral)
     no puede escribir en celdas protegidas para esa cuenta (RNF-13). */
  comprobarEscritura() {
    const e = this.hoja.libro.entorno;
    if (e.efectivo === e.propietario) return;
    this.celdas((f, c) => {
      if (!this.hoja.permite(e.efectivo, f, c))
        throw new Error("Intentas modificar una celda o un objeto protegido: " + this.hoja.nombre + "!" + f + ":" + c + " (" + e.efectivo + ").");
    });
  }
  getValues() {
    const cuentas = this.hoja.libro.entorno.cuentas;
    cuentas.sheets++;
    cuentas.lecturas[this.hoja.nombre] = (cuentas.lecturas[this.hoja.nombre] || 0) + 1;
    const r = Array.from({ length: this.filas }, () => Array(this.cols).fill(""));
    this.celdas((f, c, i, j) => { const x = this.hoja.celda(f, c); r[i][j] = x ? x.v : ""; });
    return r;
  }
  getValue() { return this.getValues()[0][0]; }
  /* Como Sheets con el formato automático: los números sin «.0» y el texto tal cual. */
  getDisplayValues() {
    this.hoja.libro.entorno.cuentas.sheets++;
    return this.getValues().map(f => f.map(v => (v == null ? "" : String(v))));
  }
  setValues(valores) {
    if (valores.length !== this.filas || valores.some(f => f.length !== this.cols))
      throw new Error("El número de filas o columnas de los datos no coincide con el del rango.");
    this.comprobarEscritura();
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => this.hoja.escribir(f, c, valores[i][j]));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  matriz(valores, campo) {
    if (valores.length !== this.filas || valores.some(f => f.length !== this.cols))
      throw new Error("El número de filas o columnas de los datos no coincide con el del rango.");
    this.comprobarEscritura();
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => { this.hoja.celdaCreada(f, c)[campo] = valores[i][j]; });
    return this;
  }
  leer(campo, vacio) {
    const r = Array.from({ length: this.filas }, () => Array(this.cols).fill(vacio));
    this.celdas((f, c, i, j) => { const x = this.hoja.celda(f, c); if (x && x[campo] != null) r[i][j] = x[campo]; });
    return r;
  }
  setNumberFormat(formato) { this.comprobarEscritura(); this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fmt = formato; }); return this; }
  setNumberFormats(m) { return this.matriz(m, "fmt"); }
  getNumberFormats() { return this.leer("fmt", ""); }
  setNotes(m) { return this.matriz(m, "nota"); }
  setNote(t) { return this.setNotes([[t]]); }
  getNotes() { return this.leer("nota", ""); }
  setBackgrounds(m) { return this.matriz(m, "fondo"); }
  setBackground(color) { this.comprobarEscritura(); this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fondo = color; }); return this; }
  getBackgrounds() { return this.leer("fondo", "#ffffff"); }
  setFontWeight() { return this; }
  setFontColor() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  setWrap() { return this; }
  clearContent() { this.comprobarEscritura(); this.celdas((f, c) => { const x = this.hoja.celda(f, c); if (x) x.v = ""; }); return this; }
  clear() { this.comprobarEscritura(); this.celdas((f, c) => { this.hoja.datos.delete(this.hoja.clave(f, c)); }); return this; }
  /* La selección de quien tiene abierto el libro. */
  activate() { this.hoja.libro.entorno.seleccion = { hoja: this.hoja.nombre, fila: this.fila, col: this.col }; return this; }
  getRow() { return this.fila; }
  getColumn() { return this.col; }
  getNumRows() { return this.filas; }
  getNumColumns() { return this.cols; }
  getSheet() { return this.hoja; }
  /* ¿La celda (f, c) está dentro del rango? */
  contiene(f, c) { return f >= this.fila && f < this.fila + this.filas && c >= this.col && c < this.col + this.cols; }
  protect() { return this.hoja.nuevaProteccion("RANGE", this); }
}

/* Protección de una hoja o de un rango. Como en Sheets, la cuenta propietaria siempre es
   editora y no se puede quitar. */
class Proteccion {
  constructor(hoja, tipo, rango) {
    Object.assign(this, { hoja, tipo, rango, editores: new Set([hoja.libro.entorno.propietario]), dominio: true,
                          descripcion: "", soloAviso: false, quitada: false });
  }
  correo(x) { return String(typeof x === "string" ? x : x.getEmail()).toLowerCase(); }
  /* Como Sheets con una cuenta que todavía no tiene acceso al libro (entorno.sinAcceso). */
  addEditor(x) {
    const c = this.correo(x);
    if (this.hoja.libro.entorno.sinAcceso.has(c)) throw new Error("No se puede añadir " + c + ": no tiene acceso al documento.");
    this.editores.add(c); return this;
  }
  addEditors(l) {
    const sin = l.map(x => this.correo(x)).filter(c => this.hoja.libro.entorno.sinAcceso.has(c));
    if (sin.length) throw new Error("No se pueden añadir " + sin.join(", ") + ".");
    l.forEach(x => this.addEditor(x)); return this;
  }
  removeEditor(x) { const c = this.correo(x); if (c !== this.hoja.libro.entorno.propietario) this.editores.delete(c); return this; }
  removeEditors(l) { l.forEach(x => this.removeEditor(x)); return this; }
  getEditors() { return [...this.editores].map(c => ({ getEmail: () => c })); }
  setDomainEdit(b) { this.dominio = !!b; return this; }
  canDomainEdit() { return this.dominio; }
  setDescription(d) { this.descripcion = d; return this; }
  getDescription() { return this.descripcion; }
  setWarningOnly(b) { this.soloAviso = !!b; return this; }
  getProtectionType() { return this.tipo; }
  getRange() { return this.rango || this.hoja.getRange(1, 1, this.hoja.maxFilas, this.hoja.maxCols); }
  remove() { this.quitada = true; this.hoja.protecciones = this.hoja.protecciones.filter(p => p !== this); }
  /* ¿Puede «correo» escribir en la celda (f, c) según esta protección? */
  permite(correo, f, c) {
    if (this.tipo === "RANGE" && !this.rango.contiene(f, c)) return true;
    return this.soloAviso || this.editores.has(correo);
  }
}

class Hoja {
  constructor(libro, nombre) {
    Object.assign(this, { libro, nombre, id: ++secuencia, maxFilas: 1000, maxCols: 26, datos: new Map(), oculta: false,
                          colorPestana: null, columnasOcultas: new Set(), filasFijas: 0, protecciones: [] });
  }
  nuevaProteccion(tipo, rango) {
    const p = new Proteccion(this, tipo, rango);
    this.protecciones.push(p);
    return p;
  }
  protect() { return this.nuevaProteccion("SHEET", null); }
  getProtections(tipo) { return this.protecciones.filter(p => p.tipo === tipo); }
  setName(n) { this.nombre = n; return this; }
  getSheetId() { return this.id; }
  getIndex() { return this.libro.hojas.indexOf(this) + 1; }
  hideSheet() { this.oculta = true; return this; }
  showSheet() { this.oculta = false; return this; }
  isSheetHidden() { return this.oculta; }
  setTabColor(c) { this.colorPestana = c; return this; }
  getTabColor() { return this.colorPestana; }
  hideColumns(col, n = 1) { for (let i = 0; i < n; i++) this.columnasOcultas.add(col + i); }
  showColumns(col, n = 1) { for (let i = 0; i < n; i++) this.columnasOcultas.delete(col + i); }
  isColumnHiddenByUser(col) { return this.columnasOcultas.has(col); }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  getFrozenRows() { return this.filasFijas; }
  clear() { this.datos = new Map(); return this; }
  clearContents() { for (const x of this.datos.values()) x.v = ""; return this; }
  clearNotes() { for (const x of this.datos.values()) delete x.nota; return this; }
  deleteRows(fila, n) { for (let i = 0; i < n; i++) this.deleteRow(fila); }
  /* ¿Puede «correo» escribir en la celda (f, c)? Lo exigen todas las protecciones. */
  permite(correo, f, c) { return this.protecciones.every(p => p.permite(String(correo).toLowerCase(), f, c)); }
  clave(f, c) { return f + ":" + c; }
  celda(f, c) { return this.datos.get(this.clave(f, c)); }
  celdaCreada(f, c) {
    let x = this.celda(f, c);
    if (!x) { x = { v: "", fmt: "" }; this.datos.set(this.clave(f, c), x); }
    return x;
  }
  escribir(f, c, valor) {
    const x = this.celdaCreada(f, c);
    if (typeof valor === "string" && valor.startsWith("=")) throw new Error(`Se escribió una fórmula en ${this.nombre}!${f}:${c}: ${valor.slice(0, 40)}`);
    if (typeof valor === "string" && valor.startsWith("'")) { x.v = valor.slice(1); return; }
    if (typeof valor === "string" && x.fmt !== "@" && /^\d{4}-\d{1,2}(-\d{1,2})?$|^-?\d+(\.\d+)?$/.test(valor))
      throw new Error(`Texto «${valor}» escrito en ${this.nombre}!${f}:${c} sin formato de texto: Sheets lo convertiría.`);
    x.v = valor;
  }
  getName() { return this.nombre; }
  getMaxRows() { return this.maxFilas; }
  getMaxColumns() { return this.maxCols; }
  getLastRow() {
    let n = 0;
    for (const [k, x] of this.datos) if (x.v !== "" && x.v != null) n = Math.max(n, +k.split(":")[0]);
    return n;
  }
  getLastColumn() {
    let n = 0;
    for (const [k, x] of this.datos) if (x.v !== "" && x.v != null) n = Math.max(n, +k.split(":")[1]);
    return n;
  }
  getRange(fila, col, filas = 1, cols = 1) { return new Rango(this, fila, col, filas, cols); }
  insertRowsAfter(despues, n) { this.maxFilas += n; }
  insertColumnsAfter(despues, n) { this.maxCols += n; }
  deleteRow(fila) {
    const nuevos = new Map();
    for (const [k, x] of this.datos) {
      const [f, c] = k.split(":").map(Number);
      if (f === fila) continue;
      nuevos.set(this.clave(f > fila ? f - 1 : f, c), x);
    }
    this.datos = nuevos;
    this.maxFilas--;
  }
  setFrozenRows(n) { this.filasFijas = n; }
  /* Ayuda para las pruebas: filas de datos como arreglos. */
  filas(desde = 2) { const n = this.getLastRow(); return n < desde ? [] : this.getRange(desde, 1, n - desde + 1, this.getLastColumn()).getValues(); }
}

class Libro {
  constructor(entorno, nombre) {
    Object.assign(this, { entorno, nombre, id: nuevoId("bd"), hojas: [] });
    this.hojas.push(new Hoja(this, "Hoja 1"));
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  getSheets() { return this.hojas.slice(); }
  /* indice: posición (desde 0) en que se inserta, como en Apps Script. */
  insertSheet(n, indice) {
    if (this.getSheetByName(n)) throw new Error("Ya existe una hoja con el nombre «" + n + "».");
    const h = new Hoja(this, n);
    if (indice == null || indice >= this.hojas.length) this.hojas.push(h);
    else this.hojas.splice(indice, 0, h);
    return h;
  }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
  setActiveSheet(h) { this.entorno.seleccion = { hoja: h.nombre, fila: 1, col: 1 }; return h; }
  moveActiveSheet() {}
  getActiveSheet() { const s = this.entorno.seleccion; return (s && this.getSheetByName(s.hoja)) || this.hojas[0] || null; }
  getActiveRange() { const s = this.entorno.seleccion; const h = this.getActiveSheet(); return h ? h.getRange((s && s.fila) || 1, (s && s.col) || 1) : null; }
  toast(texto) { this.entorno.toasts.push(String(texto)); }
  getSpreadsheetLocale() { return this.entorno.region; }
}

/* Cada método de un archivo o carpeta de Drive cuenta como una llamada a Drive. */
class Archivo {
  constructor({ nombre, tipo, bytes, fecha, carpeta, entorno }) {
    Object.assign(this, { id: nuevoId("ar"), nombre, tipo, bytes, fecha: fecha || new Date(), carpeta, papelera: false, entorno });
  }
  llamada() { if (this.entorno) this.entorno.cuentas.drive++; }
  getId() { this.llamada(); return this.id; }
  getName() { this.llamada(); return this.nombre; }
  getMimeType() { this.llamada(); return this.tipo; }
  getLastUpdated() { this.llamada(); return new Date(this.fecha); }
  isTrashed() { this.llamada(); return this.papelera; }
  getBlob() { this.llamada(); return new Blob(this.bytes, this.nombre); }
  moveTo(carpeta) { if (this.carpeta) this.carpeta.archivos.delete(this); carpeta.archivos.add(this); this.carpeta = carpeta; return this; }
}

class Blob {
  constructor(bytes, nombre) { Object.assign(this, { bytes, nombre, tipo: "" }); }
  setContentType(t) { this.tipo = t; return this; }
  getName() { return this.nombre; }
  getDataAsString() { return this.bytes.toString("utf8"); }
}

class Carpeta {
  constructor(nombre, entorno) { Object.assign(this, { id: nuevoId("ca"), nombre, archivos: new Set(), papelera: false, entorno }); }
  llamada() { this.entorno.cuentas.drive++; }
  getId() { return this.id; }
  getName() { this.llamada(); return this.nombre; }
  getUrl() { return "https://drive.google.com/drive/folders/" + this.id; }
  isTrashed() { this.llamada(); return this.papelera; }
  getFiles() {
    this.llamada();
    const l = [...this.archivos]; let i = 0;
    return { hasNext: () => i < l.length, next: () => { this.llamada(); return l[i++]; } };
  }
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function crearEntorno({ propietario = "mfloresl@ulasalle.edu.pe" } = {}) {
  const e = {
    usuario: propietario, propietario, desfase: 0,
    propiedades: {}, carpetas: new Map(), libros: new Map(), archivos: new Map(), registro: [],
    cache: new Map(), sinAcceso: new Set(),
    cuentas: { drive: 0, sheets: 0, lecturas: {}, urlfetch: 0 },
    /* Quién ejecuta: «web» (la aplicación web y google.script.run, como la cuenta
       propietaria), «libro» (menú y panel lateral, con la cuenta de quien hace clic) o
       «disparador» (instalables, como la cuenta propietaria). */
    efectivo: propietario, contexto: "web",
    disparadores: [], menus: [], paneles: [], dialogos: [], alertas: [], toasts: [],
    seleccion: null, region: "es_PE",
    urlWeb: "https://script.google.com/macros/s/FALSO/exec", webPublicada: false
  };
  /* Cada ejecución empieza con las cachés globales vacías. */
  e.nuevaEjecucion = (usuario, efectivo, contexto) => {
    e.usuario = usuario; e.efectivo = efectivo; e.contexto = contexto;
    if (e.ctx) { e.ctx.configCache_ = null; e.ctx.libroCache_ = null; e.ctx.usuarioCache_ = null; }
  };
  /* El libro al que está vinculado el proyecto (P113). */
  e.libroActivo = new Libro(e, "SISCargaLectiva");
  e.libros.set(e.libroActivo.id, e.libroActivo);
  e.reiniciarCuentas = () => { e.cuentas = { drive: 0, sheets: 0, lecturas: {}, urlfetch: 0 }; };
  const ahora = () => Date.now() + e.desfase;
  class RelojDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(ahora()); }
    static now() { return ahora(); }
  }

  /* CacheService: caduca según el reloj simulado y rechaza, como Apps Script, valores de
     más de 100 KB y claves de más de 250 caracteres. */
  const cache = {
    get: k => { const x = e.cache.get(k); return x && x.vence > ahora() ? x.valor : null; },
    getAll: claves => Object.fromEntries(claves.map(k => [k, cache.get(k)]).filter(([, v]) => v != null)),
    put: (k, v, segundos = 600) => {
      const valor = String(v);
      if (k.length > 250) throw new Error("Clave de caché demasiado larga: " + k);
      if (Buffer.byteLength(valor) > 100 * 1024) throw new Error("Argumento demasiado grande: valor de caché de " + Buffer.byteLength(valor) + " bytes");
      e.cache.set(k, { valor, vence: ahora() + Math.min(segundos, 21600) * 1000 });
    },
    putAll: (valores, segundos) => Object.entries(valores).forEach(([k, v]) => cache.put(k, v, segundos)),
    remove: k => { e.cache.delete(k); },
    removeAll: claves => claves.forEach(k => e.cache.delete(k))
  };

  e.globales = {
    Date: RelojDate,
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => ({ ...e.propiedades }),
      getProperty: k => (k in e.propiedades ? e.propiedades[k] : null),
      setProperty: (k, v) => { e.propiedades[k] = String(v); },
      deleteProperty: k => { delete e.propiedades[k]; }
    }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => e.usuario }),
      getEffectiveUser: () => ({ getEmail: () => e.efectivo }),
      getScriptTimeZone: () => "America/Lima"
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
    SpreadsheetApp: {
      create: nombre => { const l = new Libro(e, nombre); e.libros.set(l.id, l); e.archivos.set(l.id, new Archivo({ nombre, tipo: "application/vnd.google-apps.spreadsheet", entorno: e })); e.archivos.get(l.id).id = l.id; return l; },
      openById: id => { e.cuentas.sheets++; const l = e.libros.get(id); if (!l) throw new Error("No existe la hoja " + id); return l; },
      getActive: () => e.libroActivo,
      getActiveSpreadsheet: () => e.libroActivo,
      getActiveSheet: () => e.libroActivo.getActiveSheet(),
      getActiveRange: () => e.libroActivo.getActiveRange(),
      getUi: () => {
        if (e.contexto !== "libro") throw new Error("Cannot call SpreadsheetApp.getUi() from this context.");
        return ui;
      },
      flush: () => {},
      ProtectionType: { SHEET: "SHEET", RANGE: "RANGE" }
    },
    DriveApp: {
      createFolder: nombre => { const c = new Carpeta(nombre, e); e.carpetas.set(c.id, c); return c; },
      getFolderById: id => { e.cuentas.drive++; const c = e.carpetas.get(id); if (!c) throw new Error("No existe la carpeta " + id); return c; },
      getFileById: id => { e.cuentas.drive++; const a = e.archivos.get(id); if (!a) throw new Error("No existe el archivo " + id); return a; }
    },
    Utilities: {
      unzip: blob => Object.entries(descomprimir(blob.bytes)).map(([nombre, bytes]) => new Blob(bytes, nombre)),
      /* Solo America/Lima (UTC-5, sin horario de verano), que es la del proyecto. */
      formatDate: (fecha, zona, formato) => {
        const d = new Date(new Date(fecha).getTime() - 5 * 3600000);
        const dos = n => String(n).padStart(2, "0");
        return formato.replace("yyyy", d.getUTCFullYear()).replace("MM", dos(d.getUTCMonth() + 1)).replace("dd", dos(d.getUTCDate()))
          .replace("HH", dos(d.getUTCHours())).replace("mm", dos(d.getUTCMinutes())).replace("ss", dos(d.getUTCSeconds()));
      }
    },
    ScriptApp: {
      newTrigger: funcion => {
        const crear = (tipo, extra) => () => {
          const d = Object.assign({ id: nuevoId("dt"), funcion, tipo, creador: e.efectivo }, extra || {});
          e.disparadores.push(d);
          return { getHandlerFunction: () => d.funcion, getUniqueId: () => d.id };
        };
        return {
          forSpreadsheet: libro => ({ onEdit: () => ({ create: crear("ON_EDIT", { libro }) }),
                                      onChange: () => ({ create: crear("ON_CHANGE", { libro }) }),
                                      onOpen: () => ({ create: crear("ON_OPEN", { libro }) }) }),
          timeBased: () => {
            const extra = {};
            const tb = { everyMinutes: n => { extra.minutos = n; return tb; }, create: () => crear("CLOCK", extra)() };
            return tb;
          }
        };
      },
      getProjectTriggers: () => e.disparadores.map(d => ({ getHandlerFunction: () => d.funcion, getEventType: () => d.tipo, getUniqueId: () => d.id })),
      deleteTrigger: x => { e.disparadores = e.disparadores.filter(d => d.id !== x.getUniqueId()); },
      getOAuthToken: () => "tok:" + e.usuario,
      getService: () => ({ getUrl: () => (e.webPublicada ? e.urlWeb : null) })
    },
    /* La aplicación web publicada: una petición con el token de una cuenta es una ejecución
       nueva de doPost como la cuenta propietaria, con esa cuenta como usuario activo. */
    UrlFetchApp: {
      fetch: (url, opciones = {}) => {
        e.cuentas.urlfetch++;
        const respuesta = (codigo, texto) => ({ getResponseCode: () => codigo, getContentText: () => texto });
        if (url !== e.urlWeb || !e.webPublicada) return respuesta(404, "<html>No se encontró la página</html>");
        const correo = String((opciones.headers && opciones.headers.Authorization) || "").replace(/^Bearer tok:/, "");
        const antes = { usuario: e.usuario, efectivo: e.efectivo, contexto: e.contexto };
        e.nuevaEjecucion(correo, e.propietario, "web");
        try {
          return respuesta(200, e.ctx.doPost({ postData: { contents: opciones.payload, type: opciones.contentType } }).getContent());
        } finally {
          e.nuevaEjecucion(antes.usuario, antes.efectivo, antes.contexto);
        }
      }
    },
    ContentService: {
      createTextOutput: texto => {
        const o = { contenido: String(texto == null ? "" : texto), tipo: "" };
        o.getContent = () => o.contenido; o.setMimeType = m => { o.tipo = m; return o; }; o.getMimeType = () => o.tipo;
        return o;
      },
      MimeType: { JSON: "application/json", TEXT: "text/plain" }
    },
    MimeType: { GOOGLE_SHEETS: "application/vnd.google-apps.spreadsheet", MICROSOFT_EXCEL: MIME_XLSX },
    Logger: { log: t => e.registro.push(String(t)) },
    HtmlService: {
      createTemplateFromFile: nombre => plantilla(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8")),
      createHtmlOutputFromFile: nombre => salida(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8")),
      createHtmlOutput: html => salida(String(html == null ? "" : html))
    }
  };

  /* Plantillas de HtmlService: solo <?!= expr ?> y <?= expr ?>, que es lo que usa Index.html. */
  function plantilla(texto) {
    const t = {
      evaluate() {
        const html = texto.replace(/<\?(!?=)\s*([\s\S]*?)\s*\?>/g, (m, tipo, expr) => {
          const v = String(new Function(...Object.keys(t), "include", "return (" + expr + ");")(...Object.values(t), e.ctx.include));
          return tipo === "!=" ? v : v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        });
        return salida(html);
      }
    };
    Object.defineProperty(t, "evaluate", { enumerable: false });
    return t;
  }
  function salida(html) {
    const o = { titulo: "", getContent: () => html, setTitle(x) { o.titulo = x; return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; },
                setWidth() { return o; }, setHeight() { return o; } };
    return o;
  }

  /* La interfaz del libro: menús, panel lateral, ventanas y avisos (solo en el libro). */
  const ui = {
    createMenu: nombre => {
      const m = { nombre, items: [] };
      const b = {
        addItem: (texto, funcion) => { m.items.push({ texto, funcion }); return b; },
        addSeparator: () => { m.items.push({ separador: true }); return b; },
        addToUi: () => { e.menus = e.menus.filter(x => x.nombre !== nombre).concat([m]); }
      };
      return b;
    },
    showSidebar: html => { e.paneles.push({ titulo: html.titulo, html: html.getContent() }); },
    showModalDialog: (html, titulo) => { e.dialogos.push({ titulo, html: html.getContent() }); },
    alert: (...a) => { e.alertas.push(a.length >= 2 ? { titulo: a[0], texto: String(a[1]) } : { titulo: "", texto: String(a[0]) }); return "OK"; },
    ButtonSet: { OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO" },
    Button: { OK: "OK", CANCEL: "CANCEL", YES: "YES", NO: "NO" }
  };

  /* La aplicación web publicada (Implementar → Nueva implementación). */
  e.publicarWeb = () => { e.webPublicada = true; };

  /* Disparadores instalables de un tipo, como la cuenta propietaria, con «quien» como la
     cuenta que causó el evento (null: Google no la informa). */
  e.disparar = (tipo, quien, evento) => {
    const res = [];
    e.disparadores.filter(d => d.tipo === tipo).forEach(d => {
      e.nuevaEjecucion(quien || "", e.propietario, "disparador");
      try {
        const r = e.ctx[d.funcion](Object.assign({ user: quien ? { getEmail: () => quien } : null, authMode: "FULL", triggerUid: d.id }, evento));
        res.push(r == null ? null : plano(r));
      } finally {
        e.nuevaEjecucion(e.propietario, e.propietario, "web");
      }
    });
    return res;
  };
  e.dispararTiempo = () => e.disparar("CLOCK", e.propietario, {});

  /* Una persona edita en la hoja (como escribirComo) y Sheets avisa a onSheetEdit. Devuelve
     lo que devolvieron los disparadores. «quien»: la cuenta que informa el evento si no es
     la misma (null para simular que Google no la informa). */
  e.editarComo = (correo, nombreHoja, fila, col, valores, opciones = {}) => {
    const h = e.hoja(nombreHoja);
    const una = valores.length === 1 && valores[0].length === 1;
    const antes = una && h.celda(fila, col) ? h.celda(fila, col).v : "";
    e.escribirComo(correo, nombreHoja, fila, col, valores);
    e.seleccion = { hoja: nombreHoja, fila, col };
    return e.disparar("ON_EDIT", opciones.quien === undefined ? correo : opciones.quien, {
      range: h.getRange(fila, col, valores.length, valores[0].length), source: e.libroActivo,
      value: una ? valores[0][0] : undefined, oldValue: una && antes !== "" ? antes : undefined
    });
  };

  /* Una persona elimina una fila entera: Sheets no la deja si alguna celda de la fila está
     protegida para ella. */
  e.borrarFilaComo = (correo, nombreHoja, fila) => {
    const h = e.hoja(nombreHoja);
    for (let c = 1; c <= h.maxCols; c++)
      if (!h.permite(correo, fila, c)) throw new Error("Intentas modificar una celda o un objeto protegido: " + nombreHoja + "!" + fila + " (" + correo + ").");
    h.deleteRow(fila);
    e.seleccion = { hoja: nombreHoja, fila, col: 1 };
    return e.disparar("ON_CHANGE", correo, { changeType: "REMOVE_ROW", source: e.libroActivo });
  };

  /* Sube un archivo a una carpeta, como si se arrastrara en Drive. */
  e.subir = (carpetaId, nombre, bytes, { tipo = MIME_XLSX, fecha } = {}) => {
    const c = e.carpetas.get(carpetaId);
    const a = new Archivo({ nombre, tipo, bytes, fecha, carpeta: c, entorno: e });
    c.archivos.add(a);
    e.archivos.set(a.id, a);
    return a;
  };
  e.hoja = nombre => e.libroActivo.getSheetByName(nombre);

  /* Una persona escribe en la hoja, como en Sheets: si una protección no la deja, falla y
     no cambia nada. «valores» es una matriz que empieza en (fila, col). */
  e.escribirComo = (correo, nombreHoja, fila, col, valores) => {
    const h = e.hoja(nombreHoja);
    if (!h) throw new Error("No existe la hoja «" + nombreHoja + "».");
    valores.forEach((f, i) => f.forEach((v, j) => {
      if (!h.permite(correo, fila + i, col + j))
        throw new Error("Intentas modificar una celda o un objeto protegido: " + nombreHoja + "!" + (fila + i) + ":" + (col + j) + " (" + correo + ").");
    }));
    valores.forEach((f, i) => f.forEach((v, j) => {
      const x = h.celdaCreada(fila + i, col + j);
      x.v = v;
    }));
  };
  return e;
}

const ARCHIVOS_SERVIDOR = fs.readdirSync(RAIZ).filter(f => f.endsWith(".js")).sort();

/* Carga todo el servidor en un contexto con los servicios falsos. */
export function cargarServidor(entorno) {
  const ctx = cargar(ARCHIVOS_SERVIDOR, entorno.globales);
  entorno.ctx = ctx;
  return ctx;
}

/* Cada llamada de google.script.run es una ejecución nueva: se vacían las cachés
   globales y se fija la cuenta que llama. */
export function ejecutar(entorno, usuario, funcion, ...args) {
  entorno.nuevaEjecucion(usuario, entorno.propietario, "web");
  const r = entorno.ctx[funcion](...args.map(a => (a === undefined ? a : plano(a))));
  return r === undefined ? r : plano(r);
}

/* Lo que se ejecuta desde el menú o el panel lateral del libro: con la cuenta de quien hace
   clic, también como usuario efectivo. */
export function ejecutarEnLibro(entorno, usuario, funcion, ...args) {
  entorno.nuevaEjecucion(usuario, usuario, "libro");
  try {
    const r = entorno.ctx[funcion](...args.map(a => (a === undefined ? a : plano(a))));
    return r === undefined || r === null ? r : plano(r);
  } finally {
    entorno.nuevaEjecucion(entorno.propietario, entorno.propietario, "web");
  }
}
