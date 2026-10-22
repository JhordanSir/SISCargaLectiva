/* Imitación, en memoria, de los servicios de Apps Script que usa el servidor.
   Es estricta donde Apps Script lo es (rangos fuera de la hoja, dimensiones de
   setValues) y avisa de lo que en Sheets saldría mal (texto sin formato «@»). El formato
   (colores, bordes, anchos…) se acepta y no se guarda. El script está ligado a una hoja:
   e.activo, la hoja del sistema, en la carpeta e.carpetaApp. */
import fs from "node:fs";
import path from "node:path";
import { descomprimir, cargar, plano, partesXlsx, RAIZ, archivosApp, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

let secuencia = 0;
/* Como los de Google: más de 20 caracteres. */
const nuevoId = prefijo => prefijo + "_" + (++secuencia).toString(36).padStart(22, "0");

/* Métodos de formato que se aceptan sin guardar nada: devuelven el mismo objeto. */
const FORMATO = /^(set(?!Values$|Value$|Notes$|NumberFormat$|Name$|ConditionalFormatRules$|TabColor$)|merge|breakApart|insertImage$|activate$)/;
const conFormato = objeto => new Proxy(objeto, {
  get(t, p) {
    if (p in t) return t[p];
    if (typeof p === "string" && FORMATO.test(p)) return () => conFormato(t);
    return undefined;
  }
});

/* Pestañas de datos (comun/FuenteHoja.js): sus lecturas se cuentan aparte. */
const ES_DATOS = /^(Oferta|Carga|Docentes) - /;

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
  leer(campo) {
    const cuentas = this.hoja.libro.entorno.cuentas;
    cuentas.sheets++;
    cuentas.lecturas[this.hoja.nombre] = (cuentas.lecturas[this.hoja.nombre] || 0) + 1;
    if (ES_DATOS.test(this.hoja.nombre)) cuentas.datos++;
    const r = Array.from({ length: this.filas }, () => Array(this.cols).fill(""));
    this.celdas((f, c, i, j) => { const x = this.hoja.celda(f, c); r[i][j] = x ? campo(x) : ""; });
    return r;
  }
  getValues() { return this.leer(x => x.v); }
  getDisplayValues() { return this.leer(x => (x.v == null ? "" : String(x.v))); }
  getNotes() { return this.leer(x => x.nota || ""); }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  setValues(valores) {
    if (valores.length !== this.filas || valores.some(f => f.length !== this.cols))
      throw new Error("El número de filas o columnas de los datos no coincide con el del rango.");
    this.hoja.libro.entorno.cuentas.sheets++;
    this.celdas((f, c, i, j) => this.hoja.escribir(f, c, valores[i][j]));
    return conFormato(this);
  }
  setValue(v) { return this.setValues(Array.from({ length: this.filas }, () => Array(this.cols).fill(v))); }
  setNotes(notas) { this.celdas((f, c, i, j) => { this.hoja.celdaCreada(f, c).nota = notas[i][j]; }); return conFormato(this); }
  setNumberFormat(formato) { this.celdas((f, c) => { this.hoja.celdaCreada(f, c).fmt = formato; }); return conFormato(this); }
  clearContent() { this.celdas((f, c) => { const x = this.hoja.celda(f, c); if (x) x.v = ""; }); return conFormato(this); }
}

