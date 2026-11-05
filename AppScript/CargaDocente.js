/* =====================================================================
   CargaDocente.js · servidor del CU-002 «Carga docente»
   ---------------------------------------------------------------------
   CÓMO LEER ESTE ARCHIVO
   • Hay UNA función por acción de la vista (CargaDocenteVista.html). Cada una se lee de arriba abajo,
     como un texto: PASO 1, PASO 2… Todo lo que hace está escrito dentro de ella, aunque se repita en otras
     funciones (por ejemplo, armar las secciones desde el plan), para no tener que saltar de un lado a otro.
   • Al principio de cada función hay unas «herramientas» de una línea que solo usa esa función:
       fallo("mensaje")  corta la acción y el mensaje llega al navegador tal cual.
       leer("X")         📥 todas las filas de la pestaña X, sin la fila de cabeceras.
       texto(v)          v como texto ("" si es null o undefined).
       N(v)              texto para comparar: mayúsculas, sin tildes, espacios reducidos.
       json(t)           el objeto de un texto JSON, o {} si está vacío o dañado.
   • Marcas en los comentarios:
       📥 SHEET · LEE       aquí se traen datos del Google Sheet
       📤 SHEET · ESCRIBE   aquí se agrega o se reescribe una fila
       🗑 SHEET · BORRA     aquí se borra una fila
       🔒 CANDADO          solo una escritura a la vez en todo el script (LockService)
       ↩ RESPUESTA         lo que vuelve al navegador
       ⬅ VIENE DE / ➡ SIGUE EN   de dónde llega la llamada y dónde continúa la historia
   • Todas devuelven { ok: true, datos } o { ok: false, error } y nunca lanzan: cada una termina con un
     catch. Un error previsto (fallo) llega con su mensaje; uno inesperado, como «Error interno: …».

   QUÉ BOTÓN LLAMA A QUÉ FUNCIÓN   (botón → método de CargaDocenteVista.html → función de aquí)
     Abrir la vista / selector «Ciclo» ...... inicio()           → cargaInicio
     Editar / Ver ........................... abrir(sigla)       → cargaAbrir
     Interpretar / subir CSV (carga masiva) . interpretar()      → cargaInterpretar
     Buscar (docente) ....................... buscarDocentes()   → cargaBuscarDocentes
     Guardar ................................ guardar()          → cargaGuardar
     (solo, cada 5 min si hubo actividad) ... mantener()         → cargaMantener
     Salir / cerrar la pestaña .............. salir()            → cargaSalir
     Historial .............................. historial()        → cargaHistorial
     Ver (una versión del historial) ........ version(n)         → cargaVersion
     Restaurar .............................. restaurar(n)       → cargaRestaurar
     «Aplicar a la tabla», «Descartar», «Usar» y escribir un docente no llaman al servidor.

   PESTAÑAS DEL SHEET QUE USA (todas como texto; la fila 1 son cabeceras)
     Usuarios (correo, rol, carreras, departamento) · Ciclos (ciclo) · Carreras (sigla, nombre, departamento)
     Docentes (DOCENTE, DEPARTAMENTO, CONDICION, DEDICACION, CARGO, TC_OTRA_UNIV, NO_LECTIVAS)
     Planes (ciclo, carrera, version, usuario, fecha, contenido): las escribe el CU-001; aquí solo se leen.
     Cargas (ciclo, carrera, version, usuario, fecha, motivo, contenido): de solo agregar; la vigente es la de
       número más alto. contenido = { asignaciones: [{ clave, comp, docente, horas, codigo, semestre, dpto, intl }] }.
     Bloqueos (cu, ciclo, carrera, correo, vence): aquí se usan las filas con cu = «carga».
   No usa nada de los otros archivos: todo lo de aquí empieza por «carga».
   ===================================================================== */

/** @typedef {{ok: boolean, datos?: *, error?: string}} CargaRespuesta Lo que devuelve cada función pública. */

var CARGA_DOMINIO_ = "@ulasalle.edu.pe";
var CARGA_BLOQUEO_MS_ = 30 * 60000; /* el bloqueo vence a los 30 min sin actividad */
var CARGA_MAX_CELDA_ = 50000;       /* caracteres por celda de la hoja */
var CARGA_SIN_BLOQUEO_ = "Tu bloqueo venció o lo tomó otra cuenta: lo que no guardaste se perdió.";

/* =====================================================================
   ACCIÓN · Abrir «Carga docente» o cambiar el selector «Ciclo»
   ===================================================================== */

/**
 * La tabla de carreras: versión del plan y de la carga, cuántos componentes tienen docente, quién edita y si
 * puedes editarla.
 * ⬅ VIENE DE: CargaDocenteVista.html → inicio().
 * ↩ RESPUESTA: { ciclos, ciclo, carreras: [{ sigla, nombre, departamento, versionPlan, version, usuario, fecha,
 *   asignados, componentes, editor, puedeEditar }] }.
 * @param {string} ciclo Vacío = el último de la pestaña Ciclos.
 * @returns {CargaRespuesta}
 */
function cargaInicio(ciclo) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  try {
    /* PASO 1 · ¿Quién eres? Google da el correo; tiene que ser de la universidad. 📥 SHEET · LEE «Usuarios»: tu rol
       (columna B) y tu departamento (columna D). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const departamento = texto(filaUsuario[3]).trim().toUpperCase();

    /* PASO 2 · ¿Qué ciclo? 📥 SHEET · LEE «Ciclos». Sin ciclo elegido (la primera vez) se usa el último de la lista. */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);

    /* PASO 3 · 📥 SHEET · LEE «Carreras»: todas, con su departamento (el director edita las de su departamento). */
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);

    /* PASO 4 · 📥 SHEET · LEE «Planes» (el CU-001 los escribe): el plan vigente de cada carrera en este ciclo (la versión
       más alta) con sus asignaturas. Sin plan, la carrera no se puede abrir aquí. */
    const planes = {};
    leer("Planes").forEach(f => {
      const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
      if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
    });
    Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });

    /* PASO 5 · 📥 SHEET · LEE «Cargas»: la carga vigente (versión más alta) de cada carrera en este ciclo. */
    const vigentes = {};
    leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(),
      motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(v => v.ciclo === ciclo && v.version > 0)
      .forEach(v => { if (!vigentes[v.carrera] || v.version > vigentes[v.carrera].version) vigentes[v.carrera] = v; });

    /* PASO 6 · 📥 SHEET · LEE «Bloqueos»: los bloqueos de carga vigentes de este ciclo (vence en el futuro). */
    const bloqueos = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
      correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() })).filter(b => b.cu === "carga" && b.ciclo === ciclo && b.vigente);

    /* PASO 7 · Fusiones entre grupos de todos los planes (para saber qué grupos se asignan en otra carrera). Una fusión
       vive en el plan que la creó; si un grupo está en dos, gana la de su propia carrera. ref = «CARRERA|CODIGO|GRUPO». */
    const ref = (car, codigo, n) => N(car) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(n);
    const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
    const existe = {}, fusionDe = {};
    recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
    recorrerGrupos((c, a, g) => {
      const f = g.fusion;
      if (!f || !f.principal || !Array.isArray(f.miembros)) return;
      if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
      f.miembros.forEach(m => {
        const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
        if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
      });
    });

    /* PASO 8 · Una fila de la tabla por carrera. */
    const filas = carreras.map(c => {
      const v = vigentes[c.sigla], b = bloqueos.filter(x => x.carrera === c.sigla)[0];
      let componentes = 0, asignados = 0;
      if (planes[c.sigla]) {
        /* 8a · Componentes de la carrera: un T y/o P por grupo asignable (T1…Tn / P1…Pn con desdoble). Los grupos
           fusionados cuyo principal es otro no cuentan (se asignan allí). */
        const secciones = [];
        planes[c.sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
          const r = ref(c.sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
          if (fz && (p ? ref(p.carrera, p.codigo, p.grupo) : "") !== r) return;
          const componentesG = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
          const horas = v => (numero(v) !== null ? numero(v) : 0);
          const ht = horas(g.ht), hp = horas(g.hp), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th);
          const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
            .forEach(comp => componentesG.push({ comp, horas: h, docente: "" }));
          if (ht > 0) poner("T", ht);
          if (hp > 0) poner("P", hp);
          if (!componentesG.length && th > 0) componentesG.push({ comp: "T", horas: th, docente: "" });
          secciones.push({ clave: c.sigla + "|" + texto(a.codigo || a.nombre).trim() + "|" + g.n, componentes: componentesG });
        }));
        /* 8b · Pone en cada componente el docente de la carga vigente (por clave «CARRERA|CODIGO|GRUPO» + componente) y cuenta. */
        const porComp = {};
        secciones.forEach(s => s.componentes.forEach(k => { porComp[s.clave + "|" + k.comp] = k; }));
        const lista = v ? json(v.contenido).asignaciones : null;
        (Array.isArray(lista) ? lista : []).forEach(a => { const k = porComp[a.clave + "|" + a.comp]; if (k) k.docente = texto(a.docente); });
        secciones.forEach(s => s.componentes.forEach(k => { componentes++; if (k.docente) asignados++; }));
      }
      return {
        sigla: c.sigla, nombre: c.nombre, departamento: c.departamento, versionPlan: planes[c.sigla] ? planes[c.sigla].version : 0,
        version: v ? v.version : 0, usuario: v ? v.usuario : "", fecha: v ? v.fecha : "", asignados, componentes,
        editor: b ? b.correo : "",
        /* 8c · Edita el director del departamento de la carrera; los demás la ven en solo lectura. */
        puedeEditar: rol === "director" && !!departamento && departamento === c.departamento
      };
    });

    /* PASO 9 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → inicio(): la guarda en this.carreras y x-for pinta la tabla. */
    return { ok: true, datos: { ciclos, ciclo, carreras: filas } };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Editar» o «Ver» de una carrera
   ===================================================================== */

