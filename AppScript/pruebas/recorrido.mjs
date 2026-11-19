/* Recorrido de los dos CU en Chrome y entorno de pruebas.

     node AppScript/pruebas/recorrido.mjs                 contra la vista previa local (servidor falso)
     node AppScript/pruebas/recorrido.mjs --dev <URL>     contra /dev, con la sesión de Google de un
                                                          perfil de Chrome propio (ver README)
     node AppScript/pruebas/recorrido.mjs --servidor      solo la vista previa local, en el puerto 8765

   Chrome: la ruta de la variable CHROME o la instalación habitual de Windows. Controla el
   navegador con el protocolo DevTools (WebSocket de Node), sin dependencias.

   También exporta lo que usa logica.test.mjs: crearEntorno (Apps Script falso en memoria con
   Index.js, PlanDeCiclo.js, CargaDocente.js y Parametros.js cargados en un mismo ámbito global, como
   en Apps Script), apiFalsa (el servicio REST de Spring Boot de backend/, en memoria, que atiende
   UrlFetchApp), leerXlsx y aTsv (los Excel de ejemplo de docs/archivos como texto copiado de Excel)
   e iniciarServidorLocal (la página con google.script.run atendido por el entorno falso). */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ARCHIVOS = path.resolve(RAIZ, "..", "docs", "archivos");
export const ARCHIVOS_JS = ["Index.js", "PlanDeCiclo.js", "CargaDocente.js", "Parametros.js"];

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
   (como "1-2" escrito en SEMESTRE, que Excel guarda como 1 de febrero con formato "d-m"). */
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
  /** Anota las filas que quedan con formato de texto (@): las pruebas comprueban que las filas nuevas lo tengan. */
  setNumberFormat(formato) {
    if (formato === "@") for (let i = 0; i < this.nf; i++) this.hoja.conTexto.add(this.fila + i);
    return this;
  }
  clearContent() { return this.setValues(Array.from({ length: this.nf }, () => Array(this.nc).fill(""))); }
}