class Hoja {
  constructor(libro, nombre) {
    Object.assign(this, { libro, nombre, maxFilas: 1000, maxCols: 26, datos: new Map(), oculta: false, protecciones: [], reglas: [], color: null });
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
  /* Ayuda para las pruebas: pone celdas tal como las mostraría Sheets (sin la comprobación de formato). */
  poner(filas) {
    this.datos = new Map();
    this.maxFilas = Math.max(1000, filas.length);
    this.maxCols = Math.max(26, ...filas.map(f => f.length));
    filas.forEach((f, i) => f.forEach((v, j) => { if (v !== "" && v != null) this.datos.set(this.clave(i + 1, j + 1), { v: String(v), fmt: "" }); }));
    return this;
  }
  getName() { return this.nombre; }
  setName(n) { this.nombre = n; return this; }
  getParent() { return this.libro; }
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
  getRange(fila, col, filas = 1, cols = 1) {
    if (typeof fila === "string") {
      const [a, b] = fila.split(":").map(ref => ref.match(/^([A-Z]+)(\d+)$/));
      const columna = l => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const f1 = +a[2], c1 = columna(a[1]), f2 = b ? +b[2] : f1, c2 = b ? columna(b[1]) : c1;
      return conFormato(new Rango(this, f1, c1, f2 - f1 + 1, c2 - c1 + 1));
    }
    return conFormato(new Rango(this, fila, col, filas, cols));
  }
  insertRowsAfter(despues, n) { this.maxFilas += n; }
  insertColumnsAfter(despues, n) { this.maxCols += n; }
  deleteColumns(col, n) { this.maxCols -= n; }
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
  clear() { this.datos = new Map(); return this; }
  setFrozenRows() {}
  hideSheet() { this.oculta = true; return this; }
  showSheet() { this.oculta = false; return this; }
  isSheetHidden() { return this.oculta; }
  setTabColor(c) { this.color = c; return this; }
  getProtections() { return this.protecciones.slice(); }
  protect() {
    const p = { avisar: false, descripcion: "" };
    this.protecciones.push(p);
    const o = { setWarningOnly: v => { p.avisar = v; return o; }, setDescription: d => { p.descripcion = d; return o; } };
    return o;
  }
  getConditionalFormatRules() { return this.reglas.slice(); }
  setConditionalFormatRules(r) { this.reglas = r.slice(); return this; }
  getImages() { return []; }
  insertImage() { const img = conFormato({ assignScript: () => img }); return img; }
  activate() { this.libro.activa = this; return this; }
  /* Ayuda para las pruebas: filas de datos como arreglos. */
  filas() { const n = this.getLastRow(); return n < 2 ? [] : this.getRange(2, 1, n - 1, this.getLastColumn()).getValues(); }
}

class Libro {
  constructor(entorno, nombre) {
    Object.assign(this, { entorno, nombre, id: nuevoId("bd"), hojas: [], zona: "", regional: "en_US", activa: null, avisos: [] });
    this.hojas.push(conFormato(new Hoja(this, "Hoja 1")));
  }
  getId() { return this.id; }
  getName() { return this.nombre; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getOwner() { const correo = this.propietario || this.entorno.propietario; return { getEmail: () => correo }; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  getSheets() { return this.hojas.slice(); }
  insertSheet(n, indice) {
    const h = conFormato(new Hoja(this, n));
    if (indice == null) this.hojas.push(h); else this.hojas.splice(indice, 0, h);
    return h;
  }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
  setActiveSheet(h) { this.activa = h; return h; }
  moveActiveSheet(posicion) { this.hojas = this.hojas.filter(x => x !== this.activa); this.hojas.splice(posicion - 1, 0, this.activa); }
  setSpreadsheetTimeZone(z) { this.zona = z; }
  getSpreadsheetLocale() { return this.regional; }
  setSpreadsheetLocale(r) { this.regional = r; }
  toast(texto, titulo) { this.avisos.push([titulo, texto]); }
}

/* Cada método de un archivo o carpeta de Drive cuenta como una llamada a Drive. */
class Archivo {
  constructor({ nombre, tipo, bytes, fecha, carpeta, entorno, propietario }) {
    Object.assign(this, { id: nuevoId("ar"), nombre, tipo, bytes, fecha: fecha || new Date(), carpeta, papelera: false, entorno, propietario: propietario || entorno.propietario });
  }
  llamada() { if (this.entorno) this.entorno.cuentas.drive++; }
  getId() { this.llamada(); return this.id; }
  getName() { this.llamada(); return this.nombre; }
  getUrl() { return "https://drive.google.com/file/d/" + this.id; }
  getMimeType() { this.llamada(); return this.tipo; }
  getLastUpdated() { this.llamada(); return new Date(this.fecha); }
  getOwner() { const correo = this.propietario; return { getEmail: () => correo }; }
  isTrashed() { this.llamada(); return this.papelera; }
  setTrashed(v) {
    if (v && this.propietario !== this.entorno.usuario) throw new Error("No tienes permiso para mandar este archivo a la papelera.");
    this.papelera = v; return this;
  }
  getParents() { return iterador(this.carpeta ? [this.carpeta] : []); }
  getBlob() { this.llamada(); return new Blob(this.bytes, this.nombre); }
  moveTo(carpeta) { if (this.carpeta) this.carpeta.archivos.delete(this); carpeta.archivos.add(this); this.carpeta = carpeta; return this; }
}

class Blob {
  constructor(bytes, nombre) { Object.assign(this, { bytes, nombre, tipo: "" }); }
  setContentType(t) { this.tipo = t; return this; }
  getName() { return this.nombre; }
  getDataAsString() { return this.bytes.toString("utf8"); }
}

const iterador = lista => { let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; };

class Carpeta {
  constructor(nombre, entorno, padre = null, propietario = null) {
    Object.assign(this, { id: nuevoId("ca"), nombre, archivos: new Set(), subcarpetas: new Set(), padre, papelera: false, entorno, propietario: propietario || entorno.propietario });
    if (padre) padre.subcarpetas.add(this);
  }
  llamada() { this.entorno.cuentas.drive++; }
  getId() { return this.id; }
  getName() { this.llamada(); return this.nombre; }
  getUrl() { return "https://drive.google.com/drive/folders/" + this.id; }
  getOwner() { const correo = this.propietario; return { getEmail: () => correo }; }
  getLastUpdated() { return new Date("2026-10-15T07:07:30Z"); }
  isTrashed() { this.llamada(); return this.papelera; }
  setTrashed(v) {
    if (v && this.propietario !== this.entorno.usuario) throw new Error("No tienes permiso para mandar esta carpeta a la papelera.");
    this.papelera = v;
    if (v) { this.archivos.forEach(a => { a.papelera = true; }); this.subcarpetas.forEach(c => { c.papelera = true; }); }
    return this;
  }
  getParents() { return iterador(this.padre ? [this.padre] : []); }
  getFiles() {
    this.llamada();
    const l = [...this.archivos]; let i = 0;
    return { hasNext: () => i < l.length, next: () => { this.llamada(); return l[i++]; } };
  }
  getFolders() { return iterador([...this.subcarpetas]); }
}

export const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MIME_HOJA = "application/vnd.google-apps.spreadsheet";

/* Formato de fecha de Utilities.formatDate en hora de Lima (UTC−5): yyyy, MM, dd, HH, mm,
   ss y textos entre comillas simples. */
function formatearFecha(fecha, zona, patron) {
  const d = new Date(new Date(fecha).getTime() - 5 * 3600000);
  const dos = n => String(n).padStart(2, "0");
  const valores = { yyyy: d.getUTCFullYear(), MM: dos(d.getUTCMonth() + 1), dd: dos(d.getUTCDate()), HH: dos(d.getUTCHours()), mm: dos(d.getUTCMinutes()), ss: dos(d.getUTCSeconds()) };
  return patron.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, literal) => literal !== undefined ? literal : valores[m]);
}

export function crearEntorno({ propietario = "mfloresl@ulasalle.edu.pe" } = {}) {
  const e = {
    usuario: propietario, propietario, desfase: 0,
    propiedades: {}, carpetas: new Map(), libros: new Map(), archivos: new Map(), registro: [],
    cache: new Map(), cacheDocumento: new Map(), ui: [],
    cuentas: { drive: 0, sheets: 0, datos: 0, lecturas: {} }
  };
  e.reiniciarCuentas = () => { e.cuentas = { drive: 0, sheets: 0, datos: 0, lecturas: {} }; };
  const ahora = () => Date.now() + e.desfase;
  class RelojDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(ahora()); }
    static now() { return ahora(); }
  }

  /* CacheService: caduca según el reloj simulado y rechaza, como Apps Script, valores de
     más de 100 KB y claves de más de 250 caracteres. */
  const crearCache = mapa => {
    const cache = {
      get: k => { const x = mapa.get(k); return x && x.vence > ahora() ? x.valor : null; },
      getAll: claves => Object.fromEntries(claves.map(k => [k, cache.get(k)]).filter(([, v]) => v != null)),
      put: (k, v, segundos = 600) => {
        const valor = String(v);
        if (k.length > 250) throw new Error("Clave de caché demasiado larga: " + k);
        if (Buffer.byteLength(valor) > 100 * 1024) throw new Error("Argumento demasiado grande: valor de caché de " + Buffer.byteLength(valor) + " bytes");
        mapa.set(k, { valor, vence: ahora() + Math.min(segundos, 21600) * 1000 });
      },
      putAll: (valores, segundos) => Object.entries(valores).forEach(([k, v]) => cache.put(k, v, segundos)),
      remove: k => { mapa.delete(k); },
      removeAll: claves => claves.forEach(k => mapa.delete(k))
    };
    return cache;
  };
  const cache = crearCache(e.cache), cacheDocumento = crearCache(e.cacheDocumento);

  /* Drive: «Mi unidad», la carpeta de la app y, dentro, la hoja a la que está ligado el script. */
  const nuevaCarpeta = (nombre, padre, duenio) => { const c = new Carpeta(nombre, e, padre, duenio); e.carpetas.set(c.id, c); return c; };
  e.raiz = nuevaCarpeta("Mi unidad", null);
  e.carpetaApp = nuevaCarpeta("SISCargaLectiva", e.raiz);
  e.nuevaCarpeta = nuevaCarpeta;
  const registrarLibro = (libro, carpeta, duenio) => {
    e.libros.set(libro.id, libro);
    const a = new Archivo({ nombre: libro.nombre, tipo: MIME_HOJA, carpeta, entorno: e, propietario: duenio });
    a.id = libro.id;
    libro.propietario = a.propietario;
    if (carpeta) carpeta.archivos.add(a);
    e.archivos.set(a.id, a);
    return libro;
  };
  e.activo = registrarLibro(new Libro(e, "SISCargaLectiva - Centro de datos"), e.carpetaApp);
  /* Otra hoja de cálculo en Drive (la BD anterior en las pruebas de la migración). */
  e.nuevoLibro = (nombre, carpeta = e.carpetaApp, duenio = propietario) => registrarLibro(new Libro(e, nombre), carpeta, duenio);

  const constructor = () => {
    const r = { formula: "", rangos: [] };
    const b = {
      whenFormulaSatisfied: f => { r.formula = f; return b; }, setRanges: x => { r.rangos = x; return b; },
      setBackground: () => b, setFontColor: () => b, setBold: () => b,
      build: () => ({ ...r, getBooleanCondition: () => ({ getCriteriaType: () => "CUSTOM_FORMULA", getCriteriaValues: () => [r.formula] }) })
    };
    return b;
  };
  const validacion = () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b; };
  const menu = () => { const m = { addItem: () => m, addSeparator: () => m, addSubMenu: () => m, addToUi: () => { e.ui.push(["menu"]); } }; return m; };

  e.globales = {
    Date: RelojDate,
    CacheService: { getScriptCache: () => cache, getDocumentCache: () => cacheDocumento },
    PropertiesService: { getScriptProperties: () => ({
      getProperties: () => ({ ...e.propiedades }),
      getProperty: k => (k in e.propiedades ? e.propiedades[k] : null),
      setProperty: (k, v) => { e.propiedades[k] = String(v); },
      deleteProperty: k => { delete e.propiedades[k]; }
    }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => e.usuario }),
      getEffectiveUser: () => ({ getEmail: () => e.efectivo || e.usuario })
    },
    /* e.candadoOcupado simula que otra ejecución tiene el candado del script. */
    LockService: { getScriptLock: () => ({ tryLock: () => !e.candadoOcupado, waitLock: () => {}, releaseLock: () => {}, hasLock: () => !e.candadoOcupado }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => e.activo,
      openById: id => { e.cuentas.sheets++; const l = e.libros.get(id); if (!l) throw new Error("No existe la hoja " + id); return l; },
      flush: () => {},
      newConditionalFormatRule: constructor,
      newDataValidation: validacion,
      BooleanCriteria: { CUSTOM_FORMULA: "CUSTOM_FORMULA" },
      ProtectionType: { SHEET: "SHEET" },
      BorderStyle: { SOLID: "SOLID" },
      getUi: () => ({
        createMenu: menu, ButtonSet: { OK: "OK" },
        alert: (...a) => { e.ui.push(["alert", ...a]); },
        showSidebar: x => { e.ui.push(["barra", x]); },
        showModalDialog: (x, titulo) => { e.ui.push(["dialogo", titulo]); }
      })
    },
    DriveApp: {
      createFolder: nombre => nuevaCarpeta(nombre, e.raiz),
      getRootFolder: () => e.raiz,
      getFolderById: id => { e.cuentas.drive++; const c = e.carpetas.get(id); if (!c) throw new Error("No existe la carpeta " + id); return c; },
      getFileById: id => { e.cuentas.drive++; const a = e.archivos.get(id); if (!a) throw new Error("No existe el archivo " + id); return a; }
    },
    ScriptApp: { getService: () => ({ getUrl: () => e.urlApp || null }) },
    Utilities: {
      unzip: blob => Object.entries(descomprimir(blob.bytes)).map(([nombre, bytes]) => new Blob(bytes, nombre)),
      newBlob: (bytes, tipo, nombre) => new Blob(Buffer.from(bytes), nombre),
      base64Decode: t => Buffer.from(t, "base64"),
      formatDate: formatearFecha,
      sleep: () => {}
    },
    MimeType: { GOOGLE_SHEETS: MIME_HOJA, MICROSOFT_EXCEL: MIME_XLSX, GOOGLE_APPS_SCRIPT: "application/vnd.google-apps.script", FOLDER: "application/vnd.google-apps.folder" },
    Logger: { log: t => e.registro.push(String(t)) },
    HtmlService: {
      createTemplateFromFile: nombre => plantilla(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8")),
      createHtmlOutputFromFile: nombre => salida(fs.readFileSync(path.join(RAIZ, nombre + ".html"), "utf8"))
    }
  };

  /* Plantillas de HtmlService: solo <?!= expr ?> y <?= expr ?>, que es lo que usan Index.html
     y las pantallas. Como en Apps Script, las expresiones ven las funciones globales del
     servidor que usan las plantillas (include_ e icono_). */
  function plantilla(texto) {
    const t = {
      evaluate() {
        const html = texto.replace(/<\?(!?=)\s*([\s\S]*?)\s*\?>/g, (m, tipo, expr) => {
          const v = String(new Function(...Object.keys(t), "include_", "icono_", "return (" + expr + ");")(...Object.values(t), e.ctx.include_, e.ctx.icono_));
          return tipo === "!=" ? v : v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        });
        return salida(html);
      }
    };
    Object.defineProperty(t, "evaluate", { enumerable: false });
    return t;
  }
  function salida(html) {
    const o = { titulo: "", getContent: () => html, setTitle(x) { o.titulo = x; return o; }, addMetaTag() { return o; }, setXFrameOptionsMode() { return o; }, setWidth() { return o; }, setHeight() { return o; } };
    return o;
  }

  /* Sube un archivo a una carpeta, como si se arrastrara en Drive. */
  e.subir = (carpeta, nombre, bytes, { tipo = MIME_XLSX, fecha, propietario: duenio } = {}) => {
    const a = new Archivo({ nombre, tipo, bytes, fecha, carpeta, entorno: e, propietario: duenio });
    carpeta.archivos.add(a);
    e.archivos.set(a.id, a);
    return a;
  };
  e.hoja = nombre => e.libros.get(e.propiedades.SIS_BD_ID).getSheetByName(nombre);
  /* Pone una pestaña de la hoja del sistema con esas celdas (la crea si falta). */
  e.pestana = (nombre, filas) => (e.activo.getSheetByName(nombre) || e.activo.insertSheet(nombre)).poner(filas);
  return e;
}

