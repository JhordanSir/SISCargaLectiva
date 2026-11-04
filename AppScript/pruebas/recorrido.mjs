/* Recorrido de los dos CU en Chrome y entorno de pruebas.

     node AppScript/pruebas/recorrido.mjs                 contra la vista previa local (servidor falso)
     node AppScript/pruebas/recorrido.mjs --dev <URL>     contra /dev, con la sesión de Google de un
                                                          perfil de Chrome propio (ver README)

   Chrome: la ruta de la variable CHROME o la instalación habitual de Windows. Controla el
   navegador con el protocolo DevTools (WebSocket de Node), sin dependencias.

   También exporta lo que usa logica.test.mjs: crearEntorno (Apps Script falso en memoria con
   Index.js, PlanDeCiclo.js y CargaDocente.js cargados en un mismo ámbito global, como en Apps
   Script), leerXlsx y aTsv (los Excel de ejemplo de docs/archivos como texto copiado de Excel)
   e iniciarServidorLocal (la página con google.script.run atendido por el entorno falso). */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARCHIVOS = path.resolve(RAIZ, "..", "docs", "archivos");
export const ARCHIVOS_JS = ["Index.js", "PlanDeCiclo.js", "CargaDocente.js"];

/* ===================== Excel de ejemplo ===================== */

/**
 * Hojas de un .xlsx como filas de texto: [{ nombre, filas: string[][] }].
 * @param {string} ruta
 */
export function leerXlsx(ruta) {
  const partes = descomprimir(fs.readFileSync(ruta));
  const texto = x => x.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");
  const atributos = s => Object.fromEntries([...s.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], texto(m[2])]));
  const compartidas = [...(partes["xl/sharedStrings.xml"] || "").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => texto(t[1])).join(""));
  const estilos = leerEstilos(partes["xl/styles.xml"] || "");
  const rels = {};
  for (const m of (partes["xl/_rels/workbook.xml.rels"] || "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = atributos(m[1]);
    rels[a.Id] = a.Target.replace(/^\/?xl\//, "").replace(/^\//, "");
  }
  return [...partes["xl/workbook.xml"].matchAll(/<sheet\b([^>]*)\/?>/g)].map(m => {
    const a = atributos(m[1]);
    const xml = partes["xl/" + rels[a["r:id"]]] || "";
    const filas = [];
    for (const f of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const c of f[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ac = atributos(c[1]);
        const ref = /^([A-Z]+)(\d+)$/.exec(ac.r);
        const col = [...ref[1]].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
        const fi = +ref[2] - 1;
        const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || "");
        const inline = /<is>([\s\S]*?)<\/is>/.exec(c[2] || "");
        let valor = "";
        if (ac.t === "s" && v) valor = compartidas[+v[1]];
        else if (ac.t === "inlineStr" && inline) valor = [...inline[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => texto(t[1])).join("");
        else if (v && (ac.t === undefined || ac.t === "n") && isFinite(+v[1]))
          valor = estilos[+(ac.s || 0)] ? formatearFecha(+v[1], estilos[+ac.s]) : String(parseFloat((+v[1]).toPrecision(11)));
        else if (v) valor = texto(v[1]);
        while (filas.length <= fi) filas.push([]);
        while (fila.length < col) fila.push("");
        fila[col] = valor;
        filas[fi] = fila;
      }
    }
    return { nombre: a.name, filas: filas.map(f => f || []) };
  });
}

/* Lo que muestra Excel en una celda numérica: General, o la fecha si el estilo es de fecha
   (como «1-2» escrito en SEMESTRE, que Excel guarda como 1 de febrero con formato «d-m»). */
const FECHAS_PREDEFINIDAS = { 14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 22: "m/d/yy h:mm" };
function leerEstilos(xml) {
  const formatos = Object.fromEntries([...xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)]
    .map(m => [m[1], m[2].replace(/&quot;/g, "\"").replace(/&amp;/g, "&")]));
  const xfs = (/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml) || [])[1] || "";
  return [...xfs.matchAll(/<xf\b([^>]*?)\/?>/g)].map(m => {
    const id = (/numFmtId="(\d+)"/.exec(m[1]) || [])[1] || "0";
    const codigo = formatos[id] ?? FECHAS_PREDEFINIDAS[id];
    return codigo && /[dmy]/i.test(codigo.replace(/"[^"]*"|\[[^\]]*\]|\./g, "")) ? codigo : null;
  });
}
function formatearFecha(serial, codigo) {
  const f = new Date(Math.round((serial - 25569) * 864e5));
  const meses = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dos = n => String(n).padStart(2, "0");
  return codigo.split(";")[0].replace(/"([^"]*)"|\\(.)|\[[^\]]*\]|yyyy|yy|mmm|mm|m|dd|d/gi, (t, lit, esc) => {
    if (lit !== undefined) return lit;
    if (esc !== undefined) return esc;
    switch (t.toLowerCase()) {
      case "yyyy": return String(f.getUTCFullYear());
      case "yy": return dos(f.getUTCFullYear() % 100);
      case "mmm": return meses[f.getUTCMonth()];
      case "mm": return dos(f.getUTCMonth() + 1);
      case "m": return String(f.getUTCMonth() + 1);
      case "dd": return dos(f.getUTCDate());
      case "d": return String(f.getUTCDate());
    }
    return "";
  });
}

