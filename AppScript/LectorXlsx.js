/* Lectura de libros .xlsx sin convertirlos a Hoja de cálculo de Google.
   leerLibroXlsx() es pura: recibe las partes del zip ya descomprimidas
   ({ruta: textoXml}) y devuelve [{nombre, filas}], con cada celda como el texto
   que mostraría Excel. descomprimirXlsx_() es la única parte que usa Apps Script. */

function descomprimirXlsx_(blob) {
  const partes = Utilities.unzip(blob.setContentType("application/zip"));
  const archivos = {};
  partes.forEach(function (p) {
    const nombre = p.getName();
    if (/\.(xml|rels)$/i.test(nombre)) archivos[nombre.replace(/^\/+/, "")] = p.getDataAsString("UTF-8");
  });
  return archivos;
}

function leerLibroXlsx(archivos) {
  const libro = xlsxParte_(archivos, "xl/workbook.xml");
  if (!libro) throw new Error("El archivo no es un libro .xlsx: falta xl/workbook.xml.");

  const rels = {};
  xlsxEtiquetas_(xlsxParte_(archivos, "xl/_rels/workbook.xml.rels") || "", "Relationship").forEach(function (a) {
    rels[a.Id] = a.Target;
  });
  const compartidas = xlsxCadenasCompartidas_(xlsxParte_(archivos, "xl/sharedStrings.xml") || "");
  const estilos = xlsxEstilos_(xlsxParte_(archivos, "xl/styles.xml") || "");

  return xlsxEtiquetas_(libro, "sheet").map(function (a) {
    const idRel = Object.keys(a).filter(function (k) { return /(^|:)id$/.test(k) && k !== "sheetId"; })[0];
    const destino = rels[a[idRel]] || "";
    const ruta = destino.charAt(0) === "/" ? destino.slice(1) : "xl/" + destino.replace(/^\.\//, "");
    return { nombre: a.name, filas: xlsxFilas_(xlsxParte_(archivos, ruta) || "", compartidas, estilos) };
  });
}

function xlsxParte_(archivos, ruta) {
  if (archivos[ruta] != null) return archivos[ruta];
  const claves = Object.keys(archivos);
  const bajo = ruta.toLowerCase();
  let k = claves.filter(function (x) { return x.toLowerCase() === bajo; })[0];
  if (!k) {
    /* Por si el zip llega sin carpetas: se busca por el nombre del archivo. */
    const base = bajo.split("/").pop();
    const mismos = claves.filter(function (x) { return x.toLowerCase().split("/").pop() === base; });
    if (mismos.length === 1) k = mismos[0];
  }
  return k ? archivos[k] : null;
}

function xlsxDecodificar_(t) {
  return String(t)
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      const x = e.toLowerCase();
      if (x === "amp") return "&";
      if (x === "lt") return "<";
      if (x === "gt") return ">";
      if (x === "quot") return '"';
      if (x === "apos") return "'";
      return String.fromCodePoint(x.charAt(1) === "x" ? parseInt(x.slice(2), 16) : parseInt(x.slice(1), 10));
    })
    .replace(/_x([0-9a-f]{4})_/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function xlsxAtributos_(texto) {
  const a = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(texto))) a[m[1]] = xlsxDecodificar_(m[3] != null ? m[3] : m[4]);
  return a;
}

function xlsxEtiquetas_(xml, etiqueta) {
  const re = new RegExp("<" + etiqueta + "(\\s[^>]*?)?\\/?>", "g");
  const res = [];
  let m;
  while ((m = re.exec(xml))) res.push(xlsxAtributos_(m[1] || ""));
  return res;
}

/* Texto de los nodos <t> de un fragmento, sin la guía fonética (<rPh>). */
function xlsxTexto_(fragmento) {
  const limpio = fragmento.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let texto = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(limpio))) texto += xlsxDecodificar_(m[1]);
  return texto;
}

function xlsxCadenasCompartidas_(xml) {
  const res = [];
  const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m;
  while ((m = re.exec(xml))) res.push(m[1] ? xlsxTexto_(m[1]) : "");
  return res;
}

/* Formatos numéricos de fecha predefinidos de Excel (los mismos que usa SheetJS). */
var XLSX_FORMATOS_FECHA_ = {
  14: "m/d/yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM",
  20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm", 45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0"
};

function xlsxEstilos_(xml) {
  const formatos = {};
  xlsxEtiquetas_(xml, "numFmt").forEach(function (a) { formatos[a.numFmtId] = a.formatCode; });
  const xfs = (xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "";
  return xlsxEtiquetas_(xfs, "xf").map(function (a) {
    const id = parseInt(a.numFmtId || "0", 10);
    const codigo = formatos[id] != null ? formatos[id] : XLSX_FORMATOS_FECHA_[id];
    return codigo && xlsxEsFecha_(codigo) ? codigo : null;
  });
}

function xlsxEsFecha_(codigo) {
  const limpio = String(codigo).split(";")[0]
    .replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/[_*]./g, "").replace(/\[[^\]]*\]/g, "");
  return /[dmyhs]/i.test(limpio);
}

