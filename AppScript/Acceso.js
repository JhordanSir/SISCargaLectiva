// @ts-check
/* Identidad y permisos. La aplicación se publica con acceso para el dominio
   institucional, así que Google ya exige una cuenta de ese dominio; aquí se
   comprueba de nuevo y se busca el rol en la pestaña Usuarios.
   Coordinador: registra y edita el plan de las carreras de su columna «carreras»;
   consulta los demás planes y la asignación docente en solo lectura.
   Director: es de un departamento (columna «departamento»). Asigna los docentes de los
   cursos que piden a su departamento y puede derivar esos cursos a otro departamento;
   no edita los planes. Consulta todo lo demás en solo lectura.
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
  const coordina = rol === "coordinador" ? carrerasDeTexto_(fila ? fila.carreras : "") : [];
  return {
    correo: correo,
    rol: rol,
    /* Carreras cuyo plan puede editar. */
    carreras: coordina,
    coordina: coordina,
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
 * Falla con SIN_PERMISO si la cuenta no coordina esa carrera.
 * @param {Usuario} usuario
 * @param {Sigla} sig
 * @returns {void}
 */
function exigirEdicion_(usuario, sig) {
  if (usuario.carreras.indexOf(sig) < 0)
    fallo_("SIN_PERMISO", usuario.rol === "director"
      ? "El director de departamento no edita los planes de ciclo: los consulta y puede derivar a otro departamento los cursos que piden al suyo."
      : "Tu cuenta no tiene permiso para editar el plan de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarlo.");
}

/**
 * La carga de una carrera la edita el director del departamento de la carrera. El de otro
 * departamento solo si tiene cursos de esa carrera derivados a él; para saberlo hacen falta
 * las secciones del ciclo (unidades).
 * @param {Usuario} usuario
 * @param {string} carrera
 * @param {Seccion[]=} unidades
 * @returns {boolean}
 */
function puedeEditarCarga_(usuario, carrera, unidades) {
  if (usuario.rol !== "director" || !usuario.departamento) return false;
  if (Dominio.dptoDeCarrera(carrera) === usuario.departamento) return true;
  return (unidades || []).some(function (s) { return s.carrera === carrera && s.dpto === usuario.departamento; });
}

/**
 * Falla con SIN_PERMISO si la cuenta no puede editar la carga de esa carrera.
 * @param {Usuario} usuario
 * @param {string} carrera
 * @param {Seccion[]=} unidades
 * @returns {void}
 */
function exigirCarga_(usuario, carrera, unidades) {
  if (puedeEditarCarga_(usuario, carrera, unidades)) return;
  if (usuario.rol !== "director") fallo_("SIN_PERMISO", "El coordinador de carrera consulta la asignación docente en solo lectura.");
  if (!usuario.departamento) fallo_("SIN_PERMISO", "Tu cuenta de director no tiene departamento. Pide que lo escriban en la columna «departamento» de la pestaña Usuarios.");
  const d = usuario.departamento;
  fallo_("SIN_PERMISO", "Solo asignas docentes en las carreras de " + d + " (" + Dominio.carrerasDeDpto(d).join(", ") + ") y en los cursos derivados a " + d +
                        ". La carga de " + Dominio.nombreCarrera(carrera) + " la consultas en solo lectura.");
}

/**
 * Para lo que se repite mientras se edita (latido, copia de recuperación, restaurar):
 * basta con ser el director de la carrera o tener su bloqueo, que solo se da tras
 * comprobar el permiso completo. Si no, se comprueba con las secciones del ciclo.
 * @param {Usuario} usuario
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {void}
 */
function exigirCargaEnEdicion_(usuario, ciclo, carrera) {
  if (puedeEditarCarga_(usuario, carrera)) return;
  const b = bloqueoDe_(ciclo, Dominio.REF.carga(carrera));
  if (usuario.rol === "director" && b && b.correo === usuario.correo) return;
  exigirCarga_(usuario, carrera, seccionesDelCiclo_(ciclo));
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