class HojaFalsa {
  constructor(nombre, filas) {
    this.nombre = nombre;
    this.datos = filas.map(f => f.map(String));
    this.maxFilas = Math.max(DIMENSION_INICIAL, this.datos.length);
    this.maxCols = Math.max(26, ...this.datos.map(f => f.length));
    this.conTexto = new Set();   /* filas con formato de texto (@) */
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
    this.conTexto = new Set([...this.conTexto].filter(n => n !== fila).map(n => (n > fila ? n - 1 : n)));
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
 * El servicio REST de Spring Boot (backend/) en memoria, con los mismos datos, rutas, validaciones y mensajes
 * (una muestra de los planes de estudio y las líneas de investigación). Lo usa el UrlFetchApp falso de crearEntorno.
 *   const api = apiFalsa();
 *   api("GET", "https://x/api/parametros")                     → { codigo: 200, cuerpo: [...] }
 *   api("PUT", "https://x/api/parametros/MAX_HORAS_DOCENTE", { valor: "42", usuario: "…" })
 * @returns {(metodo: string, url: string, cuerpo?: Object) => {codigo: number, cuerpo: *}}
 */
export function apiFalsa() {
  const P = (clave, valor, tipo, unidad, grupo, descripcion, editable = true) =>
    ({ clave, valor, tipo, unidad, grupo, descripcion, editable, actualizadoPor: "sistema", fechaActualizacion: "2026-11-01T08:00:00-05:00" });
  const parametros = [
    P("MIN_HORAS_DOCENTE", "8", "ENTERO", "horas", "HORAS", "Mínima cantidad de horas lectivas que debe dictar un docente en el ciclo."),
    P("MAX_HORAS_DOCENTE", "40", "ENTERO", "horas", "HORAS", "Máxima cantidad de horas lectivas que puede dictar un docente (regla A07: más de esto impide guardar)."),
    P("MAX_HORAS_ORDINARIO", "24", "ENTERO", "horas", "HORAS", "Horas a partir de las cuales se advierte que un docente ordinario tiene demasiada carga (regla A09)."),
    P("MAX_HORAS_CON_CARGO", "24", "ENTERO", "horas", "HORAS", "Horas máximas de un docente con cargo; por encima se exige un motivo (regla A12)."),
    P("AVISO_HORAS_CON_CARGO", "20", "ENTERO", "horas", "HORAS", "Horas a partir de las cuales se avisa que un docente con cargo se acerca al máximo (regla A12)."),
    P("CICLO_VIGENTE", "2026-2", "CICLO", "", "CICLO", "Ciclo académico actual (formato AAAA-1 o AAAA-2)."),
    P("FECHA_INICIO_CICLO", "2026-08-17", "FECHA", "", "CICLO", "Fecha de inicio de clases del ciclo vigente."),
    P("FECHA_LIMITE_PLAN", "2026-07-10", "FECHA", "", "CICLO", "Último día para que el Coordinador registre el plan de ciclo (CU-001)."),
    P("FECHA_LIMITE_CARGA", "2026-07-31", "FECHA", "", "CICLO", "Último día para que el Director asigne docentes al plan de ciclo (CU-002)."),
    P("MINUTOS_BLOQUEO", "30", "ENTERO", "minutos", "SISTEMA", "Minutos sin actividad tras los que vence el bloqueo de edición de una carrera."),
    P("NOMBRE_INSTITUCION", "Universidad La Salle", "TEXTO", "", "SISTEMA", "Nombre de la institución que se muestra en la aplicación."),
    P("DOMINIO_PERMITIDO", "@ulasalle.edu.pe", "TEXTO", "", "SISTEMA", "Dominio de las cuentas de Google que pueden entrar a la aplicación.", false),
    P("MAX_CARACTERES_CELDA", "50000", "ENTERO", "caracteres", "SISTEMA", "Límite de Google Sheets para una celda: cada versión de un plan o carga debe caber en él.", false)
  ];
  const catalogos = {
    carreras: [
      ["ING", "Ingeniería de Software", "FIA", "DIMA", 10], ["IND", "Ingeniería Industrial", "FIA", "DIMA", 10],
      ["ARQ", "Arquitectura", "FIA", "DIMA", 10], ["ICO", "Ingeniería Comercial", "FIA", "DIMA", 10],
      ["ADM", "Administración de Negocios Internacionales", "FCE", "DACTE", 10], ["DER", "Derecho", "FDE", "DACJ", 12],
      ["COM", "Ciencias de la Comunicación", "FHU", "DAHUC", 10], ["PSI", "Psicología", "FHU", "DAHUC", 10]
    ].map(([id, nombre, facultadId, departamento, duracionSemestres]) => ({ id, nombre, facultadId, departamento, duracionSemestres })),
    facultades: [
      ["FIA", "Facultad de Ingenierías y Arquitectura", "DIMA"], ["FCE", "Facultad de Ciencias Empresariales", "DACTE"],
      ["FDE", "Facultad de Derecho", "DACJ"], ["FHU", "Facultad de Humanidades", "DAHUC"]
    ].map(([id, nombre, departamento]) => ({ id, sigla: id, nombre, departamento })),
    planesEstudio: [
      ["ING-2018", "ING", "Plan de estudios 2018 · Ingeniería de Software", 2018, false, 210, 10],
      ["ING-2023", "ING", "Plan de estudios 2023 · Ingeniería de Software", 2023, true, 220, 10],
      ["DER-2018", "DER", "Plan de estudios 2018 · Derecho", 2018, false, 236, 12],
      ["DER-2023", "DER", "Plan de estudios 2023 · Derecho", 2023, true, 244, 12]
    ].map(([id, carreraId, nombre, anio, vigente, creditosTotales, cantidadSemestres]) => ({ id, carreraId, nombre, anio, vigente, creditosTotales, cantidadSemestres })),
    lineasInvestigacion: [
      ["LI-ING-01", "ING", "Ingeniería de software y calidad", "Procesos de desarrollo, pruebas y mantenimiento de software."],
      ["LI-ING-02", "ING", "Inteligencia artificial y ciencia de datos", "Aprendizaje automático, análisis de datos y sistemas inteligentes."],
      ["LI-DER-01", "DER", "Derecho constitucional y derechos humanos", "Garantías constitucionales y protección de derechos fundamentales."],
      ["LI-DER-02", "DER", "Derecho empresarial", "Regulación de sociedades, contratos y competencia."]
    ].map(([id, carreraId, nombre, descripcion]) => ({ id, carreraId, nombre, descripcion }))
  };
  const error = (codigo, mensaje) => ({ codigo, cuerpo: { error: mensaje } });
  return (metodo, url, cuerpo) => {
    const ruta = decodeURIComponent(new URL(url).pathname);
    let m;
    if (metodo === "GET" && ruta === "/api/parametros") return { codigo: 200, cuerpo: parametros };
    if (metodo === "GET" && ruta === "/api/catalogos") return { codigo: 200, cuerpo: catalogos };
    if (metodo === "GET" && (m = /^\/api\/catalogos\/([^/]+)$/.exec(ruta)))
      return catalogos[m[1]] ? { codigo: 200, cuerpo: catalogos[m[1]] }
        : error(404, "No existe el catálogo \"" + m[1] + "\". Tipos válidos: carreras, facultades, planesEstudio, lineasInvestigacion.");
    if (metodo === "PUT" && (m = /^\/api\/parametros\/([^/]+)$/.exec(ruta))) {
      const clave = m[1], p = parametros.find(x => x.clave === clave);
      if (!p) return error(404, "No existe el parámetro " + clave + ".");
      if (!p.editable) return error(400, "El parámetro " + clave + " es de solo lectura.");
      if (!cuerpo) return error(400, "El cuerpo debe ser un JSON como { \"valor\": \"42\", \"usuario\": \"correo\" }.");
      let valor = String(cuerpo.valor ?? "").trim();
      if (!valor) return error(400, "Falta el valor de " + clave + ".");
      if (p.tipo === "ENTERO") {
        /* Como Integer.parseInt de Java: signo opcional y dentro de un int de 32 bits; luego, mayor o igual a 0. */
        const n = /^[+-]?\d+$/.test(valor) ? Number(valor) : NaN;
        if (!(n >= 0 && n <= 2147483647)) return error(400, clave + " debe ser un número entero mayor o igual a 0.");
        valor = String(n);
      }
      if (p.tipo === "FECHA" && (!/^\d{4}-\d\d-\d\d$/.test(valor) || isNaN(Date.parse(valor + "T00:00:00Z")) ||
        new Date(valor + "T00:00:00Z").toISOString().slice(0, 10) !== valor))
        return error(400, clave + " debe ser una fecha válida con formato AAAA-MM-DD.");
      if (p.tipo === "CICLO" && !/^\d{4}-[12]$/.test(valor))
        return error(400, clave + " debe tener el formato AAAA-1 o AAAA-2 (por ejemplo 2027-1).");
      const num = k => Number(parametros.find(x => x.clave === k).valor);
      if (clave === "MIN_HORAS_DOCENTE" && Number(valor) > num("MAX_HORAS_DOCENTE"))
        return error(400, "MIN_HORAS_DOCENTE no puede ser mayor que MAX_HORAS_DOCENTE (" + num("MAX_HORAS_DOCENTE") + ").");
      if (clave === "MAX_HORAS_DOCENTE" && Number(valor) < num("MIN_HORAS_DOCENTE"))
        return error(400, "MAX_HORAS_DOCENTE no puede ser menor que MIN_HORAS_DOCENTE (" + num("MIN_HORAS_DOCENTE") + ").");
      Object.assign(p, { valor, actualizadoPor: String(cuerpo.usuario || "").trim() || "desconocido", fechaActualizacion: "2026-11-18T10:00:00-05:00" });
      return { codigo: 200, cuerpo: p };
    }
    return { codigo: 404, cuerpo: "<html>Not Found</html>" };
  };
}

/**
 * Apps Script falso con los .js de la app cargados en un mismo ámbito global.
 *   const e = crearEntorno({ usuario: "mfloresl@ulasalle.edu.pe" });
 *   e.llamar("planInicio", "2026-1")   como google.script.run (copia el resultado por JSON)
 *   e.como("fmaresg@ulasalle.edu.pe")  cambia la cuenta activa
 *   e.avanzar(31 * 60000)              adelanta el reloj que ve la app
 *   e.hojas.Planes.datos               filas de una pestaña
 *   e.peticiones                       lo que la app pidió con UrlFetchApp: [{ url, metodo, opciones, cuerpo }]
 * op.api reemplaza al servicio REST falso (apiFalsa): (metodo, url, cuerpo) → { codigo, cuerpo }; si lanza, fetch
 * lanza como cuando el servidor no responde.
 * @param {{usuario?: string, hojas?: Object<string, string[][]>, archivos?: string[], api?: Function}} [op]
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
  /* UrlFetchApp falso: anota cada petición y la atiende el servicio REST falso (o op.api). Como el real, con
     muteHttpExceptions distinto de true un código 4xx/5xx lanza. */
  const peticiones = [];
  const api = op.api || apiFalsa();
  const UrlFetchApp = {
    fetch(url, opciones = {}) {
      const metodo = String(opciones.method || "get").toUpperCase();
      const cuerpo = opciones.payload === undefined ? undefined : JSON.parse(opciones.payload);
      peticiones.push({ url, metodo, opciones, cuerpo });
      const r = api(metodo, url, cuerpo);
      const textoCuerpo = typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo);
      if (r.codigo >= 400 && opciones.muteHttpExceptions !== true)
        throw new Error("Request failed for " + url + " returned code " + r.codigo);
      return { getResponseCode: () => r.codigo, getContentText: () => textoCuerpo };
    }
  };
  const ctx = vm.createContext({
    UrlFetchApp,
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
    ctx, hojas, estado, peticiones,
    como(correo) { estado.usuario = correo; return this; },
    avanzar(ms) { estado.desfase += ms; return this; },
    /** Como google.script.run: solo funciones públicas (sin "_") y el resultado pasa por JSON. */
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

/* ===================== Chrome por el protocolo DevTools ===================== */

const CHROME_WINDOWS = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const dormir = ms => new Promise(r => setTimeout(r, ms));

/** Lanza Chrome y devuelve la conexión al navegador. */
async function lanzarChrome({ ventana = false, perfil, puerto = 9333 }) {
  const ejecutable = process.env.CHROME || (fs.existsSync(CHROME_WINDOWS) ? CHROME_WINDOWS : "google-chrome-stable");
  const proceso = spawn(ejecutable, [
    ...(ventana ? [] : ["--headless=new"]), "--remote-debugging-port=" + puerto, "--user-data-dir=" + perfil,
    "--no-first-run", "--no-default-browser-check", "--window-size=1280,900", "about:blank"
  ], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try {
      const v = await (await fetch("http://127.0.0.1:" + puerto + "/json/version")).json();
      return { proceso, cdp: await Cdp.conectar(v.webSocketDebuggerUrl) };
    } catch { await dormir(200); }
  }
  proceso.kill();
  throw new Error("Chrome no arrancó (define CHROME con la ruta de chrome.exe).");
}

class Cdp {
  static conectar(url) {
    const c = new Cdp();
    c.id = 0; c.pendientes = new Map(); c.oyentes = [];
    c.ws = new WebSocket(url);
    c.ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pendientes.has(m.id)) {
        const { ok, mal } = c.pendientes.get(m.id);
        c.pendientes.delete(m.id);
        m.error ? mal(new Error(m.error.message)) : ok(m.result);
      } else if (m.method) c.oyentes.forEach(f => f(m));
    };
    return new Promise((ok, mal) => { c.ws.onopen = () => ok(c); c.ws.onerror = mal; });
  }
  enviar(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((ok, mal) => this.pendientes.set(id, { ok, mal }));
  }
  cerrar() { try { this.ws.close(); } catch { /* ya cerrada */ } }
}

/**
 * Pestaña con todos sus marcos (también los de otro origen, como el de Apps Script en /dev).
 * evaluar() corre en el marco donde existe Alpine.
 */
class Pestana {
  static async abrir(cdp, url) {
    const p = new Pestana();
    Object.assign(p, { cdp, contextos: [], errores: [], sesiones: new Set() });
    cdp.oyentes.push(m => p.evento(m));
    const { targetId } = await cdp.enviar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.enviar("Target.attachToTarget", { targetId, flatten: true });
    p.sesion = sessionId;
    await p.prepararSesion(sessionId);
    await cdp.enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await cdp.enviar("Page.navigate", { url }, sessionId);
    return p;
  }
  async prepararSesion(s) {
    this.sesiones.add(s);
    await this.cdp.enviar("Runtime.enable", {}, s);
    await this.cdp.enviar("Page.enable", {}, s).catch(() => {});
    await this.cdp.enviar("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, s).catch(() => {});
  }
  evento(m) {
    const s = m.sessionId;
    if (m.method === "Target.attachedToTarget" && this.sesiones.has(s)) this.prepararSesion(m.params.sessionId).catch(() => {});
    if (!this.sesiones.has(s)) return;
    if (m.method === "Runtime.executionContextCreated") this.contextos.push({ s, id: m.params.context.id, origen: m.params.context.origin });
    if (m.method === "Runtime.executionContextDestroyed") this.contextos = this.contextos.filter(c => !(c.s === s && c.id === m.params.executionContextId));
    if (m.method === "Runtime.executionContextsCleared") { this.contextos = this.contextos.filter(c => c.s !== s); if (s === this.sesion) this.marco = null; }
    if (m.method === "Page.javascriptDialogOpening") this.cdp.enviar("Page.handleJavaScriptDialog", { accept: true }, s).catch(() => {});
    if (m.method === "Runtime.exceptionThrown") this.errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      this.errores.push(m.params.args.map(a => a.value ?? a.description ?? "").join(" "));
  }
  async ir(url) {
    this.marco = null;
    await this.cdp.enviar("Page.navigate", { url }, this.sesion);
  }
  /** Marco donde está la app (el que tiene Alpine); en /dev es el iframe de googleusercontent. */
  async buscarMarco(ms = 60000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      for (const c of [...this.contextos].reverse()) {
        try {
          const r = await this.cdp.enviar("Runtime.evaluate", { expression: "typeof Alpine === 'object' && !!document.querySelector('header.barra')", contextId: c.id, returnByValue: true }, c.s);
          if (r.result.value === true) return (this.marco = c);
        } catch { /* contexto destruido */ }
      }
      await dormir(250);
    }
    throw new Error("No apareció la app (Alpine) en la página.");
  }
  async evaluar(expresion) {
    if (!this.marco) await this.buscarMarco();
    const r = await this.cdp.enviar("Runtime.evaluate", { expression: expresion, contextId: this.marco.id, awaitPromise: true, returnByValue: true }, this.marco.s);
    if (r.exceptionDetails) throw new Error("Error en la página: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async esperar(expresion, ms = 15000, que = expresion) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      try { if (await this.evaluar(expresion)) return; } catch (e) { if (!/contexto|context/i.test(e.message)) throw e; }
      await dormir(100);
    }
    throw new Error("Tiempo agotado esperando: " + que);
  }
  async captura(ruta) {
    const { data } = await this.cdp.enviar("Page.captureScreenshot", { format: "png" }, this.sesion);
    fs.writeFileSync(ruta, Buffer.from(data, "base64"));
  }
}

/* ===================== Pasos del recorrido ===================== */

/* Ayudas que se inyectan en la página: buscar botones visibles por su texto y anotar los
   textos que muestran los botones deshabilitados (el estado de carga). */
const AYUDAS = `(() => {
  if (window.__sis) return true;
  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const texto = el => el.textContent.replace(/\\s+/g, " ").trim();
  const vistos = new Set();
  const anotar = () => document.querySelectorAll("button").forEach(b => { if (b.disabled && visible(b)) vistos.add(texto(b)); });
  new MutationObserver(anotar).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  window.__sis = {
    vistos,
    botones: (t, raiz) => [...(raiz || document).querySelectorAll("button")].filter(b => visible(b) && (texto(b) === t || texto(b).startsWith(t))),
    boton(t, raiz) { const b = this.botones(t, raiz)[0]; if (!b) throw new Error('No hay botón visible "' + t + '"'); return b; },
    fila(t) { return [...document.querySelectorAll("tr")].find(tr => visible(tr) && [...tr.cells].some(td => texto(td) === t || texto(td).split(" ")[0] === t)); },
    escribir(el, valor) { el.value = valor; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); },
    textoVisible: () => document.body.innerText
  };
  return true;
})()`;

/** Pulsa un botón que llama al servidor y comprueba que pasa por "textoCarga" y vuelve a estar habilitado. */
async function pulsarConCarga(p, textoBoton, textoCarga, { raiz = "", despues = textoBoton } = {}) {
  await p.evaluar(AYUDAS);
  const sel = `__sis.botones(${JSON.stringify(textoBoton)}${raiz ? ", " + raiz : ""}).find(b => !b.disabled)`;
  await p.esperar("!!" + sel, 15000, "\"" + textoBoton + "\" habilitado");
  await p.evaluar(`__sis.vistos.clear(); ${sel}.click(); true`);
  await p.esperar(`__sis.vistos.has(${JSON.stringify(textoCarga)})`, 10000, "\"" + textoBoton + "\" muestra \"" + textoCarga + "\"");
  await p.esperar(`!document.querySelector("button:disabled") || ![...document.querySelectorAll("button")].some(b => b.disabled && b.textContent.includes(${JSON.stringify(textoCarga)}))`,
    30000, "\"" + textoCarga + "\" termina");
  if (despues) await p.esperar(`__sis.botones(${JSON.stringify(despues)}).some(b => !b.disabled) || true`, 5000);
  asegurar(true, "\"" + textoBoton + "\" muestra \"" + textoCarga + "\" mientras espera al servidor y luego vuelve");
}

async function ir(p, url) {
  await p.ir(url);
  await p.buscarMarco();
  await p.evaluar(AYUDAS);
  await p.esperar("Alpine.store('usuario') && !Alpine.store('usuario').cargando", 20000, "usuario cargado");
}

async function navegarA(p, texto, vista) {
  await p.evaluar(`__sis.boton(${JSON.stringify(texto)}, document.querySelector(".inicio") || document).click(); true`);
  await p.esperar(`Alpine.store("nav").vista === ${JSON.stringify(vista)}`, 5000, "vista " + vista);
  asegurar(true, "\"" + texto + "\" abre la vista " + vista + " ($store.nav)");
}

async function recorrerPlan(p, { carrera, tsv, fusionarCon }) {
  await navegarA(p, "Registrar plan de ciclo", "plan");
  await p.esperar(`!!__sis.fila(${JSON.stringify(carrera)})`, 20000, "fila de " + carrera + " en la tabla de carreras");
  asegurar(true, "la tabla de carreras se llena con x-for (planInicio)");
  await pulsarConCarga(p, "Editar", "Abriendo…", { raiz: `__sis.fila(${JSON.stringify(carrera)})` });
  await p.esperar(`!!document.querySelector("section[x-data='planDeCiclo'] textarea")`, 10000, "pantalla de edición");
  await p.evaluar(`__sis.escribir(document.querySelector("section[x-data='planDeCiclo'] textarea"), ${JSON.stringify(tsv)}); true`);
  await pulsarConCarga(p, "Interpretar", "Interpretando…");
  await p.esperar(`[...document.querySelectorAll("section[x-data='planDeCiclo'] tbody tr")].length > 20`, 10000, "previsualización");
  asegurar(true, "la previsualización por semestre se llena con x-for (planInterpretar)");

  const { codigo, externo } = fusionarCon;
  await p.evaluar(codigo ? `__sis.boton("Fusionar", __sis.fila(${JSON.stringify(codigo)})).click(); true`
    : `__sis.botones("Fusionar").find(b => !b.disabled).click(); true`);
  await p.esperar(`!!document.querySelector(".dialogo")`, 5000, "diálogo de fusión");
  if (externo) {
    await pulsarConCarga(p, "Buscar en otras carreras", "Buscando…", { raiz: `document.querySelector(".dialogo")` });
    await p.evaluar(`(() => { const d = document.querySelector(".dialogo");
      const tr = [...d.querySelectorAll("tbody tr")].find(t => [...t.cells].some(c => c.textContent.trim() === ${JSON.stringify(externo.carrera)})
        && [...t.cells].some(c => c.textContent.trim() === ${JSON.stringify(externo.codigo)}));
      if (!tr) throw new Error("No aparece el candidato " + ${JSON.stringify(externo.codigo)});
      tr.querySelector("input[type=checkbox]").click(); return true; })()`);
    asegurar(true, "los candidatos de otras carreras se llenan con x-for (planCandidatosFusion)");
  } else {
    await p.evaluar(`(() => { const d = document.querySelector(".dialogo");
      const cajas = [...d.querySelectorAll("input[type=checkbox]")].filter(c => !c.disabled && !c.checked);
      cajas[0].click(); return true; })()`);
  }
  await p.evaluar(`(() => { const r = document.querySelector(".dialogo input[type=radio]:not(:disabled)"); r.click(); return true; })()`);
  await p.evaluar(`__sis.boton("Fusionar", document.querySelector(".dialogo")).click(); true`);
  await p.esperar(`!document.querySelector(".dialogo") && /FUS/.test(__sis.textoVisible())`, 5000, "fusión aplicada");
  asegurar(true, "la fusión queda marcada en la previsualización");

  await pulsarConCarga(p, "Guardar", "Guardando…");
  await p.esperar(`/Guardado como v\\d+/.test(__sis.textoVisible())`, 10000, "aviso de guardado");
  asegurar(true, "Guardar crea una versión y vuelve a la tabla");

  await pulsarConCarga(p, "Ver", "Abriendo…", { raiz: `__sis.fila(${JSON.stringify(carrera)})` }).catch(async () =>
    pulsarConCarga(p, "Editar", "Abriendo…", { raiz: `__sis.fila(${JSON.stringify(carrera)})` }));
  await pulsarConCarga(p, "Historial", "Buscando…");
  await p.esperar(`/v?1\\b/.test(__sis.textoVisible()) && __sis.botones("Restaurar").length + __sis.botones("Ver").length > 0`, 10000, "historial");
  asegurar(true, "el historial se llena con x-for (planHistorial)");
  await p.evaluar(`(__sis.botones("Salir")[0] || {click(){}}).click(); true`);
}

async function recorrerCarga(p, { carrera, tsv, buscar }) {
  await navegarA(p, "Carga docente", "carga");
  await p.esperar(`!!__sis.fila(${JSON.stringify(carrera)})`, 20000, "fila de " + carrera + " en la tabla de carreras");
  asegurar(true, "la tabla de carreras de la carga se llena con x-for (cargaInicio)");
  await pulsarConCarga(p, "Editar", "Abriendo…", { raiz: `__sis.fila(${JSON.stringify(carrera)})` });
  await p.esperar(`[...document.querySelectorAll("section[x-data='cargaDocente'] input[list]")].length > 10`, 10000, "tabla de secciones");
  asegurar(true, "la tabla de secciones se llena con x-for (cargaAbrir)");
  await p.evaluar(`__sis.escribir(document.querySelector("section[x-data='cargaDocente'] textarea[placeholder*='CargaXDepartamento']"), ${JSON.stringify(tsv)}); true`);
  await pulsarConCarga(p, "Interpretar", "Interpretando…");
  await p.evaluar(`__sis.boton("Aplicar").click(); true`);
  await p.esperar(`[...document.querySelectorAll("section[x-data='cargaDocente'] input[list]")].some(i => i.value)`, 5000, "docentes en la tabla");
  asegurar(true, "la carga masiva vuelca los docentes en la tabla");
  await pulsarConCarga(p, "Guardar", "Guardando…");
  await p.esperar(`/Guardado como v\\d+|A0\\d|A1\\d/.test(__sis.textoVisible())`, 10000, "resultado del guardado");
  asegurar(true, "Guardar muestra las advertencias con x-for (cargaGuardar)");
  if (buscar) {
    await p.evaluar(`__sis.escribir(document.querySelector("section[x-data='cargaDocente'] input[placeholder='Apellidos o nombres']"), ${JSON.stringify(buscar)}); true`);
    await pulsarConCarga(p, "Buscar", "Buscando…");
    await p.esperar(`!!__sis.fila(${JSON.stringify(buscar.toUpperCase())}) || [...document.querySelectorAll("tr")].some(t => t.textContent.toUpperCase().includes(${JSON.stringify(buscar.toUpperCase())}))`, 10000, "resultados de la búsqueda");
    asegurar(true, "la búsqueda por nombre se llena con x-for (cargaBuscarDocentes)");
  }
}

/* ===================== Recorrido ===================== */

const HOJA_CARRERA = { ADM: "Adm. Neg. Int.", DER: "Derecho", ING: "Ing. Software", ICO: "Ing. Comercial",
  COM: "Cs. de la Comunicación", PSI: "Psicología", ARQ: "Arquitectura", IND: "Ing. Industrial" };
const HOJA_DPTO = { DIMA: "CARGA DIMA 2026-I", DAHUC: "CARGA DAHUC 2026-I", DACJ: "CARGA  DACJ 2026-I", DACTE: "CARGA DACTE 2026-I" };

let pasos = 0;
function asegurar(cond, msg) {
  if (!cond) throw new Error("Falló: " + msg);
  pasos++;
  console.log("  ✔ " + msg);
}

/** Plan de IND guardado por el backend, para fusionar con otra carrera desde la vista. */
function sembrarPlan(entorno, ciclo, sigla) {
  entorno.como("coord.todas@ulasalle.edu.pe");
  const abrir = entorno.llamar("planAbrir", ciclo, sigla);
  const plan = entorno.llamar("planInterpretar", aTsv(hojaEjemplo("CargaXCarrera", HOJA_CARRERA[sigla])), sigla);
  const r = entorno.llamar("planGuardar", ciclo, sigla, { asignaturas: plan.datos.asignaturas }, abrir.datos.version);
  if (!r.ok) throw new Error("No se pudo sembrar el plan de " + sigla + ": " + r.error);
}

async function recorridoLocal() {
  const entorno = crearEntorno();
  sembrarPlan(entorno, "2026-2", "IND");
  const local = await iniciarServidorLocal({ entorno, puerto: 0, latencia: 300 });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "sis-chrome-"));
  const { proceso, cdp } = await lanzarChrome({ perfil });
  try {
    const p = await Pestana.abrir(cdp, "about:blank");
    console.log("Acceso");
    await ir(p, local.url + "?usuario=alguien@gmail.com");
    await p.esperar("Alpine.store('nav').vista === 'denegado' && /Cuenta fuera del dominio/.test(__sis.textoVisible())", 5000, "acceso denegado");
    asegurar(true, "una cuenta fuera de @ulasalle.edu.pe ve \"Acceso denegado\" con el motivo");
    await ir(p, local.url + "?usuario=sinrol@ulasalle.edu.pe");
    await p.esperar("Alpine.store('nav').vista === 'denegado' && /Cuenta sin rol/.test(__sis.textoVisible())", 5000, "sin rol");
    asegurar(true, "una cuenta sin rol ve \"Acceso denegado\"");

    console.log("CU-001 como coordinador de ING");
    await ir(p, local.url + "?usuario=mfloresl@ulasalle.edu.pe");
    await recorrerPlan(p, { carrera: "ING", tsv: aTsv(hojaEjemplo("CargaXCarrera", "Ing. Software")),
      fusionarCon: { codigo: "3.1.4.24", externo: { carrera: "IND", codigo: "17.1.1.24" } } });
    const v = entorno.hojas.Planes.datos.filter(f => f[1] === "ING");
    asegurar(v.length === 1 && /"fusion":{/.test(v[0][5]), "la hoja Planes tiene la versión 1 de ING con la fusión");

    console.log("CU-002 como director de DIMA");
    await ir(p, local.url + "?usuario=fmaresg@ulasalle.edu.pe");
    await recorrerCarga(p, { carrera: "ING", tsv: aTsv(hojaEjemplo("CargaXDepartamento", HOJA_DPTO.DIMA)), buscar: "zegarra" });
    asegurar(entorno.hojas.Cargas.datos.some(f => f[1] === "ING"), "la hoja Cargas tiene la carga de ING");

    asegurar(p.errores.length === 0, "sin errores en la consola" + (p.errores.length ? ": " + p.errores.join(" | ") : ""));
    await p.captura(path.join(os.tmpdir(), "sis-recorrido.png"));
  } finally {
    cdp.cerrar();
    proceso.kill();
    local.servidor.close();
  }
}