/**
 * Abre la carga de una carrera: sus secciones (desde el plan vigente) con los docentes de la carga vigente. En
 * «edicion» si puedes editarla y ninguna otra cuenta la edita (toma o renueva el bloqueo); si no, en «lectura».
 * ⬅ VIENE DE: CargaDocenteVista.html → abrir(sigla). También restaurar(n), que vuelve a abrir al terminar.
 * ↩ RESPUESTA: { ciclo, carrera, nombre, departamento, modo, motivo, editor, vence, version, versionPlan,
 *   secciones, noAsignables, huerfanas, catalogo }.
 * @param {string} ciclo
 * @param {string} carrera Sigla de la pestaña Carreras.
 * @returns {CargaRespuesta}
 */
function cargaAbrir(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  const claveDocente = nombre => N(texto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»: rol y departamento). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const departamento = texto(filaUsuario[3]).trim().toUpperCase();

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera (hace falta el de todas por las fusiones).
       Sin plan de esta carrera no hay secciones: se avisa. */
    const planes = {};
    leer("Planes").forEach(f => {
      const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
      if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
    });
    Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
    if (!planes[sigla]) fallo(sigla + " no tiene plan registrado en " + ciclo);

    /* PASO 4 · SECCIONES de la carrera a partir de los planes vigentes:
       · una sección por grupo sin fusión, y una por fusión cuyo grupo principal es de esta carrera;
       · los demás grupos fusionados van a «noAsignables» («fusionado con …», sin campo de docente);
       · cada sección tiene sus componentes: T si HT > 0, P si HP > 0, T1…Tn / P1…Pn si hay desdoble, y una sola T con
         TH si HT y HP son 0. Una fusión vive en el plan que la creó; si un grupo está en dos, gana la de su carrera. */
    const ref = (c, codigo, n) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(n);
    const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
    const existe = {}, fusionDe = {};
    recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
    recorrerGrupos((c, a, g) => {
      const f = g.fusion;
      if (!f || !f.principal || !Array.isArray(f.miembros)) return;
      if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
      f.miembros.forEach(m => {
        const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
        if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
      });
    });
    const secciones = [], noAsignables = [];
    planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
      const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
      const refP = p ? ref(p.carrera, p.codigo, p.grupo) : "";
      if (fz && refP !== r) {
        const misma = N(p.carrera) === sigla;
        noAsignables.push({ codigo: texto(a.codigo), asignatura: texto(a.nombre), semestre: a.semestre, grupo: g.n, dpto: texto(a.dpto),
          texto: misma ? "fusionado con el grupo " + p.grupo + " de " + p.codigo : "fusionado con " + p.carrera + " " + p.codigo + " grupo " + p.grupo,
          principalRef: misma ? refP : "", carreraPrincipal: texto(p.carrera) });
        return;
      }
      const fusion = fz ? fz.fusion : null;
      const avisos = [], componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
      const horas = (v, nombre) => numero(v) !== null ? numero(v) : (texto(v).trim() && avisos.push(nombre + " no numérico («" + v + "»): se toma 0."), 0);
      const ht = horas(g.ht, "HT"), hp = horas(g.hp, "HP"), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th, "TH");
      const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
        .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
      if (ht > 0) poner("T", ht);
      if (hp > 0) poner("P", hp);
      if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
      const pr = fusion ? ref(fusion.principal.carrera, fusion.principal.codigo, fusion.principal.grupo) : "";
      secciones.push({
        clave: sigla + "|" + texto(a.codigo || a.nombre).trim() + "|" + g.n,
        codigo: texto(a.codigo), asignatura: texto(a.nombre), semestre: a.semestre === undefined ? null : a.semestre,
        grupo: g.n, dpto: texto(a.dpto).trim().toUpperCase(), ht, hp, th,
        intl: /INTERNACIONAL|VIRTUAL/.test(N(texto(g.obs) + " " + texto(a.obs))),
        fusion: fusion ? "con " + fusion.miembros.filter(m => ref(m.carrera, m.codigo, m.grupo) !== pr).map(m => m.carrera + " " + m.codigo + "-" + m.grupo).join(", ") : "",
        componentes, avisos
      });
    }));

    /* PASO 5 · 📥 SHEET · LEE «Cargas»: las versiones de la carga de esta carrera y la vigente (versión más alta). */
    let vigente = null;
    leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(),
      motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(v => v.ciclo === ciclo && v.version > 0)
      .forEach(v => { if (v.carrera === sigla && (!vigente || v.version > vigente.version)) vigente = v; });

    /* PASO 6 · ¿Puedes editarla? El director del departamento de la carrera. */
    const puede = rol === "director" && !!departamento && departamento === car.departamento;

    /* PASO 7 · 🔒 CANDADO: decide edición o lectura y, si es edición, escribe el bloqueo sin que otro se cruce. */
    const candado = LockService.getScriptLock();
    candado.waitLock(10000);
    let modo;
    try {
      /* 7a · 📥 SHEET · LEE «Bloqueos»: las filas de carga de esta carrera y ciclo. ¿Otra cuenta la edita ahora? */
      const todos = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
        correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() })).filter(b => b.cu === "carga" && b.ciclo === ciclo && b.carrera === sigla);
      const otro = todos.filter(b => b.vigente && b.correo !== correo)[0];
      if (!puede || otro) {
        /* 7b · LECTURA: no es de tu departamento, u otra cuenta la edita. No se escribe nada. */
        modo = { modo: "lectura", editor: otro ? otro.correo : "", vence: "",
          motivo: puede ? "En edición por " + otro.correo : "Solo lectura: no es una carrera de tu departamento" };
      } else {
        /* 7c · EDICIÓN. 📤 SHEET · ESCRIBE en «Bloqueos» [carga, ciclo, carrera, tu correo, ahora + 30 min]: reescribe tu fila
           (o la primera de esta carrera, aunque esté vencida) o agrega una nueva. Lo que empieza por = + - @ lleva apóstrofo. */
        const vence = new Date(Date.now() + CARGA_BLOQUEO_MS_ - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
        const mio = todos.filter(b => b.correo === correo)[0] || todos[0];
        const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bloqueos");
        const celdas = ["carga", ciclo, sigla, correo, vence].map(x => { const s = texto(x); return /^[=+\-@]/.test(s) ? "'" + s : s; });
        let fila = mio ? mio.fila : 0;
        if (!fila) { hoja.appendRow(celdas); fila = hoja.getLastRow(); }
        hoja.getRange(fila, 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);
        modo = { modo: "edicion", motivo: "", editor: correo, vence };
      }
    } finally { candado.releaseLock(); }

    /* PASO 8 · Pone en cada componente el docente de la carga vigente (por clave «CARRERA|CODIGO|GRUPO» + componente).
       Las asignaciones cuyo componente ya no existe en el plan vigente son «huérfanas»: se avisan y se pierden al guardar. */
    const porComp = {};
    secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = c; }));
    const asignaciones = (() => { const l = vigente ? json(vigente.contenido).asignaciones : null; return Array.isArray(l) ? l : []; })();
    const huerfanas = asignaciones.filter(a => { const c = porComp[a.clave + "|" + a.comp]; if (c) c.docente = texto(a.docente); return !c; })
      .map(a => ({ clave: a.clave, comp: a.comp, docente: a.docente, codigo: a.codigo || "", horas: a.horas || 0 }));

    /* PASO 9 · 📥 SHEET · LEE «Docentes»: el catálogo (sin repetidos) para las sugerencias del campo de docente. */
    const lista = [], vistos = {};
    leer("Docentes").forEach(f => {
      const docente = texto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || vistos[k]) return;
      vistos[k] = true;
      lista.push({ docente, departamento: texto(f[1]).trim().toUpperCase() });
    });

    /* PASO 10 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → abrir(): guarda doc, pinta las secciones y, en edición,
       programa el latido de 5 minutos (mantener → cargaMantener). */
    return { ok: true, datos: Object.assign({ ciclo, carrera: car.sigla, nombre: car.nombre, departamento: car.departamento }, modo, {
      version: vigente ? vigente.version : 0, versionPlan: planes[sigla].version, secciones, noAsignables, huerfanas, catalogo: lista }) };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Interpretar» de la carga masiva (o elegir un .csv, que termina en lo mismo)
   ===================================================================== */

