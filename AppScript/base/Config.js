// @ts-check
/* Configuración: vive en las propiedades del script (Configuración del proyecto →
   Propiedades del script). instalar() crea las que falten con estos valores. */
var PROPIEDADES_POR_DEFECTO_ = {
  SIS_DOMINIO: "ulasalle.edu.pe",
  SIS_MINUTOS_BLOQUEO: "30",
  SIS_MAX_SUBGRUPOS: "5",
  SIS_CICLOS: "2026-1,2026-2,2027-1,2027-2",
  SIS_CICLO_HOJA: "2026-1",
  SIS_MINUTOS_REVISION_HOJA: "5",
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
  const cicloHoja = valor("SIS_CICLO_HOJA");
  const ciclos = valor("SIS_CICLOS").split(",").map(function (c) { return c.trim(); }).filter(Boolean);
  if (ciclos.indexOf(cicloHoja) < 0) ciclos.push(cicloHoja);

  configCache_ = {
    bdId: String(p.SIS_BD_ID || "").trim(),
    /* Cambia cuando se reemplazan las tablas (hoja/MigracionServidor.js): deja de lado lo que había en la caché. */
    generacion: String(p.SIS_GENERACION || "").trim(),
    dominio: valor("SIS_DOMINIO").toLowerCase().replace(/^@/, ""),
    minutosBloqueo: entero("SIS_MINUTOS_BLOQUEO", 1),
    maxSubgrupos: entero("SIS_MAX_SUBGRUPOS", 2),
    ciclos: ciclos,
    /* Ciclo al que pertenece la oferta de las pestañas «Oferta - …». */
    cicloHoja: cicloHoja,
    /* Cada cuánto se mira si las pestañas de datos cambiaron; 0 = en cada carga del tablero. */
    minutosRevisionHoja: entero("SIS_MINUTOS_REVISION_HOJA", 0),
    /* Si la propiedad existe se respeta tal cual: «ninguno» (o vacío) deniega. */
    rolPorDefecto: p.SIS_ROL_POR_DEFECTO != null ? String(p.SIS_ROL_POR_DEFECTO) : PROPIEDADES_POR_DEFECTO_.SIS_ROL_POR_DEFECTO
  };
  return configCache_;
}

/**
 * Se ejecuta desde la hoja del sistema (menú SISCargaLectiva → Instalar o reparar) o desde
 * el editor de su Apps Script. Se puede repetir sin riesgo: solo crea lo que falta. La hoja
 * del sistema es la hoja a la que está ligado el script: aquí se preparan sus tablas
 * (ocultas), la pestaña Usuarios, las migraciones y la revisión de las pestañas de datos.
 * @returns {string} Resumen de lo hecho (también en el registro).
 */
function instalar() {
  const activo = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (activo && efectivo && activo !== efectivo)
    throw new Error("Solo la cuenta propietaria del script puede ejecutar instalar().");
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error("instalar() se ejecuta desde la hoja del sistema: el script tiene que estar ligado a ella.");

  const props = PropertiesService.getScriptProperties();
  const actuales = props.getProperties();
  Object.keys(PROPIEDADES_POR_DEFECTO_).forEach(function (k) {
    if (actuales[k] == null) props.setProperty(k, PROPIEDADES_POR_DEFECTO_[k]);
  });
  props.setProperty("SIS_BD_ID", libro.getId());
  configCache_ = null;
  libroBdCache_ = null;
  hojasCache_ = null;

  /* El Centro de datos llamaba «BD - Usuarios» a su copia de Usuarios: ahora es la tabla. */
  const copiaUsuarios = libro.getSheetByName("BD - Usuarios");
  if (copiaUsuarios && !libro.getSheetByName(TABLA_.USUARIOS)) copiaUsuarios.setName(TABLA_.USUARIOS);

  prepararTablas_(libro);
  const sembradas = sembrarUsuarios_(libro);
  const migracion = conCandado_(function () {
    return { fechas: convertirFechasAPeru_(), asignaciones: migrarCargasPorCarrera_() };
  });
  prepararHojaDatos_(libro);

  const resumen = [
    "SISCargaLectiva instalado en la hoja «" + libro.getName() + "».",
    sembradas ? "Se añadieron " + sembradas + " cuentas a la pestaña Usuarios." : "La pestaña Usuarios ya tenía cuentas; no se tocó.",
    migracion.fechas ? "Se pasaron " + migracion.fechas + " fechas a la hora de Perú." : "",
    migracion.asignaciones ? "Se pasaron " + migracion.asignaciones + " asignaciones de las cargas por departamento a las cargas por carrera." : "",
    pestanasDeFuente_(libro, "carrera").length ? "" :
      "Siguiente paso: agrega una pestaña «" + PESTANAS_DATOS_.carrera.prefijo + "<carrera>» por carrera con su oferta."
  ].filter(Boolean).join("\n");
  Logger.log(resumen);
  return resumen;
}

/**
 * Hoja de cálculo por su id, o null si no existe, está en la papelera o no se puede abrir.
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