/* Los Excel de ejemplo de docs/archivos, como las pestañas de la hoja del sistema que salen
   de ellos (lo que hacía «Traer datos» del Centro de datos). */
const lector = cargar(["pruebas/LectorXlsx.js"]);
export const PESTANAS_EJEMPLO = {
  carrera: ["Oferta - ", XLSX_CARRERA],
  departamento: ["Carga - ", XLSX_DEPARTAMENTO],
  docentes: ["Docentes - ", XLSX_DOCENTES]
};
export function librosEjemplo(tipo) {
  return plano(lector.leerLibroXlsx_(partesXlsx(PESTANAS_EJEMPLO[tipo][1])));
}
export function cargarPestanasEjemplo(e, { carrera = true, departamento = true, docentes = true } = {}) {
  Object.entries({ carrera, departamento, docentes }).filter(([, si]) => si).forEach(([tipo]) => {
    librosEjemplo(tipo).forEach(h => e.pestana(PESTANAS_EJEMPLO[tipo][0] + h.nombre, h.filas.map(f => (f || []).map(c => c == null ? "" : c))));
  });
}

/* En orden alfabético por ruta, como los sube clasp: Dominio no depende del orden (comun/Dominio.js). */
const ARCHIVOS_SERVIDOR = archivosApp(".js");

