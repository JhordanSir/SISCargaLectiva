/* Configuración: vive en las propiedades del script (Configuración del proyecto →
   Propiedades del script). instalar() crea las que falten con estos valores.
   SIS_REGLAS cambia los umbrales de las reglas de carga docente sin reprogramar (RNF-11),
   como JSON: {"A07": {"max": 40}, "A09": {"max": 26}}. */
var PROPIEDADES_POR_DEFECTO_ = {
  SIS_DOMINIO: "ulasalle.edu.pe",
  SIS_MINUTOS_BLOQUEO: "30",
  SIS_MAX_SUBGRUPOS: "5",
  SIS_CICLOS: "2026-1,2026-2,2027-1,2027-2",
  SIS_CICLO_ACTUAL: "2026-1",
  SIS_ROL_POR_DEFECTO: "ninguno",
  SIS_REGLAS: ""
};

/* Cuentas con que se siembra _SYS_USUARIOS la primera vez: Directores con todos los
   departamentos (P116, P125). */
var USUARIOS_INICIALES_ = [
  "mfloresl@ulasalle.edu.pe", "fmaresg@ulasalle.edu.pe", "jhuamanih@ulasalle.edu.pe",
  "jortizc@ulasalle.edu.pe", "afrontadof@ulasalle.edu.pe", "aarenasc@ulasalle.edu.pe"
];

var NOMBRE_CARPETA_XLSX_ = "SISCargaLectiva · Excel de origen";

var configCache_ = null;

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
  const cicloActual = valor("SIS_CICLO_ACTUAL");
  const ciclos = valor("SIS_CICLOS").split(",").map(function (c) { return c.trim(); }).filter(Boolean);
  if (ciclos.indexOf(cicloActual) < 0) ciclos.push(cicloActual);
  let reglas = null;
  try { reglas = valor("SIS_REGLAS") ? JSON.parse(valor("SIS_REGLAS")) : null; } catch (e) { reglas = null; }

  configCache_ = {
    libroId: String(p.SIS_LIBRO_ID || "").trim(),
    carpetaXlsx: String(p.SIS_CARPETA_XLSX || "").trim(),
    dominio: valor("SIS_DOMINIO").toLowerCase().replace(/^@/, ""),
    minutosBloqueo: entero("SIS_MINUTOS_BLOQUEO", 1),
    maxSubgrupos: entero("SIS_MAX_SUBGRUPOS", 2),
    ciclos: ciclos,
    cicloActual: cicloActual,
    /* Si la propiedad existe se respeta tal cual: «ninguno» (o vacío) deniega (P125). */
    rolPorDefecto: p.SIS_ROL_POR_DEFECTO != null ? String(p.SIS_ROL_POR_DEFECTO) : PROPIEDADES_POR_DEFECTO_.SIS_ROL_POR_DEFECTO,
    reglas: reglas
  };
  return configCache_;
}

/* Solo la cuenta propietaria del proyecto: instalar, sembrar y proteger el libro. */
function exigirPropietario_() {
  const activo = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (activo && efectivo && activo !== efectivo)
    throw new Error("Solo la cuenta propietaria del proyecto puede hacerlo.");
}

/* Se ejecuta una vez desde el editor del proyecto vinculado al libro (Extensiones → Apps
   Script, o clasp open-script). Se puede repetir sin riesgo: reutiliza lo que ya existe y
   solo crea lo que falta. Prepara las hojas del sistema y la carpeta donde se suben los
   .xlsx para sembrar un ciclo con sembrarCiclo(). */
function instalar() {
  exigirPropietario_();
  const libro = SpreadsheetApp.getActive();
  if (!libro) throw new Error("Ejecuta instalar() desde el proyecto vinculado al libro, no desde un proyecto independiente.");

  const props = PropertiesService.getScriptProperties();
  const actuales = props.getProperties();
  Object.keys(PROPIEDADES_POR_DEFECTO_).forEach(function (k) {
    if (actuales[k] == null) props.setProperty(k, PROPIEDADES_POR_DEFECTO_[k]);
  });
  props.setProperty("SIS_LIBRO_ID", libro.getId());

  let carpeta = abrirCarpeta_(actuales.SIS_CARPETA_XLSX);
  if (!carpeta) carpeta = DriveApp.createFolder(NOMBRE_CARPETA_XLSX_);
  props.setProperty("SIS_CARPETA_XLSX", carpeta.getId());
  configCache_ = null;
  libroCache_ = null;

  prepararTablas_(libro);
  const sembradas = sembrarUsuarios_();
  const sobrante = libro.getSheetByName("Hoja 1") || libro.getSheetByName("Sheet1");
  if (sobrante && sobrante.getLastRow() === 0 && libro.getSheets().length > 1) libro.deleteSheet(sobrante);

  const resumen = [
    "SISCargaLectiva instalado en el libro «" + libro.getName() + "».",
    "Libro: " + libro.getUrl(),
    "Carpeta para los .xlsx: " + carpeta.getUrl(),
    sembradas ? "Se añadieron " + sembradas + " cuentas a _SYS_USUARIOS como Director con todos los departamentos."
              : "_SYS_USUARIOS ya tenía cuentas; no se tocó.",
    "Siguiente paso: sube a esa carpeta CargaXCarrera, CargaXDepartamento y CargaDeDocentes (.xlsx, sin convertir) " +
    "y ejecuta sembrarCiclo con el ciclo «" + config_().cicloActual + "»."
  ].join("\n");
  Logger.log(resumen);
  return resumen;
}

function abrirCarpeta_(id) {
  if (!id) return null;
  try {
    const c = DriveApp.getFolderById(id);
    return c.isTrashed() ? null : c;
  } catch (e) {
    return null;
  }
}

function sembrarUsuarios_() {
  const hoja = hojaSys_("_SYS_USUARIOS");
  if (hoja.getLastRow() > 1) return 0;
  hoja.getRange(2, 1, USUARIOS_INICIALES_.length, 4).setNumberFormat("@")
    .setValues(USUARIOS_INICIALES_.map(function (c) { return [c, "director", "", "TODOS"]; }));
  return USUARIOS_INICIALES_.length;
}
