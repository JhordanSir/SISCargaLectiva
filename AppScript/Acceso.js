/* Identidad y permisos. La aplicación se publica con acceso para el dominio
   institucional, así que Google ya exige una cuenta de ese dominio; aquí se
   comprueba de nuevo y se busca el rol en la pestaña Usuarios.
   Director: edita todas las carreras. Coordinador: solo las de su columna «carreras».
   Ambos consultan todas en solo lectura. */
var usuarioCache_ = null;

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
    const fila = leerTabla_("Usuarios").filter(function (f) { return f.correo.trim().toLowerCase() === correo; })[0];
    const rol = rolNormalizado_(fila ? fila.rol : cfg.rolPorDefecto);
    if (!rol) {
      u = { correo: correo, denegado: "La cuenta " + correo + " no tiene asignado el rol de Responsable del Plan de Ciclo. " +
            "Añádela a la pestaña Usuarios de la hoja del sistema o contacta con la administración del sistema." };
    } else {
      u = {
        correo: correo,
        rol: rol,
        carreras: rol === "director" ? Dominio.CARRERAS.map(function (c) { return c.sig; }) : carrerasDeTexto_(fila ? fila.carreras : ""),
        pordefecto: !fila
      };
    }
  }
  usuarioCache_ = u;
  return u;
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

function exigirUsuario_() {
  const u = usuarioActual_();
  if (u.denegado) throw new Error(u.denegado);
  return u;
}

function exigirEdicion_(u, sig) {
  if (u.carreras.indexOf(sig) < 0)
    throw new Error("Tu cuenta no tiene permiso para editar el plan de " + Dominio.nombreCarrera(sig) + ": solo puedes consultarlo.");
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
