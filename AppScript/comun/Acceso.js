// @ts-check
/* Identidad de la cuenta y validación de lo que llega del navegador. La aplicación se
   publica con acceso para el dominio institucional, así que Google ya exige una cuenta de
   ese dominio; aquí se comprueba de nuevo y se busca el rol en la pestaña Usuarios
   (CU-001 y CU-002, pasos 2 a 5 y FA de acceso denegado).
   Coordinador: su columna «carreras» dice qué planes edita (cu001/PlanServicio.js).
   Director: su columna «departamento» dice qué cargas docentes asigna
   (cu002/CargaServicio.js). Todo lo demás lo consultan en solo lectura.
   Una cuenta que no figura en Usuarios no entra (propiedad SIS_ROL_POR_DEFECTO).
   El rol de cada cuenta se guarda 5 minutos en la caché del script: un cambio en la
   pestaña Usuarios tarda como mucho eso en aplicarse. */
var usuarioCache_ = null;
var SEGUNDOS_CACHE_USUARIO_ = 300;

/**
 * Cuenta que hace la llamada, con su rol. Se guarda en la ejecución y 5 minutos en la caché.
 * @returns {Usuario} Con «denegado» si no puede entrar.
 */
function usuarioActual_() {
  if (usuarioCache_) return usuarioCache_;
  const cfg = config_();
  const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  let usuario;

  if (!correo) {
    usuario = { codigo: "NO_AUTENTICADO", denegado: "No se pudo identificar tu cuenta de Google. Abre la aplicación con tu correo institucional @" + cfg.dominio + "." };
  } else if (correo.split("@")[1] !== cfg.dominio) {
    usuario = { correo: correo, codigo: "FUERA_DEL_DOMINIO", denegado: "La cuenta " + correo + " no pertenece al dominio " + cfg.dominio +
          ". Inicia sesión con tu correo institucional." };
  } else {
    const clave = claveCache_("rol", correo);
    usuario = leerDeCache_(clave);
    if (!usuario) {
      usuario = rolDeCuenta_(correo, cfg);
      guardarEnCache_(clave, usuario, SEGUNDOS_CACHE_USUARIO_);
    }
  }
  usuarioCache_ = usuario;
  return usuario;
}

/**
 * Rol de una cuenta del dominio según la pestaña Usuarios (o SIS_ROL_POR_DEFECTO).
 * @param {string} correo En minúsculas.
 * @param {Configuracion} cfg
 * @returns {Usuario}
 */
function rolDeCuenta_(correo, cfg) {
  const fila = leerTabla_(TABLA_.USUARIOS).filter(function (f) { return f.correo.trim().toLowerCase() === correo; })[0];
  const rol = rolNormalizado_(fila ? fila.rol : cfg.rolPorDefecto);
  if (!rol) {
    return { correo: correo, codigo: "SIN_ROL", denegado: "La cuenta " + correo + " no tiene un rol en SISCargaLectiva. " +
             "Pide que la añadan a la pestaña Usuarios de la hoja del sistema." };
  }
  return {
    correo: correo,
    rol: rol,
    /* Carreras cuyo plan coordina (y puede editar). */
    carreras: rol === "coordinador" ? carrerasDeTexto_(fila ? fila.carreras : "") : [],
    /* Departamento del director: uno solo; si la celda trae varios, vale el primero. */
    departamento: rol === "director" ? (departamentosDeTexto_(fila ? fila.departamento : "")[0] || "") : "",
    pordefecto: !fila
  };
}

/**
 * «director», «coordinador» o null a partir del texto de la celda.
 * @param {string} texto
 * @returns {"director"|"coordinador"|null}
 */
function rolNormalizado_(texto) {
  const n = Dominio.normalizar(texto);
  if (n.indexOf("DIRECTOR") >= 0) return "director";
  if (n.indexOf("COORDINADOR") >= 0) return "coordinador";
  return null;
}

/**
 * Siglas de las carreras escritas en una celda («ADM, DER»), sin repetir.
 * @param {string} texto
 * @returns {Sigla[]}
 */
function carrerasDeTexto_(texto) {
  const res = [];
  String(texto || "").split(/[,;\/\n]+/).forEach(function (t) {
    const s = Dominio.siglaDeCarrera(t);
    if (s && res.indexOf(s) < 0) res.push(s);
  });
  return res;
}

/**
 * Siglas de los departamentos escritos en una celda, sin repetir.
 * @param {string} texto
 * @returns {Dpto[]}
 */
function departamentosDeTexto_(texto) {
  const res = [];
  String(texto || "").split(/[,;\/\n]+/).forEach(function (t) {
    const s = Dominio.normalizarDpto(t.trim());
    if (s && res.indexOf(s) < 0) res.push(s);
  });
  return res;
}

/**
 * Cuenta que hace la llamada; si no puede entrar, falla con su código.
 * @returns {Usuario}
 */
function exigirUsuario_() {
  const usuario = usuarioActual_();
  if (usuario.denegado) fallo_(usuario.codigo || "SIN_ROL", usuario.denegado);
  return usuario;
}

/**
 * El ciclo recibido, si está en SIS_CICLOS; si no, falla con DATO_INVALIDO.
 * @param {*} ciclo
 * @returns {string}
 */
function validarCiclo_(ciclo) {
  const c = String(ciclo == null ? "" : ciclo);
  if (config_().ciclos.indexOf(c) < 0) fallo_("DATO_INVALIDO", "El ciclo «" + c + "» no está configurado.");
  return c;
}

/**
 * La sigla recibida, si es una carrera; si no, falla con DATO_INVALIDO.
 * @param {*} sig
 * @returns {Sigla}
 */
function validarCarrera_(sig) {
  const s = String(sig == null ? "" : sig);
  if (!Dominio.CARRERAS.some(function (c) { return c.sig === s; })) fallo_("DATO_INVALIDO", "La carrera «" + s + "» no existe.");
  return s;
}

/**
 * La sigla recibida, si es un departamento; si no, falla con DATO_INVALIDO.
 * @param {*} dpto
 * @returns {Dpto}
 */
function validarDpto_(dpto) {
  const d = String(dpto == null ? "" : dpto);
  if (Dominio.DPTOS.indexOf(d) < 0) fallo_("DATO_INVALIDO", "El departamento «" + d + "» no existe.");
  return /** @type {Dpto} */ (d);
}
