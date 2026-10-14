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
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => this.hoja.escribir(f, c, valores[i][j]));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  matriz(valores, campo) {
    if (valores.length !== this.filas || valores.some(f => f.length !== this.cols))
      throw new Error("El número de filas o columnas de los datos no coincide con el del rango.");
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => { this.hoja.celdaCreada(f, c)[campo] = valores[i][j]; });
    return this;
  }
  leer(campo, vacio) {
    const r = Array.from({ length: this.filas }, () => Array(this.cols).fill(vacio));
    this.celdas((f, c, i, j) => { const x = this.hoja.celda(f, c); if (x && x[campo] != null) r[i][j] = x[campo]; });
    return r;
  }
  setNumberFormat(formato) { this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fmt = formato; }); return this; }
  setNumberFormats(m) { return this.matriz(m, "fmt"); }
  getNumberFormats() { return this.leer("fmt", ""); }
  setNotes(m) { return this.matriz(m, "nota"); }
  setNote(t) { return this.setNotes([[t]]); }
  getNotes() { return this.leer("nota", ""); }
  setBackgrounds(m) { return this.matriz(m, "fondo"); }
  setBackground(color) { this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fondo = color; }); return this; }
  getBackgrounds() { return this.leer("fondo", "#ffffff"); }
  setFontWeight() { return this; }
  setFontColor() { return this; }
  setHorizontalAlignment() { return this; }
  setVerticalAlignment() { return this; }
  setWrap() { return this; }
  clearContent() { this.celdas((f, c) => { const x = this.hoja.celda(f, c); if (x) x.v = ""; }); return this; }
  clear() { this.celdas((f, c) => { this.hoja.datos.delete(this.hoja.clave(f, c)); }); return this; }
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
  setActiveSheet(h) { return h; }
  moveActiveSheet() {}
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
    cuentas: { drive: 0, sheets: 0, lecturas: {} }
  };
  /* El libro al que está vinculado el proyecto (P113). */
  e.libroActivo = new Libro(e, "SISCargaLectiva");
  e.libros.set(e.libroActivo.id, e.libroActivo);
  e.reiniciarCuentas = () => { e.cuentas = { drive: 0, sheets: 0, lecturas: {} }; };
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
      getEffectiveUser: () => ({ getEmail: () => e.propietario })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
    SpreadsheetApp: {
      create: nombre => { const l = new Libro(e, nombre); e.libros.set(l.id, l); e.archivos.set(l.id, new Archivo({ nombre, tipo: "application/vnd.google-apps.spreadsheet", entorno: e })); e.archivos.get(l.id).id = l.id; return l; },
      openById: id => { e.cuentas.sheets++; const l = e.libros.get(id); if (!l) throw new Error("No existe la hoja " + id); return l; },
      getActive: () => e.libroActivo,
      getActiveSpreadsheet: () => e.libroActivo,
      flush: () => {},
      ProtectionType: { SHEET: "SHEET", RANGE: "RANGE" }
    },
    DriveApp: {
      createFolder: nombre => { const c = new Carpeta(nombre, e); e.carpetas.set(c.id, c); return c; },
      getFolderById: id => { e.cuentas.drive++; const c = e.carpetas.get(id); if (!c) throw new Error("No existe la carpeta " + id); return c; },
      getFileById: id => { e.cuentas.drive++; const a = e.archivos.get(id); if (!a) throw new Error("No existe el archivo " + id); return a; }
    },
    Utilities: {
      unzip: blob => Object.entries(descomprimir(blob.bytes)).map(([nombre, bytes]) => new Blob(bytes, nombre))
    },
    MimeType: { GOOGLE_SHEETS: "application/vnd.google-apps.spreadsheet", MICROSOFT_EXCEL: MIME_XLSX },
    Logger: { log: t => e.registro.push(String(t)) },
    HtmlService: {
      createTemplateFromFile: nombre => plantilla(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8")),
      createHtmlOutputFromFile: nombre => salida(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8"))
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
    const o = { titulo: "", getContent: () => html, setTitle(x) { o.titulo = x; return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; } };
    return o;
  }

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
  const ctx = entorno.ctx;
  entorno.usuario = usuario;
  ctx.configCache_ = null; ctx.libroCache_ = null; ctx.usuarioCache_ = null;
  const r = ctx[funcion](...args.map(a => (a === undefined ? a : plano(a))));
  return r === undefined ? r : plano(r);
}
