// @ts-check
/* Configuración: vive en las propiedades del script (Configuración del proyecto →
   Propiedades del script). instalar() crea las que falten con estos valores. */
var PROPIEDADES_POR_DEFECTO_ = {
  SIS_DOMINIO: "ulasalle.edu.pe",
  SIS_MINUTOS_BLOQUEO: "30",
  SIS_MAX_SUBGRUPOS: "5",
  SIS_CICLOS: "2026-1,2026-2,2027-1,2027-2",
  SIS_CICLO_XLSX: "2026-1",
  SIS_MINUTOS_REVISION_XLSX: "5",
  SIS_ROL_POR_DEFECTO: "ninguno"
};

/* Cuentas con que se siembra la pestaña Usuarios la primera vez. */
var USUARIOS_INICIALES_ = [
  "mfloresl@ulasalle.edu.pe", "fmaresg@ulasalle.edu.pe", "jhuamanih@ulasalle.edu.pe",
  "jortizc@ulasalle.edu.pe", "afrontadof@ulasalle.edu.pe", "aarenasc@ulasalle.edu.pe"
];

var configCache_ = null;

/**
 * Configuración del sistema, con los valores por defecto donde falten. Se guarda en la ejecución.
 * @returns {Configuracion}
 */
function config_() {
  if (configCache_) return configCache_;
  const p = PropertiesService.getScriptProperties().getProperties();
  const valor = function (k) {
    const v = p[k] != null ? String(p[k]).trim() : "";
    return v !== "" ? v : PROPIEDADES_POR_DEFECTO_[k];
  };
  const entero = function (k, minimo) {
    const n = parseInt(valor(k), 10);
    return isFinite(n) && n >= minimo ? n : parseInt(PROPIEDADES_POR_DEFECTO_[k], 10);
  };
  const cicloXlsx = valor("SIS_CICLO_XLSX");
  const ciclos = valor("SIS_CICLOS").split(",").map(function (c) { return c.trim(); }).filter(Boolean);
  if (ciclos.indexOf(cicloXlsx) < 0) ciclos.push(cicloXlsx);

  configCache_ = {
    carpetaId: String(p.SIS_CARPETA_ID || "").trim(),
    bdId: String(p.SIS_BD_ID || "").trim(),
    dominio: valor("SIS_DOMINIO").toLowerCase().replace(/^@/, ""),
    minutosBloqueo: entero("SIS_MINUTOS_BLOQUEO", 1),
    maxSubgrupos: entero("SIS_MAX_SUBGRUPOS", 2),
    ciclos: ciclos,
    cicloXlsx: cicloXlsx,
    /* Cada cuánto se mira si los xlsx de Drive cambiaron; 0 = en cada carga del tablero. */
    minutosRevisionXlsx: entero("SIS_MINUTOS_REVISION_XLSX", 0),
    /* Si la propiedad existe se respeta tal cual: «ninguno» (o vacío) deniega. */
    rolPorDefecto: p.SIS_ROL_POR_DEFECTO != null ? String(p.SIS_ROL_POR_DEFECTO) : PROPIEDADES_POR_DEFECTO_.SIS_ROL_POR_DEFECTO
  };
  return configCache_;
}

/**
 * Se ejecuta una vez desde el editor de Apps Script. Se puede repetir sin riesgo:
 * reutiliza la carpeta y la hoja si ya existen y solo crea lo que falta.
 * @returns {string} Resumen de lo hecho (también en el registro).
 */
function instalar() {
  const activo = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (activo && efectivo && activo !== efectivo)
    throw new Error("Solo la cuenta propietaria del script puede ejecutar instalar().");

  const props = PropertiesService.getScriptProperties();
  const actuales = props.getProperties();
  Object.keys(PROPIEDADES_POR_DEFECTO_).forEach(function (k) {
    if (actuales[k] == null) props.setProperty(k, PROPIEDADES_POR_DEFECTO_[k]);
  });

  let carpeta = abrirCarpeta_(actuales.SIS_CARPETA_ID);
  if (!carpeta) carpeta = DriveApp.createFolder("SISCargaLectiva");
  props.setProperty("SIS_CARPETA_ID", carpeta.getId());

  let libro = abrirLibro_(actuales.SIS_BD_ID);
  if (!libro) {
    libro = SpreadsheetApp.create("SISCargaLectiva-BD");
    DriveApp.getFileById(libro.getId()).moveTo(carpeta);
  }
  props.setProperty("SIS_BD_ID", libro.getId());
  configCache_ = null;
  libroBdCache_ = null;

  prepararTablas_(libro);
  const sembradas = sembrarUsuarios_(libro);

  const resumen = [
    "SISCargaLectiva instalado.",
    "Carpeta de Drive: " + carpeta.getUrl(),
    "Hoja del sistema: " + libro.getUrl(),
    sembradas ? "Se añadieron " + sembradas + " cuentas a la pestaña Usuarios." : "La pestaña Usuarios ya tenía cuentas; no se tocó.",
    "Siguiente paso: sube a la carpeta los archivos CargaXCarrera y CargaXDepartamento (.xlsx, sin convertir)."
  ].join("\n");
  Logger.log(resumen);
  return resumen;
}

/**
 * Carpeta de Drive por su id, o null si no existe o está en la papelera.
 * @param {string} id
 * @returns {GoogleAppsScript.Drive.Folder|null}
 */
function abrirCarpeta_(id) {
  if (!id) return null;
  try {
    const c = DriveApp.getFolderById(id);
    return c.isTrashed() ? null : c;
  } catch (e) {
    return null;
  }
}

/**
 * Hoja de cálculo por su id, o null si no existe o está en la papelera.
 * @param {string} id
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null}
 */
function abrirLibro_(id) {
  if (!id) return null;
  try {
    if (DriveApp.getFileById(id).isTrashed()) return null;
    return SpreadsheetApp.openById(id);
  } catch (e) {
    return null;
  }
}

/**
 * Si la pestaña Usuarios está vacía, añade las cuentas iniciales como directores.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} libro
 * @returns {number} Cuántas cuentas añadió.
 */
function sembrarUsuarios_(libro) {
  const hoja = libro.getSheetByName(TABLA_.USUARIOS);
  if (hoja.getLastRow() > 1) return 0;
  hoja.getRange(2, 1, USUARIOS_INICIALES_.length, 3).setNumberFormat("@")
    .setValues(USUARIOS_INICIALES_.map(function (c) { return [c, "director", ""]; }));
  return USUARIOS_INICIALES_.length;
}