/**
 * Lee el rango pegado o el CSV con el formato CargaXDepartamento y empareja cada fila con una sección del plan
 * vigente. NO escribe nada: devuelve una previsualización; «Aplicar a la tabla» la vuelca en la vista y recién
 * «Guardar» la lleva al Sheet.
 * ⬅ VIENE DE: CargaDocenteVista.html → interpretar() (y leerArchivo, que lee el .csv y llama a interpretar()).
 * ↩ RESPUESTA: { asignaciones, sinSeccion, noEnCatalogo, descartadas, avisos }.
 * @param {string} texto Filas separadas por tabulación, «;» o «,».
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {CargaRespuesta}
 */
function cargaInterpretar(texto, ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  /* (aquí la herramienta se llama aTexto porque «texto» es lo pegado) */
  const aTexto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => aTexto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = aTexto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  const claveDocente = nombre => N(aTexto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). Basta con tener rol. */
    const correo = aTexto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = aTexto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: aTexto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = aTexto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);
    if (!aTexto(texto).trim()) fallo("Pega el rango o sube un CSV");

    /* PASO 3 · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera. Sin plan de esta carrera no hay con qué emparejar. */
    const planes = {};
    leer("Planes").forEach(f => {
      const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
      if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
    });
    Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
    if (!planes[car.sigla]) fallo(car.sigla + " no tiene plan registrado en " + ciclo);

    /* PASO 4 · SECCIONES de la carrera (igual que al abrir la carga): una por grupo asignable con sus componentes T/P.
       porRef une la referencia «CARRERA|CODIGO|GRUPO» de cada grupo con su sección; los grupos fusionados cuyo
       principal es otro guardan a dónde apuntan (principalRef) o en qué carrera se asignan (carreraPrincipal). */
    const ref = (c, codigo, n) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(n);
    const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
    const existe = {}, fusionDe = {};
    recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
    recorrerGrupos((c, a, g) => {
      const f = g.fusion;
      if (!f || !f.principal || !Array.isArray(f.miembros)) return;
      if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
      f.miembros.forEach(m => {
        const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
        if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
      });
    });
    const porRef = {};
    planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
      const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
      const refP = p ? ref(p.carrera, p.codigo, p.grupo) : "";
      if (fz && refP !== r) {
        const misma = N(p.carrera) === sigla;
        porRef[r] = { codigo: aTexto(a.codigo), asignatura: aTexto(a.nombre), semestre: a.semestre, grupo: g.n, dpto: aTexto(a.dpto),
          texto: misma ? "fusionado con el grupo " + p.grupo + " de " + p.codigo : "fusionado con " + p.carrera + " " + p.codigo + " grupo " + p.grupo,
          principalRef: misma ? refP : "", carreraPrincipal: aTexto(p.carrera) };
        return;
      }
      const componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
      const horas = v => (numero(v) !== null ? numero(v) : 0);
      const ht = horas(g.ht), hp = horas(g.hp), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th);
      const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
        .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
      if (ht > 0) poner("T", ht);
      if (hp > 0) poner("P", hp);
      if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
      porRef[r] = { clave: sigla + "|" + aTexto(a.codigo || a.nombre).trim() + "|" + g.n, codigo: aTexto(a.codigo), asignatura: aTexto(a.nombre), grupo: g.n, componentes };
    }));

    /* PASO 5 · 📥 SHEET · LEE «Docentes»: el catálogo, para usar el nombre exacto del docente y avisar si no está. */
    const porClave = {};
    leer("Docentes").forEach(f => {
      const docente = aTexto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || porClave[k]) return;
      porClave[k] = { docente };
    });

    /* PASO 6 · Partir el texto en filas y celdas. Separador: tabulación si aparece en las 5 primeras líneas no vacías (la
       hoja real empieza con una fecha en una sola celda); si no, «;» o «,», el que más aparezca. Comillas al estilo
       Excel: un campo entre comillas puede tener separadores y saltos de línea, y "" es una comilla. */
    const t = aTexto(texto).replace(/^﻿/, ""), primeras = t.split(/\r?\n/).filter(l => l.trim()).slice(0, 5).join("\n");
    const cuenta = c => primeras.split(c).length - 1, filas = [];
    const sep = cuenta("\t") ? "\t" : (cuenta(",") > cuenta(";") ? "," : ";");
    let fila = [], campo = "", comillas = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (comillas) {
        if (ch !== '"') campo += ch;
        else if (t[i + 1] === '"') { campo += '"'; i++; }
        else comillas = false;
      } else if (ch === '"' && campo === "") comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && t[i + 1] === "\n") i++;
        fila.push(campo); filas.push(fila); fila = []; campo = "";
      } else campo += ch;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }

    /* PASO 7 · Buscar la fila de cabeceras (con DOCENTE y CODIGO; las cabeceras reales traen saltos de línea, por eso se
       normalizan) y la columna de cada campo. */
    const norm = filas.map(f => f.map(N));
    const ic = norm.findIndex(f => f.indexOf("DOCENTE") >= 0 && f.indexOf("CODIGO") >= 0);
    if (ic < 0) fallo("No encontré la fila de cabeceras (DOCENTE, CODIGO…).");
    const col = nombres => norm[ic].findIndex(c => nombres.indexOf(c) >= 0), celda = (f, i) => aTexto(f[i]).replace(/\s+/g, " ").trim();
    const k = { docente: col(["DOCENTE"]), carrera: col(["CARRERA"]), semestre: col(["SEMESTRE"]), codigo: col(["CODIGO"]),
      asignatura: col(["ASIGNATURA", "CURSO"]), ht: col(["HORAS TEORICAS", "HT"]), hp: col(["HORAS PRACTICAS", "HP"]) };

    /* PASO 8 · Fila por fila. El docente va solo en la primera fila de su bloque: las siguientes con DOCENTE vacío lo
       heredan, y una fila con «TOTAL» termina el bloque. Cada fila de esta carrera con código se empareja con su sección
       por CÓDIGO + grupo (SEMESTRE «1-2» → grupo 2) y llena T y/o P según las horas que trae. */
    const r = { asignaciones: [], sinSeccion: [], noEnCatalogo: [], descartadas: 0, avisos: [] }, usados = {};
    let docente = "";
    for (let i = ic + 1; i < filas.length; i++) {
      const f = filas[i], numFila = i + 1, codigo = celda(f, k.codigo), asignatura = celda(f, k.asignatura);
      /* «TOTAL» (DIMA) o «TOTAL PROFESORES»… en la columna CÓDIGO (DACJ): fin del bloque del docente. */
      if (norm[i].some(c => /^TOTAL\b/.test(c))) { docente = ""; continue; }
      if (celda(f, k.docente)) docente = celda(f, k.docente);
      if (!codigo) continue;
      const carreraFila = N(celda(f, k.carrera));
      if (carreraFila && carreraFila !== sigla) { r.descartadas++; continue; }
      const m = /^\d+\s*-\s*(\d+)$/.exec(celda(f, k.semestre)), grupo = m ? Number(m[1]) : 1;
      const sin = motivo => r.sinSeccion.push({ fila: numFila, codigo, grupo, asignatura, docente, motivo });
      if (!docente) { sin("sin docente"); continue; }
      /* 8a · La sección: si el grupo está fusionado, la del grupo principal (o se avisa que se asigna en otra carrera). */
      let s = porRef[ref(sigla, codigo, grupo)];
      if (s && !s.componentes && !s.principalRef) { sin("se asigna en " + s.carreraPrincipal); continue; }
      if (s && !s.componentes) s = porRef[s.principalRef];
      if (!s) { sin("no está en el plan"); continue; }
      /* 8b · Qué componentes llena: T si trae horas teóricas, P si trae prácticas; sin horas, los que tenga la sección. */
      const ht = numero(celda(f, k.ht)) || 0, hp = numero(celda(f, k.hp)) || 0;
      const bases = ["T", "P"].filter(b => (ht > 0 || hp > 0 ? (b === "T" ? ht : hp) > 0 : s.componentes.some(c => c.comp[0] === b)));
      if (!bases.length) { sin("la sección no tiene horas en el plan"); continue; }
      /* 8c · Nombre exacto del catálogo si está; con desdoble (P1, P2…) toma el primer subcomponente libre. Si el
         componente ya se asignó en otra fila, gana la primera y se avisa. */
      const cat = porClave[claveDocente(docente)], nombre = cat ? cat.docente : docente.slice(0, 120);
      bases.forEach(b => {
        const candidatos = s.componentes.filter(c => c.comp[0] === b), libre = candidatos.filter(c => !usados[s.clave + "|" + c.comp])[0];
        if (!candidatos.length) return sin("el plan no tiene componente " + b);
        if (!libre) return r.avisos.push("Fila " + numFila + ": " + s.codigo + " grupo " + s.grupo + " (" + b + ") ya se asignó en la fila " +
          usados[s.clave + "|" + candidatos[0].comp] + "; se queda la primera.");
        usados[s.clave + "|" + libre.comp] = numFila;
        r.asignaciones.push({ clave: s.clave, comp: libre.comp, docente: nombre, fila: numFila, codigo: s.codigo, grupo: s.grupo, asignatura: s.asignatura });
        if (!cat && r.noEnCatalogo.indexOf(nombre) < 0) r.noEnCatalogo.push(nombre);
      });
    }
    if (r.descartadas) r.avisos.unshift("Se descartaron " + r.descartadas + " filas de otra carrera.");
    if (r.sinSeccion.length) r.avisos.push(r.sinSeccion.length + " filas sin sección asignable en el plan.");

    /* PASO 9 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → interpretar(): la previsualización con «Aplicar a la tabla»
       y «Descartar». Nada se guardó todavía. */
    return { ok: true, datos: r };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Buscar» del panel «Buscar docente» (o Enter en su campo)
   ===================================================================== */

