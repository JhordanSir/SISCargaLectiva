/* Identidad y permisos. La aplicación se publica con acceso para el dominio
   institucional, así que Google ya exige una cuenta de ese dominio; aquí se comprueba de
   nuevo y se busca el rol en _SYS_USUARIOS (correo, rol, carreras, departamento).
   Director: edita la oferta de todas las carreras y asigna docentes en las filas cuyo DPTO
   es el suyo; con «TODOS», en cualquiera (P114, P116). Coordinador: edita la oferta de las
   carreras de su columna «carreras» y consulta los docentes. Ambos consultan todo. Una
   cuenta que no figura no entra (P125), salvo que SIS_ROL_POR_DEFECTO diga otra cosa.
   El rol de cada cuenta se guarda 5 minutos en la caché del script: un cambio en
   _SYS_USUARIOS tarda como mucho eso en aplicarse. */
var usuarioCache_ = null;
var SEGUNDOS_CACHE_USUARIO_ = 300;

var MENSAJE_SIN_ROL_ = "Acceso denegado. La cuenta no cuenta con permisos de Responsable del Plan de Ciclo. " +
                       "Contacte con la administración del sistema.";

function usuarioActual_() {
  if (usuarioCache_) return usuarioCache_;
  const cfg = config_();
  const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  let u;

  if (!correo) {
    u = { denegado: "No se pudo identificar tu cuenta de Google. Abre la aplicación con tu correo institucional @" + cfg.dominio + "." };
  } else if (correo.split("@")[1] !== cfg.dominio) {
    u = { correo: correo, denegado: "La cuenta " + correo + " no pertenece al dominio " + cfg.dominio +
          ". Inicia sesión con tu correo institucional." };
  } else {
    const clave = claveCache_("u", correo);
    u = leerDeCache_(clave);
    if (!u) {
      u = rolDeCuenta_(correo, cfg);
      guardarEnCache_(clave, u, SEGUNDOS_CACHE_USUARIO_);
    }
  }
  usuarioCache_ = u;
  return u;
}

function rolDeCuenta_(correo, cfg) {
  const fila = leerTabla_("_SYS_USUARIOS").filter(function (f) { return f.correo.trim().toLowerCase() === correo; })[0];
  const rol = rolNormalizado_(fila ? fila.rol : cfg.rolPorDefecto);
  if (!rol) return { correo: correo, denegado: MENSAJE_SIN_ROL_ };
  return {
    correo: correo,
    rol: rol,
    carreras: rol === "director" ? Dominio.CARRERAS.map(function (c) { return c.sig; }) : carrerasDeTexto_(fila ? fila.carreras : ""),
    departamento: rol === "director" ? departamentoDeTexto_(fila ? fila.departamento : "") : "",
    pordefecto: !fila
  };
}

function rolNormalizado_(texto) {
  const n = Dominio.normalizar(texto);
  if (n.indexOf("DIRECTOR") >= 0) return "director";
  if (n.indexOf("COORDINADOR") >= 0) return "coordinador";
  return null;
}

function carrerasDeTexto_(texto) {
  const res = [];
  String(texto || "").split(/[,;\/\n]+/).forEach(function (t) {
    const s = Dominio.siglaDeCarrera(t);
    if (s && res.indexOf(s) < 0) res.push(s);
  });
  return res;
}

/* «TODOS» o la sigla de un departamento; vacío si no se reconoce (ese Director edita la
   oferta, pero no asigna docentes). */
function departamentoDeTexto_(texto) {
  const n = Dominio.normalizar(texto);
  if (n === "TODOS") return "TODOS";
  return Dominio.DPTOS.indexOf(n) >= 0 ? n : (Dominio.normalizarDpto(texto) || "");
}

function exigirUsuario_() {
  const u = usuarioActual_();
  if (u.denegado) throw new Error(u.denegado);
  return u;
}

function exigirEdicion_(u, sig) {
  if (u.carreras.indexOf(sig) < 0)
    throw new Error("Tu cuenta no tiene permiso para editar el plan de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarlo.");
}

function exigirDirector_(u) {
  if (u.rol !== "director") throw new Error("Solo un Director de departamento puede hacerlo.");
}

/* ¿Puede la cuenta asignar docentes a una asignatura que pide cobertura a «dpto»? (P114) */
function puedeAsignar_(u, dpto) {
  return u.rol === "director" && (u.departamento === "TODOS" || (!!u.departamento && Dominio.normalizarDpto(dpto) === u.departamento));
}

function validarCiclo_(ciclo) {
  const c = String(ciclo == null ? "" : ciclo);
  if (config_().ciclos.indexOf(c) < 0) throw new Error("El ciclo «" + c + "» no está configurado.");
  return c;
}

function validarCarrera_(sig) {
  const s = String(sig == null ? "" : sig);
  if (!Dominio.CARRERAS.some(function (c) { return c.sig === s; })) throw new Error("La carrera «" + s + "» no existe.");
  return s;
}