var XLSX_MESES_ = ["January", "February", "March", "April", "May", "June", "July",
                   "August", "September", "October", "November", "December"];
var XLSX_DIAS_ = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* Da formato a una fecha serial de Excel con un código como «d-m» o «D/M/YYYY». */
function xlsxFormatearFecha_(serial, codigo) {
  const f = new Date(Math.round((serial - 25569) * 864e5));
  const seccion = String(codigo).split(";")[0];
  const tokens = [];
  let i = 0;
  while (i < seccion.length) {
    const c = seccion.charAt(i);
    if (c === '"') {
      const j = seccion.indexOf('"', i + 1);
      tokens.push({ lit: seccion.slice(i + 1, j < 0 ? seccion.length : j) });
      i = j < 0 ? seccion.length : j + 1;
      continue;
    }
    if (c === "\\") { tokens.push({ lit: seccion.charAt(i + 1) }); i += 2; continue; }
    if (c === "_" || c === "*") { i += 2; continue; }
    if (c === "[") { const j = seccion.indexOf("]", i); i = j < 0 ? seccion.length : j + 1; continue; }
    const m = seccion.slice(i).match(/^(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|A\/P)/i);
    if (m) { tokens.push({ tok: m[1] }); i += m[1].length; continue; }
    tokens.push({ lit: c });
    i++;
  }

  const doce = tokens.some(function (t) { return t.tok && /^A/i.test(t.tok); });
  const hora = f.getUTCHours();
  const dos = function (n) { return (n < 10 ? "0" : "") + n; };
  const fechas = tokens.filter(function (t) { return t.tok; });

  return tokens.map(function (t) {
    if (!t.tok) return t.lit;
    const k = t.tok.toLowerCase();
    const pos = fechas.indexOf(t);
    const antes = fechas[pos - 1], despues = fechas[pos + 1];
    const esMinuto = (k === "m" || k === "mm") &&
      ((antes && /^h/i.test(antes.tok)) || (despues && /^s/i.test(despues.tok)));
    if (esMinuto) return k === "mm" ? dos(f.getUTCMinutes()) : String(f.getUTCMinutes());
    switch (k) {
      case "yyyy": return String(f.getUTCFullYear());
      case "yy": return dos(f.getUTCFullYear() % 100);
      case "mmmm": return XLSX_MESES_[f.getUTCMonth()];
      case "mmm": return XLSX_MESES_[f.getUTCMonth()].slice(0, 3);
      case "mm": return dos(f.getUTCMonth() + 1);
      case "m": return String(f.getUTCMonth() + 1);
      case "dddd": return XLSX_DIAS_[f.getUTCDay()];
      case "ddd": return XLSX_DIAS_[f.getUTCDay()].slice(0, 3);
      case "dd": return dos(f.getUTCDate());
      case "d": return String(f.getUTCDate());
      case "hh": return dos(doce ? (hora % 12 || 12) : hora);
      case "h": return String(doce ? (hora % 12 || 12) : hora);
      case "ss": return dos(f.getUTCSeconds());
      case "s": return String(f.getUTCSeconds());
      case "am/pm": return hora < 12 ? "AM" : "PM";
      case "a/p": return hora < 12 ? "A" : "P";
    }
    return t.tok;
  }).join("");
}

/* Número con el aspecto del formato General: sin «.0» ni ruido de coma flotante. */
function xlsxNumero_(v) {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toPrecision(11)));
}

function xlsxColumna_(letras) {
  let n = 0;
  for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
  return n - 1;
}