/* Carga todo el servidor en un contexto con los servicios falsos. */
export function cargarServidor(entorno) {
  const ctx = cargar(ARCHIVOS_SERVIDOR, entorno.globales);
  entorno.ctx = ctx;
  return ctx;
}

/* Cada llamada de google.script.run es una ejecución nueva: se vacían las cachés
   globales y se fija la cuenta que llama. En la app web, la cuenta efectiva es la
   propietaria (USER_DEPLOYING); en la hoja (opciones.enHoja), la misma que llama. */
export function ejecutarCrudo(entorno, usuario, funcion, ...args) {
  const ctx = entorno.ctx;
  entorno.usuario = usuario;
  entorno.efectivo = entorno.enHoja ? usuario : entorno.propietario;
  ctx.configCache_ = null; ctx.libroBdCache_ = null; ctx.usuarioCache_ = null; ctx.hojasCache_ = null;
  const r = ctx[funcion](...args.map(a => (a === undefined ? a : plano(a))));
  return r === undefined ? r : plano(r);
}

/* Las funciones públicas (las que puede llamar el navegador) responden con el contrato
   {ok, datos} / {ok:false, codigo, mensaje, detalle} de Respuesta.js. ejecutar() lo
   desenvuelve como hace invocar() en el navegador: devuelve los datos o lanza un error con
   el código. doGet, instalar, los disparadores y el menú de la hoja no siguen el contrato. */
const SIN_CONTRATO = ["doGet", "instalar", "onOpen", "onEdit", "menuAbrirPanel", "menuActualizarRevision", "menuInstalar", "menuTraerBdAnterior", "menuLimpiarCarpeta"];

/* Para comprobar un fallo previsto: devuelve {codigo, mensaje, detalle} o falla si salió bien. */
export function ejecutarFallo(entorno, usuario, funcion, ...args) {
  const r = ejecutarCrudo(entorno, usuario, funcion, ...args);
  if (!r || r.ok !== false) throw new Error(funcion + " debía fallar y respondió " + JSON.stringify(r));
  return r;
}
export function ejecutar(entorno, usuario, funcion, ...args) {
  const r = ejecutarCrudo(entorno, usuario, funcion, ...args);
  if (funcion.endsWith("_") || SIN_CONTRATO.includes(funcion)) return r;
  if (!r || typeof r.ok !== "boolean") throw new Error(funcion + " no respondió con el contrato {ok, …}: " + JSON.stringify(r));
  if (r.ok) return r.datos;
  throw Object.assign(new Error(r.mensaje), { codigo: r.codigo, detalle: r.detalle });
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
