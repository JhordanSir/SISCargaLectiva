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

function usuarioActual_() {
  if (usuarioCache_) return usuarioCache_;
  const cfg = config_();
  const correo = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  let u;

  if (!correo) {
    u = { codigo: "NO_AUTENTICADO", denegado: "No se pudo identificar tu cuenta de Google. Abre la aplicación con tu correo institucional @" + cfg.dominio + "." };
  } else if (correo.split("@")[1] !== cfg.dominio) {
    u = { correo: correo, codigo: "FUERA_DEL_DOMINIO", denegado: "La cuenta " + correo + " no pertenece al dominio " + cfg.dominio +
          ". Inicia sesión con tu correo institucional." };
  } else {
    const clave = claveCache_("rol", correo);
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

function departamentosDeTexto_(texto) {
  const res = [];
  String(texto || "").split(/[,;\/\n]+/).forEach(function (t) {
    const s = Dominio.normalizarDpto(t.trim());
    if (s && res.indexOf(s) < 0) res.push(s);
  });
  return res;
}

function exigirUsuario_() {
  const u = usuarioActual_();
  if (u.denegado) fallo_(u.codigo || "SIN_ROL", u.denegado);
  return u;
}

function exigirEdicion_(u, sig) {
  if (u.carreras.indexOf(sig) < 0)
    fallo_("SIN_PERMISO", u.rol === "director"
      ? "El director de departamento no edita los planes de ciclo: los consulta y puede derivar a otro departamento los cursos que piden al suyo."
      : "Tu cuenta no tiene permiso para editar el plan de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarlo.");
}

/* Solo el director de un departamento edita su carga docente. */
function puedeEditarCarga_(u, dpto) {
  return u.rol === "director" && !!u.departamento && u.departamento === dpto;
}

function exigirCarga_(u, dpto) {
  if (puedeEditarCarga_(u, dpto)) return;
  if (u.rol !== "director") fallo_("SIN_PERMISO", "El coordinador de carrera consulta la asignación docente en solo lectura.");
  if (!u.departamento) fallo_("SIN_PERMISO", "Tu cuenta de director no tiene departamento. Pide que lo escriban en la columna «departamento» de la pestaña Usuarios.");
  fallo_("SIN_PERMISO", "Solo asignas docentes en " + u.departamento + ". La carga de " + dpto + " la consultas en solo lectura.");
}

function validarCiclo_(ciclo) {
  const c = String(ciclo == null ? "" : ciclo);
  if (config_().ciclos.indexOf(c) < 0) fallo_("DATO_INVALIDO", "El ciclo «" + c + "» no está configurado.");
  return c;
}

function validarCarrera_(sig) {
  const s = String(sig == null ? "" : sig);
  if (!Dominio.CARRERAS.some(function (c) { return c.sig === s; })) fallo_("DATO_INVALIDO", "La carrera «" + s + "» no existe.");
  return s;
}

function validarDpto_(dpto) {
  const d = String(dpto == null ? "" : dpto);
  if (Dominio.DPTOS.indexOf(d) < 0) fallo_("DATO_INVALIDO", "El departamento «" + d + "» no existe.");
  return d;
}