function descomprimir(buf) {
  let fin = buf.length - 22;
  while (buf.readUInt32LE(fin) !== 0x06054b50) fin--;
  const partes = {};
  let p = buf.readUInt32LE(fin + 16);
  for (let i = buf.readUInt16LE(fin + 10); i > 0; i--) {
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), ln = buf.readUInt16LE(p + 28);
    const nombre = buf.toString("utf8", p + 46, p + 46 + ln), local = buf.readUInt32LE(p + 42);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.subarray(ini, ini + tam);
    if (/\.(xml|rels)$/.test(nombre)) partes[nombre] = (metodo === 0 ? datos : zlib.inflateRawSync(datos)).toString("utf8");
    p += 46 + ln + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return partes;
}

/** Filas como las copia Excel al portapapeles: tabulaciones, y comillas si la celda tiene saltos. */
export function aTsv(filas) {
  return filas.map(f => f.map(c => /[\t\n"]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c)).join("\t")).join("\r\n");
}

/** Hoja de un Excel de ejemplo: hoja("CargaXCarrera", "Ing. Software"). */
export function hojaEjemplo(libro, nombre) {
  const h = leerXlsx(path.join(ARCHIVOS, "SISCargaLectiva-Ejemplo-" + libro + ".xlsx")).find(x => x.nombre === nombre);
  if (!h) throw new Error("No existe la hoja " + nombre + " en " + libro);
  return h.filas;
}

/* ===================== Apps Script falso ===================== */

const DIMENSION_INICIAL = 1000;
const MAX_CELDA = 50000;

class RangoFalso {
  constructor(hoja, fila, col, nf, nc) {
    if (fila < 1 || col < 1 || nf < 1 || nc < 1) throw new Error("Rango inválido: " + [fila, col, nf, nc].join(","));
    if (fila + nf - 1 > hoja.maxFilas || col + nc - 1 > hoja.maxCols)
      throw new Error("The coordinates of the range are outside the dimensions of the sheet.");
    Object.assign(this, { hoja, fila, col, nf, nc });
  }
  getValues() { return this.getDisplayValues(); }
  getDisplayValues() {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const f = this.hoja.datos[this.fila - 1 + i] || [];
      out.push(Array.from({ length: this.nc }, (_, j) => f[this.col - 1 + j] ?? ""));
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(valores) {
    if (!Array.isArray(valores) || valores.length !== this.nf || valores.some(f => !Array.isArray(f) || f.length !== this.nc))
      throw new Error("The number of rows or columns in the data does not match the range.");
    valores.forEach((f, i) => f.forEach((v, j) => this.hoja.escribir(this.fila + i, this.col + j, v)));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  clearContent() { return this.setValues(Array.from({ length: this.nf }, () => Array(this.nc).fill(""))); }
}

class HojaFalsa {
  constructor(nombre, filas) {
    this.nombre = nombre;
    this.datos = filas.map(f => f.map(String));
    this.maxFilas = Math.max(DIMENSION_INICIAL, this.datos.length);
    this.maxCols = Math.max(26, ...this.datos.map(f => f.length));
  }
  escribir(fila, col, v) {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.length > MAX_CELDA) throw new Error("Your input contains more than the maximum of 50000 characters in a single cell.");
    if (/^=/.test(s)) throw new Error("Prueba: se escribió una fórmula en la hoja (" + s.slice(0, 30) + "). Usa apóstrofo.");
    while (this.datos.length < fila) this.datos.push([]);
    const f = this.datos[fila - 1];
    while (f.length < col) f.push("");
    f[col - 1] = s.replace(/^'/, "");
  }
  getName() { return this.nombre; }
  getLastRow() {
    for (let i = this.datos.length; i > 0; i--) if (this.datos[i - 1].some(c => c !== "")) return i;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.datos.map(f => { let n = f.length; while (n && f[n - 1] === "") n--; return n; })); }
  getMaxRows() { return this.maxFilas; }
  getMaxColumns() { return this.maxCols; }
  getDataRange() { return new RangoFalso(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(fila, col, nf = 1, nc = 1) { return new RangoFalso(this, fila, col, nf, nc); }
  appendRow(valores) {
    const fila = this.getLastRow() + 1;
    if (fila > this.maxFilas) this.maxFilas = fila;
    valores.forEach((v, j) => this.escribir(fila, j + 1, v));
    return this;
  }
  deleteRow(fila) {
    if (fila < 2 || fila > this.maxFilas) throw new Error("Fila fuera de la hoja: " + fila);
    if (this.maxFilas - 1 <= 1) throw new Error("Sorry, it is not possible to delete all non-frozen rows.");
    this.datos.splice(fila - 1, 1);
    this.maxFilas--;
    return this;
  }
  setFrozenRows() { return this; }
}

/** Contenido inicial de la hoja, como quedó tras la fase 1, con cuentas de prueba añadidas. */
export function hojasBase() {
  return {
    Usuarios: [["correo", "rol", "carreras", "departamento"],
      ["mfloresl@ulasalle.edu.pe", "coordinador", "ING"],
      ["fmaresg@ulasalle.edu.pe", "director", "", "DIMA"],
      ["jhuamanih@ulasalle.edu.pe", "coordinador", "ING"],
      ["jortizc@ulasalle.edu.pe", "coordinador", "ING"],
      ["afrontadof@ulasalle.edu.pe", "director", "ING"],
      ["aarenasc@ulasalle.edu.pe", "director", "ING"],
      ["coord.todas@ulasalle.edu.pe", "coordinador", "ADM, DER, ING, ICO, COM, PSI, ARQ, IND"],
      ["coord.adm@ulasalle.edu.pe", "coordinador", "ADM"],
      ["dir.dacj@ulasalle.edu.pe", "director", "", "DACJ"],
      ["dir.dahuc@ulasalle.edu.pe", "director", "", "DAHUC"],
      ["dir.dacte@ulasalle.edu.pe", "director", "", "DACTE"],
      ["sinrol@ulasalle.edu.pe", "invitado", ""]],
    Ciclos: [["ciclo"], ["2026-1"], ["2026-2"]],
    Carreras: [["sigla", "nombre", "departamento"],
      ["ADM", "Administración de Negocios Internacionales", "DACTE"], ["DER", "Derecho", "DACJ"],
      ["ING", "Ingeniería de Software", "DIMA"], ["ICO", "Ingeniería Comercial", "DIMA"],
      ["COM", "Ciencias de la Comunicación", "DAHUC"], ["PSI", "Psicología", "DAHUC"],
      ["ARQ", "Arquitectura", "DIMA"], ["IND", "Ingeniería Industrial", "DIMA"]],
    Docentes: [["DOCENTE", "DEPARTAMENTO", "CONDICION", "DEDICACION", "CARGO", "TC_OTRA_UNIV", "NO_LECTIVAS"],
      ["ALATRISTA CORRALES ARTURO", "DACTE", "Ordinario", "TP"], ["ALFARO BEJARANO JULIO CARLO", "DIMA", "Contratado", "TC"],
      ["ALVAREZ BUSTIOS JOSÉ CARLOS", "DACTE", "Contratado", "TP"], ["APAZA VALDIVIA ADELUZ", "DIMA", "Ordinario", "TP"],
      ["ARAMAYO VARGAS MARÍA CECILIA", "DACJ", "Ordinario", "TC"], ["ARDILES ZEBALLOS LUIS ALBERT", "DACJ", "Contratado", "TP"],
      ["CHÁVEZ CONTRERAS ÁNGEL EVARISTO", "DAHUC", "Ordinario", "TC"], ["DÍAZ TORRES JOHN ELVIS", "DAHUC", "Contratado", "TP"],
      ["FLORES PARRA JOSUE MIGUEL", "DIMA", "Contratado", "TP"], ["LOPEZ MEDINA BRUNO FERNANDO", "DACTE", "Contratado", "TC"],
      ["LÜTGENS ZERECEDA CÉSAR ADOLFO", "DACTE", "Contratado", "TP"], ["ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN", "DIMA", "Contratado", "TP"]],
    Planes: [["ciclo", "carrera", "version", "usuario", "fecha", "contenido"]],
    Cargas: [["ciclo", "carrera", "version", "usuario", "fecha", "motivo", "contenido"]],
    Bloqueos: [["cu", "ciclo", "carrera", "correo", "vence"]]
  };
}

/**
 * Apps Script falso con los .js de la app cargados en un mismo ámbito global.
 *   const e = crearEntorno({ usuario: "mfloresl@ulasalle.edu.pe" });
 *   e.llamar("planInicio", "2026-1")   como google.script.run (copia el resultado por JSON)
 *   e.como("fmaresg@ulasalle.edu.pe")  cambia la cuenta activa
 *   e.avanzar(31 * 60000)              adelanta el reloj que ve la app
 *   e.hojas.Planes.datos               filas de una pestaña
 * @param {{usuario?: string, hojas?: Object<string, string[][]>, archivos?: string[]}} [op]
 */
export function crearEntorno(op = {}) {
  const hojas = {};
  for (const [n, filas] of Object.entries(op.hojas || hojasBase())) hojas[n] = new HojaFalsa(n, filas);
  const estado = { usuario: op.usuario || "", desfase: 0, candado: 0 };
  const FechaReal = Date;
  class FechaFalsa extends FechaReal {
    constructor(...a) { if (a.length) super(...a); else super(FechaReal.now() + estado.desfase); }
    static now() { return FechaReal.now() + estado.desfase; }
  }
  const libro = {
    getSheetByName: n => hojas[n] || null,
    getSheets: () => Object.values(hojas),
    insertSheet: n => (hojas[n] = new HojaFalsa(n, [])),
    getId: () => "libro-falso"
  };
  const salida = contenido => {
    const o = { getContent: () => contenido, setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: () => o, getTitle: () => "" };
    return o;
  };
  const leerHtml = n => fs.readFileSync(path.join(RAIZ, n + ".html"), "utf8");
  const ctx = vm.createContext({
    console,
    Date: FechaFalsa,
    Session: { getActiveUser: () => ({ getEmail: () => estado.usuario }), getEffectiveUser: () => ({ getEmail: () => "dueno@ulasalle.edu.pe" }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, getActive: () => libro, openById: () => libro },
    LockService: {
      getScriptLock: () => ({
        waitLock() { estado.candado++; }, tryLock() { estado.candado++; return true; },
        releaseLock() { estado.candado = Math.max(0, estado.candado - 1); }, hasLock: () => estado.candado > 0
      })
    },
    HtmlService: {
      createHtmlOutputFromFile: n => salida(leerHtml(n)),
      createTemplateFromFile: n => ({
        evaluate: () => salida(leerHtml(n).replace(/<\?!?=([\s\S]*?)\?>/g, (_, js) => String(vm.runInContext(js, ctx))))
      }),
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL", DEFAULT: "DEFAULT" }
    },
    Utilities: {
      formatDate: () => { throw new Error("Prueba: usa la fecha de Perú calculada a mano, no Utilities.formatDate."); },
      getUuid: () => "u" + Math.random().toString(36).slice(2, 12)
    }
  });
  for (const archivo of op.archivos || ARCHIVOS_JS)
    vm.runInContext(fs.readFileSync(path.join(RAIZ, archivo), "utf8"), ctx, { filename: archivo });
  return {
    ctx, hojas, estado,
    como(correo) { estado.usuario = correo; return this; },
    avanzar(ms) { estado.desfase += ms; return this; },
    /** Como google.script.run: solo funciones públicas (sin «_») y el resultado pasa por JSON. */
    llamar(nombre, ...args) {
      if (/_$/.test(nombre) || typeof ctx[nombre] !== "function") throw new Error("Script function not found: " + nombre);
      const r = ctx[nombre](...JSON.parse(JSON.stringify(args)));
      if (estado.candado) throw new Error("Prueba: " + nombre + " dejó tomado el candado del script.");
      return r === undefined ? null : JSON.parse(JSON.stringify(r));
    }
  };
}

/* ===================== Vista previa local ===================== */

/** google.script.run del navegador, atendido por POST /rpc. */
const PUENTE = `<script>
(function () {
  var cuenta = new URLSearchParams(location.search).get("usuario") || "";
  function nuevo() {
    var exito = function () {}, falla = function () {};
    var p = new Proxy({}, { get: function (_, k) {
      if (k === "withSuccessHandler") return function (f) { exito = f; return p; };
      if (k === "withFailureHandler") return function (f) { falla = f; return p; };
      if (k === "withUserObject") return function () { return p; };
      return function () {
        var args = Array.prototype.slice.call(arguments);
        fetch("/rpc", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fn: k, args: args, usuario: cuenta }) })
          .then(function (r) { return r.json(); })
          .then(function (r) { if (r.falla) falla(new Error(r.falla)); else exito(r.valor); }, function (e) { falla(e); });
      };
    } });
    return p;
  }
  window.google = { script: {} };
  Object.defineProperty(window.google.script, "run", { get: nuevo });
})();
</script>`;

/**
 * Sirve la página en http://127.0.0.1:<puerto>/?usuario=<correo> con el entorno falso.
 * @param {{puerto?: number, entorno?: ReturnType<typeof crearEntorno>, latencia?: number}} [op]
 */
export function iniciarServidorLocal(op = {}) {
  const entorno = op.entorno || crearEntorno();
  const latencia = op.latencia ?? 250;
  const servidor = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/rpc") {
      let cuerpo = "";
      req.on("data", d => (cuerpo += d));
      req.on("end", () => {
        const { fn, args, usuario } = JSON.parse(cuerpo);
        let r;
        try { entorno.como(usuario); r = { valor: entorno.llamar(fn, ...args) }; }
        catch (e) { r = { falla: e.message }; }
        setTimeout(() => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(r)); }, latencia);
      });
      return;
    }
    if (req.method === "GET" && /^\/(\?|$)/.test(req.url)) {
      entorno.como(new URL(req.url, "http://x").searchParams.get("usuario") || "");
      const html = entorno.ctx.doGet().getContent().replace("<head>", "<head>" + PUENTE);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise(ok => servidor.listen(op.puerto ?? 8765, "127.0.0.1", () => ok({ servidor, entorno, url: "http://127.0.0.1:" + servidor.address().port + "/" })));
}

/* ===================== Recorrido en Chrome ===================== */

async function principal() {
  const local = await iniciarServidorLocal({ puerto: +(process.env.PUERTO || 8765) });
  console.log("Vista previa local en " + local.url + "?usuario=mfloresl@ulasalle.edu.pe (Ctrl+C para salir)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal().catch(e => { console.error(e); process.exit(1); });
}