/**
 * Busca docentes del catálogo y de las cargas vigentes del ciclo que tengan TODAS las palabras escritas (sin
 * distinguir tildes ni mayúsculas). Las horas son la suma de sus componentes en las cargas GUARDADAS de todas las
 * carreras. Máximo 30 resultados. No escribe nada.
 * ⬅ VIENE DE: CargaDocenteVista.html → buscarDocentes().
 * ↩ RESPUESTA: { resultados: [{ docente, departamento, horas, carreras }], total }.
 * @param {string} ciclo
 * @param {string} texto Lo escrito en el buscador.
 * @returns {CargaRespuesta}
 */
function cargaBuscarDocentes(ciclo, texto) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  /* (aquí la herramienta se llama aTexto porque «texto» es lo buscado) */
  const aTexto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => aTexto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  /* Nombre para comparar: normalizado y sin comas ni puntos («PÉREZ, Juan.» = «PEREZ JUAN»). */
  const claveDocente = nombre => N(aTexto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). Basta con tener rol. */
    const correo = aTexto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras» (las cargas se suman de todas). */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = aTexto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: aTexto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);

    /* PASO 3 · Lo buscado, normalizado: al menos 2 letras. */
    const buscado = claveDocente(aTexto(texto).slice(0, 100));
    if ((buscado.match(/[A-Z]/g) || []).length < 2) fallo("Escribe al menos 2 letras");

    /* PASO 4 · 📥 SHEET · LEE «Cargas»: la carga vigente (versión más alta) de cada carrera en este ciclo. */
    const vigentes = {};
    leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(),
      motivo: aTexto(f[5]).trim(), contenido: aTexto(f[6]) })).filter(v => v.ciclo === ciclo && v.version > 0)
      .forEach(v => { if (!vigentes[v.carrera] || v.version > vigentes[v.carrera].version) vigentes[v.carrera] = v; });

    /* PASO 5 · 📥 SHEET · LEE «Docentes»: una ficha por docente del catálogo (sin repetidos), con 0 horas. */
    const fichas = {}, vistos = {};
    leer("Docentes").forEach(f => {
      const docente = aTexto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || vistos[k]) return;
      vistos[k] = true;
      fichas[k] = { docente, departamento: aTexto(f[1]).trim().toUpperCase(), horas: 0, carreras: [] };
    });

    /* PASO 6 · Suma las horas de cada docente en las cargas vigentes de todas las carreras (y en qué carreras dicta).
       Un docente que no está en el catálogo pero sí en una carga también tiene ficha. */
    carreras.forEach(c => {
      const lista = vigentes[c.sigla] ? json(vigentes[c.sigla].contenido).asignaciones : null;
      (Array.isArray(lista) ? lista : []).forEach(a => {
        const k = claveDocente(a.docente), f = fichas[k] = fichas[k] || { docente: a.docente, departamento: "", horas: 0, carreras: [] };
        f.horas = Math.round((f.horas + (Number(a.horas) || 0)) * 100) / 100;
        if (f.carreras.indexOf(c.sigla) < 0) f.carreras.push(c.sigla);
      });
    });

    /* PASO 7 · Se quedan las fichas que contienen CADA palabra (en cualquier orden), en orden alfabético. */
    const palabras = buscado.split(" "), claves = Object.keys(fichas).filter(k => palabras.every(p => k.indexOf(p) >= 0)).sort();

    /* PASO 8 · ↩ RESPUESTA (máximo 30; total sirve para avisar que hay más). ➡ SIGUE EN CargaDocenteVista.html →
       buscarDocentes(): la tabla de resultados con el botón «Usar». */
    return { ok: true, datos: { resultados: claves.slice(0, 30).map(k => fichas[k]), total: claves.length } };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Guardar»
   ===================================================================== */

/**
 * Guarda la carga como versión nueva (una fila más en Cargas) y suelta el bloqueo. Antes: exige ser el director de
 * esa carrera, que el bloqueo siga siendo tuyo y que nadie haya guardado otra versión desde que abriste; limpia las
 * asignaciones y aplica las reglas A07–A15. Si un docente pasa de 40 h (A07) o falta el motivo de A12, NO se escribe.
 * ⬅ VIENE DE: CargaDocenteVista.html → guardar().
 * ↩ RESPUESTA: { guardado, version, fecha, advertencias, requiereMotivo }.
 * @param {string} ciclo
 * @param {string} carrera
 * @param {Array<{clave: string, comp: string, docente: string}>} asignaciones Los componentes con docente de la tabla.
 * @param {number} versionBase La de cargaAbrir (0 si no había carga).
 * @param {string} motivo Obligatorio si un docente con cargo pasa de 24 h (A12).
 * @returns {CargaRespuesta}
 */
