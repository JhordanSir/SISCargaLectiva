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
  setValues(valores) {
    if (valores.length !== this.filas || valores.some(f => f.length !== this.cols))
      throw new Error("El número de filas o columnas de los datos no coincide con el del rango.");
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => this.hoja.escribir(f, c, valores[i][j]));
    return this;
  }
  setNumberFormat(formato) { this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fmt = formato; }); return this; }
  setFontWeight() { return this; }
  clearContent() { this.celdas((f, c) => { const x = this.hoja.celda(f, c); if (x) x.v = ""; }); return this; }
}

class Hoja {
  constructor(libro, nombre) {
    Object.assign(this, { libro, nombre, maxFilas: 1000, maxCols: 26, datos: new Map() });
  }
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
  deleteRows(fila, n) { for (let i = 0; i < n; i++) this.deleteRow(fila); }
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
  setFrozenRows() {}
  /* Ayuda para las pruebas: filas de datos como arreglos. */
  filas() { const n = this.getLastRow(); return n < 2 ? [] : this.getRange(2, 1, n - 1, this.getLastColumn()).getValues(); }
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
  insertSheet(n) { const h = new Hoja(this, n); this.hojas.push(h); return h; }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
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
    cache: new Map(),
    cuentas: { drive: 0, sheets: 0, lecturas: {} }
  };
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
      flush: () => {}
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
          const v = String(new Function(...Object.keys(t), "include_", "return (" + expr + ");")(...Object.values(t), e.ctx.include_));
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
  e.hoja = nombre => e.libros.get(e.propiedades.SIS_BD_ID).getSheetByName(nombre);
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
  ctx.configCache_ = null; ctx.libroBdCache_ = null; ctx.usuarioCache_ = null; ctx.hojasCache_ = null;
  const r = ctx[funcion](...args.map(a => (a === undefined ? a : plano(a))));
  return r === undefined ? r : plano(r);
}

/* Cuentas de las pruebas: dos coordinadores de todas las carreras y un director por
   departamento. Reemplaza las cuentas que siembra instalar(). */
export const TODAS_LAS_CARRERAS = "ADM, DER, ING, ICO, COM, PSI, ARQ, IND";
export const DIRECTORES = { DIMA: "jhuamanih@ulasalle.edu.pe", DAHUC: "jortizc@ulasalle.edu.pe", DACJ: "afrontadof@ulasalle.edu.pe", DACTE: "aarenasc@ulasalle.edu.pe" };
export const USUARIOS_PRUEBA = [
  ["mfloresl@ulasalle.edu.pe", "coordinador", TODAS_LAS_CARRERAS, ""],
  ["fmaresg@ulasalle.edu.pe", "coordinador", TODAS_LAS_CARRERAS, ""]
].concat(Object.entries(DIRECTORES).map(([d, correo]) => [correo, "director", "", d]));

export function fijarUsuarios(entorno, filas) {
  const h = entorno.hoja("Usuarios");
  const n = h.getLastRow();
  if (n > 1) h.getRange(2, 1, n - 1, 4).clearContent();
  h.getRange(2, 1, filas.length, 4).setNumberFormat("@").setValues(filas.map(f => [f[0], f[1], f[2] || "", f[3] || ""]));
}