async function recorridoDev(url) {
  const perfil = process.env.CHROME_PERFIL || path.join(os.homedir(), ".sis-recorrido-chrome");
  const { proceso, cdp } = await lanzarChrome({ ventana: true, perfil });
  try {
    const p = await Pestana.abrir(cdp, url);
    console.log("Si Chrome pide iniciar sesión, entra con tu cuenta @ulasalle.edu.pe en esa ventana (espero 5 min).");
    await p.buscarMarco(300000);
    await p.evaluar(AYUDAS);
    await p.esperar("Alpine.store('usuario') && !Alpine.store('usuario').cargando", 30000, "usuario cargado");
    const u = await p.evaluar("JSON.parse(JSON.stringify(Alpine.store('usuario')))");
    console.log("Cuenta: " + u.correo + " (" + (u.rol || "sin rol") + ")");
    asegurar(u.acceso, "la cuenta tiene acceso");
    if (u.rol === "coordinador") {
      const sigla = u.carreras.find(s => HOJA_CARRERA[s]);
      await recorrerPlan(p, { carrera: sigla, tsv: aTsv(hojaEjemplo("CargaXCarrera", HOJA_CARRERA[sigla])), fusionarCon: { codigo: null } });
      await navegarA(p, "Carga docente", "carga");
      await p.esperar("!!__sis.fila(" + JSON.stringify(sigla) + ")", 20000, "carga en solo lectura");
      asegurar(true, "Carga docente se abre en solo lectura para el coordinador");
    } else {
      await recorrerCarga(p, { carrera: process.env.CARRERA || "ING", tsv: aTsv(hojaEjemplo("CargaXDepartamento", HOJA_DPTO[u.departamento])), buscar: "zegarra" });
    }
    asegurar(p.errores.length === 0, "sin errores en la consola" + (p.errores.length ? ": " + p.errores.join(" | ") : ""));
  } finally {
    cdp.cerrar();
    proceso.kill();
  }
}

async function principal() {
  const args = process.argv.slice(2);
  if (args.includes("--servidor")) {
    const local = await iniciarServidorLocal({ puerto: +(process.env.PUERTO || 8765) });
    console.log("Vista previa local en " + local.url + "?usuario=mfloresl@ulasalle.edu.pe (Ctrl+C para salir)");
    return;
  }
  const i = args.indexOf("--dev");
  if (i >= 0) await recorridoDev(args[i + 1]);
  else await recorridoLocal();
  console.log("Recorrido terminado: " + pasos + " comprobaciones.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal().catch(e => { console.error(e.message || e); process.exit(1); });
}