function cargaGuardar(ciclo, carrera, asignaciones, versionBase, motivo) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  const claveDocente = nombre => N(texto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»: rol y departamento). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const departamento = texto(filaUsuario[3]).trim().toUpperCase();

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · Solo el director del departamento de la carrera puede guardar (aunque el navegador lo haya permitido). */
    if (!(rol === "director" && !!departamento && departamento === car.departamento))
      fallo("Solo el director de " + car.departamento + " puede editar la carga de " + sigla + ".");

    /* PASO 4 · Lo que manda el navegador: versión base (entero ≥ 0), motivo (máx. 500 caracteres) y la lista de asignaciones. */
    const base = typeof versionBase === "number" || (typeof versionBase === "string" && versionBase.trim()) ? Number(versionBase) : NaN;
    if (!Number.isInteger(base) || base < 0) fallo("Versión base inválida.");
    const mot = typeof motivo === "string" ? motivo.trim().slice(0, 500) : "";

    /* PASO 5 · 📥 SHEET · LEE «Docentes»: el catálogo con los datos que usan las reglas (condición, dedicación, cargo, TC en
       otra universidad, horas no lectivas). */
    const catalogo = {};
    leer("Docentes").forEach(f => {
      const docente = texto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || catalogo[k]) return;
      catalogo[k] = { docente, departamento: texto(f[1]).trim().toUpperCase(), condicion: texto(f[2]),
        dedicacion: texto(f[3]), cargo: texto(f[4]).trim(), tcOtra: texto(f[5]), noLectivas: texto(f[6]) };
    });
    if (!Array.isArray(asignaciones) || asignaciones.length > 5000) fallo("Las asignaciones no tienen el formato esperado.");

    /* PASO 6 · 🔒 CANDADO: desde aquí hasta escribir, nadie más puede escribir en el Sheet (espera hasta 10 s). */
    const candado = LockService.getScriptLock();
    candado.waitLock(10000);
    try {
      /* 6a · 📥 SHEET · LEE «Bloqueos»: tu bloqueo de esta carga tiene que existir, ser tuyo y no haber vencido. */
      const bloqueos = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
        correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() })).filter(b => b.cu === "carga" && b.ciclo === ciclo && b.carrera === car.sigla);
      if (!bloqueos.filter(b => b.vigente && b.correo === correo)[0]) fallo(CARGA_SIN_BLOQUEO_);

      /* 6b · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera (sin plan de esta carrera no hay secciones). */
      const planes = {};
      leer("Planes").forEach(f => {
        const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
        if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
      });
      Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
      if (!planes[sigla]) fallo(sigla + " no tiene plan registrado en " + ciclo);

      /* 6c · SECCIONES de la carrera desde los planes vigentes (igual que al abrir): una por grupo asignable, con sus
         componentes T/P (T1…Tn / P1…Pn con desdoble) y sus horas, código, semestre, dpto e «intl». */
      const ref = (c, codigo, n) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(n);
      const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
      const existe = {}, fusionDe = {};
      recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
      recorrerGrupos((c, a, g) => {
        const f = g.fusion;
        if (!f || !f.principal || !Array.isArray(f.miembros)) return;
        if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
        f.miembros.forEach(m => {
          const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
          if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
        });
      });
      const secciones = [];
      planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
        const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
        if (fz && (p ? ref(p.carrera, p.codigo, p.grupo) : "") !== r) return;
        const componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
        const horas = v => (numero(v) !== null ? numero(v) : 0);
        const ht = horas(g.ht), hp = horas(g.hp), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th);
        const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
          .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
        if (ht > 0) poner("T", ht);
        if (hp > 0) poner("P", hp);
        if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
        secciones.push({ clave: sigla + "|" + texto(a.codigo || a.nombre).trim() + "|" + g.n, codigo: texto(a.codigo),
          semestre: a.semestre === undefined ? null : a.semestre, dpto: texto(a.dpto).trim().toUpperCase(),
          intl: /INTERNACIONAL|VIRTUAL/.test(N(texto(g.obs) + " " + texto(a.obs))), componentes });
      }));

      /* 6d · 📥 SHEET · LEE «Cargas»: la vigente de esta carrera (para comparar con la versión base) y las vigentes de las
         OTRAS carreras (sus horas cuentan en las reglas). */
      const vigentes = {};
      leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(),
        motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(v => v.ciclo === ciclo && v.version > 0)
        .forEach(v => { if (!vigentes[v.carrera] || v.version > vigentes[v.carrera].version) vigentes[v.carrera] = v; });
      const v = vigentes[sigla] || null, actual = v ? v.version : 0;
      const asignacionesDe = x => { const l = x ? json(x.contenido).asignaciones : null; return Array.isArray(l) ? l : []; };
      const otras = carreras.filter(c => c.sigla !== sigla).flatMap(c => asignacionesDe(vigentes[c.sigla]));

      /* 6e · ¿La versión con la que abriste sigue siendo la vigente? Si alguien guardó entre medio, se rechaza. */
      if (base > actual) fallo("La versión base (v" + base + ") no existe: sal y vuelve a abrir la carga.");
      if (base < actual) fallo("Hay una versión más nueva (v" + actual + ", guardada por " + v.usuario + " el " +
        v.fecha.slice(0, 10) + " " + v.fecha.slice(11, 16) + "). Sal y vuelve a abrir para ver los cambios.");

      /* 6f · LIMPIAR las asignaciones: se descartan las vacías; las repetidas y las que no son un componente del plan
         vigente se descartan con un aviso; se usa el nombre exacto del catálogo y se toman las horas, el código, el
         semestre y el dpto DEL PLAN (no del navegador). */
      const porComp = {}, nuevas = [];
      let descartadas = 0;
      secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = { s, c }; }));
      asignaciones.forEach(a => {
        const nombre = a && typeof a.docente === "string" ? a.docente.replace(/\s+/g, " ").trim().slice(0, 120) : "";
        const k = nombre && a.clave + "|" + a.comp, x = porComp[k];
        if (!nombre) return;
        if (!x) return descartadas++;
        delete porComp[k];
        const cat = catalogo[claveDocente(nombre)];
        nuevas.push({ clave: x.s.clave, comp: x.c.comp, docente: cat ? cat.docente : nombre, horas: x.c.horas,
          codigo: x.s.codigo, semestre: x.s.semestre, dpto: x.s.dpto, intl: x.s.intl });
      });

      /* 6g · REGLAS. Las horas de cada docente = sus componentes en TODAS las carreras: las cargas vigentes de las otras
         más la nueva de esta. */
      const advertencias = [], nombres = {}, todasLasHoras = otras.concat(nuevas);
      let bloquea = false, requiereMotivo = false;
      /* A13 · componentes que quedan sin docente. */
      const libres = secciones.reduce((t, s) => t + s.componentes.length, 0) - nuevas.length;
      if (libres > 0) advertencias.push({ codigo: "A13", nivel: "advertencia", docente: "", texto: "Quedan " + libres + " componentes sin docente." });
      nuevas.forEach(a => { nombres[claveDocente(a.docente)] = a.docente; });
      /* Un docente a la vez, en orden alfabético (así sus avisos salen juntos). */
      Object.keys(nombres).sort().forEach(clave => {
        const docente = nombres[clave], cat = catalogo[clave], es = a => claveDocente(a.docente) === clave;
        const suyas = todasLasHoras.filter(es), aqui = nuevas.filter(es), sem = {};
        const h = Math.round(suyas.reduce((t, a) => t + (Number(a.horas) || 0), 0) * 100) / 100;
        const poner = (codigo, nivel, t) => advertencias.push({ codigo, nivel, docente, texto: t });
        /* A07 · más de 40 h: impide guardar. */
        if (h > 40) { bloquea = true; poner("A07", "bloqueo", "Supera las 40 h lectivas (" + h + " h). No se puede guardar."); }
        /* A11 · varios cursos distintos en un mismo semestre de esta carrera. */
        aqui.forEach(a => { if (a.semestre != null) (sem[a.semestre] = sem[a.semestre] || new Set()).add(a.codigo); });
        Object.keys(sem).forEach(s => { if (sem[s].size > 1) poner("A11", "advertencia", "Dicta " + sem[s].size + " cursos distintos en " +
          sigla + ", semestre " + s + " (" + [...sem[s]].join(", ") + ")."); });
        /* Fuera del catálogo: se avisa y no se pueden aplicar las demás reglas. */
        if (!cat) return poner("—", "advertencia", "No está en la pestaña Docentes (" + h + " h en el ciclo).");
        /* A08 · tiempo completo en otra universidad y más de 16 h. */
        if (N(cat.tcOtra) === "SI" && h > 16) poner("A08", "advertencia", "Tiene tiempo completo en otra universidad y supera las 16 h (" + h + " h).");
        /* A09 · ordinario con más de 24 h. */
        if (N(cat.condicion) === "ORDINARIO" && h > 24) poner("A09", "advertencia", "Docente ordinario con más de 24 h (" + h + " h).");
        /* A10 · tiempo parcial con menos de 8 h y algún curso no internacional. */
        if (N(cat.dedicacion) === "TP" && h > 0 && h < 8 && suyas.some(a => !a.intl))
          poner("A10", "advertencia", "Tiempo parcial con menos de 8 h (" + h + " h) y dicta cursos no internacionales.");
        /* A12 · con cargo: más de 24 h exige un motivo (sin motivo no se guarda); más de 20 h, solo aviso. */
        if (cat.cargo && h > 24) {
          requiereMotivo = requiereMotivo || !mot;
          poner("A12", "motivo", "Tiene cargo (" + cat.cargo + ") y supera las 24 h (" + h + " h): " +
            (mot ? "se guarda con el motivo." : "escribe un motivo para guardar."));
        } else if (cat.cargo && h > 20) poner("A12", "advertencia", "Tiene cargo (" + cat.cargo + ") y supera las 20 h (" + h + " h).");
        /* A14 · dicta cursos de otro departamento (préstamo): solo informativo. */
        const prestamos = aqui.map(a => a.dpto).filter((d, i, l) => d && cat.departamento && d !== cat.departamento && l.indexOf(d) === i);
        if (prestamos.length) poner("A14", "info", "Es de " + cat.departamento + " y dicta cursos de " + prestamos.join(", ") + " (préstamo).");
        /* A15 · tiempo completo cuyas horas lectivas + no lectivas no llegan a 40. */
        const noLectivas = numero(cat.noLectivas);
        if (N(cat.dedicacion) === "TC" && noLectivas !== null && h + noLectivas < 40)
          poner("A15", "advertencia", "Tiempo completo: " + h + " h lectivas + " + noLectivas + " h no lectivas no llegan a 40 h.");
      });
      if (descartadas) advertencias.unshift({ codigo: "", nivel: "advertencia", docente: "",
        texto: "Se descartaron " + descartadas + " asignaciones que no corresponden a un componente del plan vigente." });

      /* 6h · A07 o falta el motivo de A12: ↩ RESPUESTA con guardado = false. NO se escribe nada y el bloqueo sigue siendo
         tuyo para que corrijas. ➡ SIGUE EN CargaDocenteVista.html → guardar(): muestra el error y las advertencias. */
      if (bloquea || requiereMotivo)
        return { ok: true, datos: { guardado: false, version: actual, fecha: "", advertencias, requiereMotivo } };

      /* 6i · 📤 SHEET · ESCRIBE una fila NUEVA al final de «Cargas»: [ciclo, carrera, versión + 1, tu correo, fecha de Perú,
         motivo, JSON con las asignaciones limpias]. Primero se comprueba que el JSON quepa en una celda. La fila se deja
         con formato de texto (@) y lo que empieza por = + - @ lleva apóstrofo. */
      const contenido = JSON.stringify({ asignaciones: nuevas }), fecha = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
      if (contenido.length > CARGA_MAX_CELDA_) fallo("La carga no cabe en una celda (" + contenido.length + " de " + CARGA_MAX_CELDA_ + " caracteres).");
      const hojaCargas = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cargas");
      const celdas = [ciclo, car.sigla, actual + 1, correo, fecha, mot, contenido].map(x => { const s = texto(x); return /^[=+\-@]/.test(s) ? "'" + s : s; });
      hojaCargas.appendRow(celdas);
      hojaCargas.getRange(hojaCargas.getLastRow(), 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);

      /* 6j · 🗑 SHEET · BORRA tus filas de «Bloqueos» de esta carga (de abajo hacia arriba, para que no se corran los
         números de fila): guardar termina la edición. */
      const hojaBloqueos = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bloqueos");
      bloqueos.filter(b => b.correo === correo).reverse().forEach(b => hojaBloqueos.deleteRow(b.fila));

      /* PASO 7 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → guardar(): vuelve a la tabla (inicio → cargaInicio) con
         «Guardado como vN» y las advertencias. */
      return { ok: true, datos: { guardado: true, version: actual + 1, fecha, advertencias, requiereMotivo: false } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Latido cada 5 minutos (no tiene botón)
   ===================================================================== */

/**
 * Renueva por 30 minutos más tu bloqueo de la carga. Si ya no es tuyo, falla con CARGA_SIN_BLOQUEO_ y la vista
 * vuelve a la tabla.
 * ⬅ VIENE DE: CargaDocenteVista.html → el reloj de abrir() → mantener(), cada 5 minutos si hubo actividad.
 * ↩ RESPUESTA: { vence }.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {CargaRespuesta}
 */
function cargaMantener(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · 🔒 CANDADO para leer y reescribir el bloqueo sin que otro se cruce. */
    const candado = LockService.getScriptLock();
    candado.waitLock(10000);
    try {
      /* 3a · 📥 SHEET · LEE «Bloqueos»: tu bloqueo de esta carga tiene que existir, ser tuyo y no haber vencido. */
      const b = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
        correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() }))
        .filter(x => x.cu === "carga" && x.ciclo === ciclo && x.carrera === car.sigla).filter(x => x.vigente && x.correo === correo)[0];
      if (!b) fallo(CARGA_SIN_BLOQUEO_);

      /* 3b · 📤 SHEET · ESCRIBE (reescribe la MISMA fila de «Bloqueos») con vence = ahora + 30 minutos. */
      const vence = new Date(Date.now() + CARGA_BLOQUEO_MS_ - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
      const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bloqueos");
      const celdas = ["carga", ciclo, car.sigla, correo, vence].map(x => { const s = texto(x); return /^[=+\-@]/.test(s) ? "'" + s : s; });
      hoja.getRange(b.fila, 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);

      /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → mantener(): actualiza «Bloqueo hasta HH:MM». */
      return { ok: true, datos: { vence } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Salir» (y cerrar la pestaña con una carga abierta)
   ===================================================================== */

/**
 * Suelta tu bloqueo de la carga: borra tus filas de Bloqueos de esa carrera y ciclo (las de otra cuenta no se tocan).
 * ⬅ VIENE DE: CargaDocenteVista.html → salir(), y el evento «pagehide» de su init() al cerrar la pestaña.
 * ↩ RESPUESTA: {}.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {CargaRespuesta}
 */
function cargaSalir(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · 🔒 CANDADO. */
    const candado = LockService.getScriptLock();
    candado.waitLock(10000);
    try {
      /* 3a · 📥 SHEET · LEE «Bloqueos»: tus filas de carga de esta carrera y ciclo (vencidas o no). */
      const mias = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
        correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() }))
        .filter(b => b.cu === "carga" && b.ciclo === ciclo && b.carrera === car.sigla).filter(b => b.correo === correo);
      /* 3b · 🗑 SHEET · BORRA esas filas, de abajo hacia arriba (para que no se corran los números de fila). */
      const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bloqueos");
      mias.reverse().forEach(b => hoja.deleteRow(b.fila));
    } finally { candado.releaseLock(); }

    /* PASO 4 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → salir(): cierra la carga y vuelve a pedir la tabla. */
    return { ok: true, datos: {} };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Historial»
   ===================================================================== */