function xlsxFilas_(xml, compartidas, estilos) {
  const filas = [];
  const reFila = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const reCelda = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let mf, ultimaFila = -1;

  while ((mf = reFila.exec(xml))) {
    const af = xlsxAtributos_(mf[1] || "");
    const r = af.r ? parseInt(af.r, 10) - 1 : ultimaFila + 1;
    ultimaFila = r;
    const fila = [];
    let mc, ultimaCol = -1;
    reCelda.lastIndex = 0;
    const cuerpo = mf[2] || "";

    while ((mc = reCelda.exec(cuerpo))) {
      const ac = xlsxAtributos_(mc[1] || "");
      const ref = (ac.r || "").match(/^([A-Z]+)/);
      const col = ref ? xlsxColumna_(ref[1]) : ultimaCol + 1;
      ultimaCol = col;
      const interior = mc[2] || "";
      const v = (interior.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let texto = "";

      if (ac.t === "s") texto = v != null ? (compartidas[parseInt(v, 10)] || "") : "";
      else if (ac.t === "inlineStr") texto = xlsxTexto_((interior.match(/<is>([\s\S]*?)<\/is>/) || [])[1] || "");
      else if (ac.t === "b") texto = v === "1" ? "TRUE" : v != null ? "FALSE" : "";
      else if (ac.t === "str" || ac.t === "e" || ac.t === "d") texto = v != null ? xlsxDecodificar_(v) : "";
      else if (v != null) {
        const formato = ac.s != null ? estilos[parseInt(ac.s, 10)] : null;
        texto = formato && isFinite(Number(v)) ? xlsxFormatearFecha_(Number(v), formato) : xlsxNumero_(v);
      }

      while (fila.length < col) fila.push("");
      fila[col] = String(texto).trim();
    }
    while (filas.length < r) filas.push([]);
    filas[r] = fila;
  }
  return filas;
}

/* ============================================================
   Oferta de las carreras a partir de los dos libros de ejemplo
   ============================================================ */

/* libroCarrera: una hoja por carrera. libroDepartamento (opcional) aporta la
   CONDICIÓN de cada código: si la asignatura no trae OBSERVACIONES y la condición
   habla de INTERNACIONAL, VIRTUAL o FUSIÓN, esa condición pasa a ser su observación. */
function ofertaDesdeLibros(libroCarrera, libroDepartamento) {
  const oferta = {}, avisos = [], lecturas = {};

  libroCarrera.forEach(function (hoja) {
    const sig = Dominio.siglaDeCarrera(hoja.nombre) || siglaMayoritaria_(hoja.filas);
    if (!sig) {
      if (hoja.filas.some(function (f) { return f.some(function (c) { return c !== ""; }); }))
        avisos.push("La hoja «" + hoja.nombre + "» no corresponde a ninguna carrera conocida y no se leyó.");
      return;
    }
    if (oferta[sig]) {
      avisos.push("La hoja «" + hoja.nombre + "» repite la carrera " + sig + "; se usó la primera hoja.");
      return;
    }
    const r = Dominio.interpretar(hoja.filas, { carrera: sig, sinDuplicados: true });
    oferta[sig] = r.asignaturas;
    lecturas[sig] = r.lecturaDocente;
    r.duplicadas.forEach(function (d) {
      avisos.push("Hoja «" + hoja.nombre + "»: la fila de «" + d.nombre + "» (código " + d.codigo + ", grupo " + d.grupo +
        ") repite un código y grupo que ya aparecen antes en la hoja, así que no se leyó. Corrige el código en el Excel.");
    });
  });

  const marcas = libroDepartamento ? marcasDeCondicion_(libroDepartamento) : {};
  Object.keys(oferta).forEach(function (sig) {
    oferta[sig].forEach(function (a) {
      if (!a.obs && marcas[a.codigo]) a.obs = marcas[a.codigo];
    });
  });

  /* lecturas: el texto de la columna DOCENTE de cada grupo, por carrera y en el orden de
     las filas (Dominio.interpretar). Lo aplica DominioCarga.asignarImportados. */
  return { oferta: oferta, avisos: avisos, lecturas: lecturas };
}

/* Siembra de un ciclo con los tres Excel de ejemplo, que no se modifican (P110, P117):
   la oferta de cada carrera, el catálogo de la hoja General (P126), las fusiones anotadas
   en OBSERVACIONES (P118, P130) y los docentes de la columna DOCENTE, aplicados en el
   orden de las hojas y de las filas con los permisos de «usuario» (P122, P127). Por
   omisión, un Director con todos los departamentos. «reglas» ajusta los umbrales (RNF-11). */
function cicloDesdeLibros(libroCarrera, libroDepartamento, libroDocentes, usuario, reglas) {
  const C = dominioCarga_();
  const r = ofertaDesdeLibros(libroCarrera, libroDepartamento);
  const planes = r.oferta;
  const fusiones = Dominio.fusionesDesdeObservaciones(planes);

  const hojas = libroDocentes || [];
  const general = hojas.filter(function (h) { return Dominio.normalizar(h.nombre) === "GENERAL"; })[0] || hojas[0];
  const catalogo = general ? C.leerGeneral(general.filas) : [];

  const lecturas = [];
  Object.keys(planes).forEach(function (sig) { (r.lecturas[sig] || []).forEach(function (l) { lecturas.push(l); }); });
  const docentes = C.asignarImportados(planes, lecturas, catalogo, usuario || { rol: "director", departamento: "TODOS" }, reglas);

  return {
    planes: planes, catalogo: catalogo, fusiones: fusiones.secciones, docentes: docentes,
    avisos: r.avisos.concat(fusiones.avisos, docentes.avisos)
  };
}

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

function marcasDeCondicion_(libro) {
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