/**
 * Las versiones de la carga, de la más nueva a la más vieja, con un resumen: cuántos componentes tienen docente
 * (sobre el plan vigente), el motivo y si restaura otra versión. No escribe nada.
 * ⬅ VIENE DE: CargaDocenteVista.html → historial().
 * ↩ RESPUESTA: { versiones: [{ version, usuario, fecha, resumen }] }.
 * @param {string} ciclo
 * @param {string} carrera
 * @returns {CargaRespuesta}
 */
function cargaHistorial(ciclo, carrera) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera (para saber cuántos componentes hay en total). */
    const planes = {};
    leer("Planes").forEach(f => {
      const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
      if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
    });
    Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });

    /* PASO 4 · Total de componentes de la carrera (T/P de cada grupo asignable, con desdobles), igual que al abrir. Sin
       plan, 0. */
    let total = 0;
    if (planes[car.sigla]) {
      const ref = (c, codigo, n) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(n);
      const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
      const existe = {}, fusionDe = {};
      recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
      recorrerGrupos((c, a, g) => {
        const f = g.fusion;
        if (!f || !f.principal || !Array.isArray(f.miembros)) return;
        if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
        f.miembros.forEach(m => {
          const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
          if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
        });
      });
      planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
        const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
        if (fz && (p ? ref(p.carrera, p.codigo, p.grupo) : "") !== r) return;
        const d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
        const horas = v => (numero(v) !== null ? numero(v) : 0);
        const ht = horas(g.ht), hp = horas(g.hp), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th);
        const comps = [];
        const poner = letra => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra]).forEach(c => comps.push(c));
        if (ht > 0) poner("T");
        if (hp > 0) poner("P");
        if (!comps.length && th > 0) comps.push("T");
        total += comps.length;
      }));
    }

    /* PASO 5 · 📥 SHEET · LEE «Cargas»: todas las versiones de esta carrera y ciclo, de mayor a menor, con su resumen. */
    const versiones = leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(),
      fecha: f[4].trim(), motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(v => v.ciclo === ciclo && v.version > 0)
      .filter(v => v.carrera === sigla).sort((a, b) => b.version - a.version).map(v => {
        const contenido = json(v.contenido), de = contenido.restauradaDe, lista = Array.isArray(contenido.asignaciones) ? contenido.asignaciones : [];
        return { version: v.version, usuario: v.usuario, fecha: v.fecha, resumen: lista.length + " de " + total +
          " componentes con docente" + (v.motivo ? " · motivo: " + v.motivo : "") + (de ? " · restaura v" + de : "") };
      });

    /* PASO 6 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → historial(): la guarda en this.versiones y muestra el panel. */
    return { ok: true, datos: { versiones } };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Ver» de una versión del historial
   ===================================================================== */

/**
 * La versión n de la carga colocada sobre las secciones del plan VIGENTE, en solo lectura (mismo formato que
 * cargaAbrir). No escribe nada ni toca el bloqueo.
 * ⬅ VIENE DE: CargaDocenteVista.html → version(n).
 * ↩ RESPUESTA: igual que cargaAbrir, con modo «lectura» y motivo «Versión n · solo lectura».
 * @param {string} ciclo
 * @param {string} carrera
 * @param {number} n Número de versión.
 * @returns {CargaRespuesta}
 */
function cargaVersion(ciclo, carrera, n) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  const claveDocente = nombre => N(texto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · Número de versión: entero ≥ 0. */
    const num = typeof n === "number" || (typeof n === "string" && n.trim()) ? Number(n) : NaN;
    if (!Number.isInteger(num) || num < 0) fallo("Versión inválida.");

    /* PASO 4 · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera. Sin plan de esta carrera no hay secciones. */
    const planes = {};
    leer("Planes").forEach(f => {
      const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
      if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
    });
    Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
    if (!planes[car.sigla]) fallo(car.sigla + " no tiene plan registrado en " + ciclo);

    /* PASO 5 · SECCIONES de la carrera desde los planes vigentes (igual que al abrir la carga). */
    const ref = (c, codigo, grupo) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(grupo);
    const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
    const existe = {}, fusionDe = {};
    recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
    recorrerGrupos((c, a, g) => {
      const f = g.fusion;
      if (!f || !f.principal || !Array.isArray(f.miembros)) return;
      if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
      f.miembros.forEach(m => {
        const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
        if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
      });
    });
    const secciones = [], noAsignables = [];
    planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
      const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
      const refP = p ? ref(p.carrera, p.codigo, p.grupo) : "";
      if (fz && refP !== r) {
        const misma = N(p.carrera) === sigla;
        noAsignables.push({ codigo: texto(a.codigo), asignatura: texto(a.nombre), semestre: a.semestre, grupo: g.n, dpto: texto(a.dpto),
          texto: misma ? "fusionado con el grupo " + p.grupo + " de " + p.codigo : "fusionado con " + p.carrera + " " + p.codigo + " grupo " + p.grupo,
          principalRef: misma ? refP : "", carreraPrincipal: texto(p.carrera) });
        return;
      }
      const fusion = fz ? fz.fusion : null;
      const avisos = [], componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
      const horas = (v, nombre) => numero(v) !== null ? numero(v) : (texto(v).trim() && avisos.push(nombre + " no numérico («" + v + "»): se toma 0."), 0);
      const ht = horas(g.ht, "HT"), hp = horas(g.hp, "HP"), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th, "TH");
      const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
        .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
      if (ht > 0) poner("T", ht);
      if (hp > 0) poner("P", hp);
      if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
      const pr = fusion ? ref(fusion.principal.carrera, fusion.principal.codigo, fusion.principal.grupo) : "";
      secciones.push({
        clave: sigla + "|" + texto(a.codigo || a.nombre).trim() + "|" + g.n,
        codigo: texto(a.codigo), asignatura: texto(a.nombre), semestre: a.semestre === undefined ? null : a.semestre,
        grupo: g.n, dpto: texto(a.dpto).trim().toUpperCase(), ht, hp, th,
        intl: /INTERNACIONAL|VIRTUAL/.test(N(texto(g.obs) + " " + texto(a.obs))),
        fusion: fusion ? "con " + fusion.miembros.filter(m => ref(m.carrera, m.codigo, m.grupo) !== pr).map(m => m.carrera + " " + m.codigo + "-" + m.grupo).join(", ") : "",
        componentes, avisos
      });
    }));

    /* PASO 6 · 📥 SHEET · LEE «Cargas» y busca la versión n de esta carrera. */
    const v = leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(), fecha: f[4].trim(),
      motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(x => x.ciclo === ciclo && x.version > 0)
      .filter(x => x.carrera === sigla).filter(x => x.version === num)[0] || fallo("No existe la versión " + num + " de esta carga.");

    /* PASO 7 · Pone en cada componente el docente de ESA versión. Lo que ya no tiene componente en el plan vigente queda
       como «huérfano» (se muestra en un aviso). */
    const porComp = {};
    secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = c; }));
    const asignaciones = (() => { const l = json(v.contenido).asignaciones; return Array.isArray(l) ? l : []; })();
    const huerfanas = asignaciones.filter(a => { const c = porComp[a.clave + "|" + a.comp]; if (c) c.docente = texto(a.docente); return !c; })
      .map(a => ({ clave: a.clave, comp: a.comp, docente: a.docente, codigo: a.codigo || "", horas: a.horas || 0 }));

    /* PASO 8 · 📥 SHEET · LEE «Docentes»: el catálogo (la vista lo usa para las sugerencias). */
    const lista = [], vistos = {};
    leer("Docentes").forEach(f => {
      const docente = texto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || vistos[k]) return;
      vistos[k] = true;
      lista.push({ docente, departamento: texto(f[1]).trim().toUpperCase() });
    });

    /* PASO 9 · ↩ RESPUESTA en modo lectura. ➡ SIGUE EN CargaDocenteVista.html → version(n): guarda tu edición en «anterior»
       y muestra esta versión con el aviso «Versión n · solo lectura» y el botón «Volver». */
    return { ok: true, datos: Object.assign({ ciclo, carrera: car.sigla, nombre: car.nombre, departamento: car.departamento },
      { modo: "lectura", motivo: "Versión " + num + " · solo lectura", editor: "", vence: "" },
      { version: v.version, versionPlan: planes[sigla].version, secciones, noAsignables, huerfanas, catalogo: lista }) };
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}

/* =====================================================================
   ACCIÓN · Botón «Restaurar» de una versión del historial
   ===================================================================== */

/**
 * Copia la versión n como versión NUEVA (con restauradaDe: n), si ninguna otra cuenta edita la carga. Antes vuelve a
 * pasar las reglas sobre el plan vigente: A07 lo impide, y A12 usa el motivo que tenía la versión n (si no tenía, falla).
 * ⬅ VIENE DE: CargaDocenteVista.html → restaurar(n).
 * ↩ RESPUESTA: { version, fecha, advertencias }.
 * @param {string} ciclo
 * @param {string} carrera
 * @param {number} n Número de la versión que se copia.
 * @returns {CargaRespuesta}
 */
function cargaRestaurar(ciclo, carrera, n) {
  const fallo = mensaje => { throw Object.assign(new Error(mensaje), { cargaPrevisto: true }); };
  const leer = nombre => { const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre); if (!h) fallo("Falta la pestaña " + nombre + " en la hoja."); return h.getDataRange().getDisplayValues().slice(1); };
  const texto = v => (v === null || v === undefined ? "" : String(v));
  const N = s => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const json = t => { try { const o = JSON.parse(t); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const numero = v => { const s = texto(v).trim().replace(",", "."); return s !== "" && isFinite(Number(s)) ? Number(s) : null; };
  const claveDocente = nombre => N(texto(nombre).replace(/[.,]/g, " "));
  try {
    /* PASO 1 · ¿Quién eres? (correo, dominio y tu fila de 📥 «Usuarios»: rol y departamento). */
    const correo = texto(Session.getActiveUser().getEmail()).trim().toLowerCase();
    if (!correo) fallo("Acceso denegado: cuenta no identificada: Google no informó tu correo. Entra con tu cuenta " + CARGA_DOMINIO_ + ".");
    if (correo.slice(-CARGA_DOMINIO_.length) !== CARGA_DOMINIO_) fallo("Acceso denegado: cuenta fuera del dominio: solo pueden entrar cuentas " + CARGA_DOMINIO_ + ".");
    const filaUsuario = leer("Usuarios").filter(x => x[0].trim().toLowerCase() === correo)[0], rol = filaUsuario ? filaUsuario[1].trim().toLowerCase() : "";
    if (rol !== "coordinador" && rol !== "director") fallo("Acceso denegado: cuenta sin rol: " + correo + " no figura como coordinador ni director en la pestaña Usuarios.");
    const departamento = texto(filaUsuario[3]).trim().toUpperCase();

    /* PASO 2 · ¿Qué ciclo y qué carrera? 📥 SHEET · LEE «Ciclos» (vacío = el último) y «Carreras». */
    const ciclos = leer("Ciclos").map(x => x[0].trim()).filter(String);
    if (!ciclos.length) fallo("La pestaña Ciclos está vacía.");
    ciclo = texto(ciclo).trim() || ciclos[ciclos.length - 1];
    if (ciclos.indexOf(ciclo) < 0) fallo("Ciclo desconocido: " + ciclo);
    const carreras = leer("Carreras").map(x => ({ sigla: x[0].trim().toUpperCase(), nombre: x[1].trim(), departamento: texto(x[2]).trim().toUpperCase() })).filter(c => c.sigla);
    const sigla = texto(carrera).trim().toUpperCase(), car = carreras.filter(c => c.sigla === sigla)[0];
    if (carrera !== undefined && !car) fallo("Carrera desconocida: " + sigla);

    /* PASO 3 · Solo el director del departamento de la carrera puede restaurar. Número de versión: entero ≥ 0. */
    if (!(rol === "director" && !!departamento && departamento === car.departamento))
      fallo("Solo el director de " + car.departamento + " puede editar la carga de " + sigla + ".");
    const num = typeof n === "number" || (typeof n === "string" && n.trim()) ? Number(n) : NaN;
    if (!Number.isInteger(num) || num < 0) fallo("Versión inválida.");

    /* PASO 4 · 📥 SHEET · LEE «Docentes»: el catálogo con los datos que usan las reglas. */
    const catalogo = {};
    leer("Docentes").forEach(f => {
      const docente = texto(f[0]).replace(/\s+/g, " ").trim(), k = claveDocente(docente);
      if (!docente || catalogo[k]) return;
      catalogo[k] = { docente, departamento: texto(f[1]).trim().toUpperCase(), condicion: texto(f[2]),
        dedicacion: texto(f[3]), cargo: texto(f[4]).trim(), tcOtra: texto(f[5]), noLectivas: texto(f[6]) };
    });

    /* PASO 5 · 🔒 CANDADO. */
    const candado = LockService.getScriptLock();
    candado.waitLock(10000);
    try {
      /* 5a · 📥 SHEET · LEE «Bloqueos»: si otra cuenta edita esta carga ahora (bloqueo vigente), no se restaura. Si el
         bloqueo es tuyo, se conserva. */
      const otro = leer("Bloqueos").map((f, i) => ({ fila: i + 2, cu: f[0].trim(), ciclo: f[1].trim(), carrera: f[2].trim().toUpperCase(),
        correo: f[3].trim().toLowerCase(), vigente: new Date(f[4].trim()).getTime() > Date.now() }))
        .filter(b => b.cu === "carga" && b.ciclo === ciclo && b.carrera === car.sigla).filter(b => b.vigente && b.correo !== correo)[0];
      if (otro) fallo("No se puede restaurar: la carga está en edición por " + otro.correo + ".");

      /* 5b · 📥 SHEET · LEE «Planes»: el plan vigente de cada carrera (sin plan de esta carrera no hay secciones). */
      const planes = {};
      leer("Planes").forEach(f => {
        const c = f[1].trim().toUpperCase(), v = Number(f[2]) || 0;
        if (f[0].trim() === ciclo && v > 0 && (!planes[c] || v > planes[c].version)) planes[c] = { version: v, contenido: f[5] };
      });
      Object.keys(planes).forEach(c => { planes[c].asignaturas = (json(planes[c].contenido).asignaturas || []).filter(a => a && Array.isArray(a.grupos)); });
      if (!planes[sigla]) fallo(sigla + " no tiene plan registrado en " + ciclo);

      /* 5c · SECCIONES de la carrera desde los planes vigentes (igual que al abrir): componentes T/P con sus horas. */
      const ref = (c, codigo, grupo) => N(c) + "|" + N(codigo).replace(/ /g, "") + "|" + Number(grupo);
      const recorrerGrupos = fn => carreras.forEach(c => ((planes[c.sigla] || {}).asignaturas || []).forEach(a => a.grupos.forEach(g => fn(c.sigla, a, g))));
      const existe = {}, fusionDe = {};
      recorrerGrupos((c, a, g) => { existe[ref(c, a.codigo || a.nombre, g.n)] = true; });
      recorrerGrupos((c, a, g) => {
        const f = g.fusion;
        if (!f || !f.principal || !Array.isArray(f.miembros)) return;
        if (!existe[ref(f.principal.carrera, f.principal.codigo, f.principal.grupo)]) return;
        f.miembros.forEach(m => {
          const r = ref(m.carrera, m.codigo || m.nombre, m.grupo), previa = fusionDe[r], suya = N(m.carrera);
          if (!previa || (previa.de !== suya && c === suya)) fusionDe[r] = { fusion: f, de: c };
        });
      });
      const secciones = [];
      planes[sigla].asignaturas.forEach(a => a.grupos.forEach(g => {
        const r = ref(sigla, a.codigo || a.nombre, g.n), fz = fusionDe[r], p = fz ? fz.fusion.principal : null;
        if (fz && (p ? ref(p.carrera, p.codigo, p.grupo) : "") !== r) return;
        const componentes = [], d = g.desdoble && Number(g.desdoble.n) >= 2 && Number(g.desdoble.n) <= 9 ? g.desdoble : null;
        const horas = v => (numero(v) !== null ? numero(v) : 0);
        const ht = horas(g.ht), hp = horas(g.hp), th = g.th === undefined || g.th === "" ? ht + hp : horas(g.th);
        const poner = (letra, h) => (d && d.componente === letra ? Array.from({ length: Number(d.n) }, (_, i) => letra + (i + 1)) : [letra])
          .forEach(comp => componentes.push({ comp, horas: h, docente: "" }));
        if (ht > 0) poner("T", ht);
        if (hp > 0) poner("P", hp);
        if (!componentes.length && th > 0) componentes.push({ comp: "T", horas: th, docente: "" });
        secciones.push({ clave: sigla + "|" + texto(a.codigo || a.nombre).trim() + "|" + g.n, codigo: texto(a.codigo),
          semestre: a.semestre === undefined ? null : a.semestre, dpto: texto(a.dpto).trim().toUpperCase(),
          intl: /INTERNACIONAL|VIRTUAL/.test(N(texto(g.obs) + " " + texto(a.obs))), componentes });
      }));

      /* 5d · 📥 SHEET · LEE «Cargas»: la versión n de esta carrera, la vigente (para el número de la nueva) y las vigentes de
         las OTRAS carreras (sus horas cuentan en las reglas). */
      const todas = leer("Cargas").map(f => ({ ciclo: f[0].trim(), carrera: f[1].trim().toUpperCase(), version: Number(f[2]) || 0, usuario: f[3].trim(),
        fecha: f[4].trim(), motivo: texto(f[5]).trim(), contenido: texto(f[6]) })).filter(x => x.ciclo === ciclo && x.version > 0);
      const vigentes = {};
      todas.forEach(x => { if (!vigentes[x.carrera] || x.version > vigentes[x.carrera].version) vigentes[x.carrera] = x; });
      const asignacionesDe = x => { const l = x ? json(x.contenido).asignaciones : null; return Array.isArray(l) ? l : []; };
      const otras = carreras.filter(c => c.sigla !== sigla).flatMap(c => asignacionesDe(vigentes[c.sigla]));
      const v = todas.filter(x => x.carrera === sigla).filter(x => x.version === num)[0] || fallo("No existe la versión " + num + " de esta carga.");

      /* 5e · LIMPIAR las asignaciones de la versión n contra el plan VIGENTE: se descartan (con aviso) las que ya no son un
         componente del plan; se usa el nombre del catálogo y las horas del plan. */
      const porComp = {}, nuevas = [];
      let descartadas = 0;
      secciones.forEach(s => s.componentes.forEach(c => { porComp[s.clave + "|" + c.comp] = { s, c }; }));
      asignacionesDe(v).forEach(a => {
        const nombre = a && typeof a.docente === "string" ? a.docente.replace(/\s+/g, " ").trim().slice(0, 120) : "";
        const k = nombre && a.clave + "|" + a.comp, x = porComp[k];
        if (!nombre) return;
        if (!x) return descartadas++;
        delete porComp[k];
        const cat = catalogo[claveDocente(nombre)];
        nuevas.push({ clave: x.s.clave, comp: x.c.comp, docente: cat ? cat.docente : nombre, horas: x.c.horas,
          codigo: x.s.codigo, semestre: x.s.semestre, dpto: x.s.dpto, intl: x.s.intl });
      });

      /* 5f · REGLAS A07–A15 (las mismas que al guardar), con el motivo que tenía la versión n. */
      const advertencias = [], nombres = {}, todasLasHoras = otras.concat(nuevas), motivo = v.motivo;
      let bloquea = false, requiereMotivo = false;
      const libres = secciones.reduce((t, s) => t + s.componentes.length, 0) - nuevas.length;
      if (libres > 0) advertencias.push({ codigo: "A13", nivel: "advertencia", docente: "", texto: "Quedan " + libres + " componentes sin docente." });
      nuevas.forEach(a => { nombres[claveDocente(a.docente)] = a.docente; });
      Object.keys(nombres).sort().forEach(clave => {
        const docente = nombres[clave], cat = catalogo[clave], es = a => claveDocente(a.docente) === clave;
        const suyas = todasLasHoras.filter(es), aqui = nuevas.filter(es), sem = {};
        const h = Math.round(suyas.reduce((t, a) => t + (Number(a.horas) || 0), 0) * 100) / 100;
        const poner = (codigo, nivel, t) => advertencias.push({ codigo, nivel, docente, texto: t });
        if (h > 40) { bloquea = true; poner("A07", "bloqueo", "Supera las 40 h lectivas (" + h + " h). No se puede guardar."); }
        aqui.forEach(a => { if (a.semestre != null) (sem[a.semestre] = sem[a.semestre] || new Set()).add(a.codigo); });
        Object.keys(sem).forEach(s => { if (sem[s].size > 1) poner("A11", "advertencia", "Dicta " + sem[s].size + " cursos distintos en " +
          sigla + ", semestre " + s + " (" + [...sem[s]].join(", ") + ")."); });
        if (!cat) return poner("—", "advertencia", "No está en la pestaña Docentes (" + h + " h en el ciclo).");
        if (N(cat.tcOtra) === "SI" && h > 16) poner("A08", "advertencia", "Tiene tiempo completo en otra universidad y supera las 16 h (" + h + " h).");
        if (N(cat.condicion) === "ORDINARIO" && h > 24) poner("A09", "advertencia", "Docente ordinario con más de 24 h (" + h + " h).");
        if (N(cat.dedicacion) === "TP" && h > 0 && h < 8 && suyas.some(a => !a.intl))
          poner("A10", "advertencia", "Tiempo parcial con menos de 8 h (" + h + " h) y dicta cursos no internacionales.");
        if (cat.cargo && h > 24) {
          requiereMotivo = requiereMotivo || !motivo;
          poner("A12", "motivo", "Tiene cargo (" + cat.cargo + ") y supera las 24 h (" + h + " h): " +
            (motivo ? "se guarda con el motivo." : "escribe un motivo para guardar."));
        } else if (cat.cargo && h > 20) poner("A12", "advertencia", "Tiene cargo (" + cat.cargo + ") y supera las 20 h (" + h + " h).");
        const prestamos = aqui.map(a => a.dpto).filter((d, i, l) => d && cat.departamento && d !== cat.departamento && l.indexOf(d) === i);
        if (prestamos.length) poner("A14", "info", "Es de " + cat.departamento + " y dicta cursos de " + prestamos.join(", ") + " (préstamo).");
        const noLectivas = numero(cat.noLectivas);
        if (N(cat.dedicacion) === "TC" && noLectivas !== null && h + noLectivas < 40)
          poner("A15", "advertencia", "Tiempo completo: " + h + " h lectivas + " + noLectivas + " h no lectivas no llegan a 40 h.");
      });
      if (descartadas) advertencias.unshift({ codigo: "", nivel: "advertencia", docente: "",
        texto: "Se descartaron " + descartadas + " asignaciones que no corresponden a un componente del plan vigente." });

      /* 5g · A07 impide restaurar; A12 sin motivo en la versión n, también (hay que abrirla y guardarla con un motivo). */
      if (bloquea) fallo("No se puede restaurar la v" + num + ": " +
        advertencias.filter(a => a.nivel === "bloqueo").map(a => a.docente + ". " + a.texto).join(" "));
      if (requiereMotivo)
        fallo("La v" + num + " necesita un motivo (A12) y no lo tiene: abre la carga, revísala y guárdala con un motivo.");

      /* 5h · 📤 SHEET · ESCRIBE una fila NUEVA al final de «Cargas» con las asignaciones de la versión n (ya limpias), su
         motivo y restauradaDe: n. Primero se comprueba que el JSON quepa en una celda. Las demás versiones se quedan. */
      const version = vigentes[sigla].version + 1;
      const contenido = JSON.stringify({ asignaciones: nuevas, restauradaDe: num }), fecha = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 19) + "-05:00";
      if (contenido.length > CARGA_MAX_CELDA_) fallo("La carga no cabe en una celda (" + contenido.length + " de " + CARGA_MAX_CELDA_ + " caracteres).");
      const hojaCargas = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cargas");
      const celdas = [ciclo, car.sigla, version, correo, fecha, v.motivo, contenido].map(x => { const s = texto(x); return /^[=+\-@]/.test(s) ? "'" + s : s; });
      hojaCargas.appendRow(celdas);
      hojaCargas.getRange(hojaCargas.getLastRow(), 1, 1, celdas.length).setNumberFormat("@").setValues([celdas]);

      /* PASO 6 · ↩ RESPUESTA. ➡ SIGUE EN CargaDocenteVista.html → restaurar(n): vuelve a abrir la carga (abrir → cargaAbrir) y
         muestra «Se restauró la vn como vM.» con las advertencias. */
      return { ok: true, datos: { version, fecha, advertencias } };
    } finally { candado.releaseLock(); }
  } catch (e) {
    if (e && e.cargaPrevisto) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Error interno: " + (e && e.message ? e.message : e) };
  }
}
