// @ts-check
/* Entradas del diálogo «Limpiar la carpeta» (hoja/Limpieza.html). Deja en la carpeta de la
   app solo la hoja del sistema: lista lo demás (los .xlsx, la BD anterior, «Anteriores»…)
   y manda a la papelera lo que se marque. Nada se borra para siempre: la papelera de Drive
   lo guarda 30 días. Solo se puede mandar a la papelera lo que es de la cuenta. */

var MAX_ARCHIVOS_LIMPIEZA_ = 500;

/**
 * Las carpetas de la app (donde está esta hoja y donde estaba la BD anterior) y todo lo que
 * contienen, salvo esta hoja.
 * @returns {Respuesta<ListaLimpieza>}
 */
function limpiezaListar() {
  return responder_(function () {
    exigirPropietarioHoja_();
    return listaLimpieza_();
  });
}

/**
 * Manda a la papelera los archivos y carpetas elegidos de la lista (una carpeta, solo si
 * todo lo que contiene ya se mandó a la papelera) y, si se pide, mueve esta hoja a otra de las
 * carpetas de la lista.
 * @param {string[]} ids
 * @param {string=} moverA Id de una carpeta de la lista.
 * @returns {Respuesta<{resultados: Array<{id: string, nombre: string, ok: boolean, motivo: string}>, movida: boolean}>}
 */
function limpiezaAplicar(ids, moverA) {
  return responder_(function () {
    exigirPropietarioHoja_();
    if (!Array.isArray(ids) || ids.length > MAX_ARCHIVOS_LIMPIEZA_ || ids.some(function (x) { return typeof x !== "string"; }))
      fallo_("DATO_INVALIDO", "La lista de archivos no es válida.");
    const lista = listaLimpieza_();
    const porId = {};
    lista.archivos.forEach(function (a) { porId[a.id] = a; });
    const elegidos = {};
    ids.forEach(function (id) { if (porId[id]) elegidos[id] = true; });
    /* Primero los archivos y después las carpetas, de la más honda a la más alta. */
    const orden = lista.archivos.filter(function (a) { return elegidos[a.id]; })
      .sort(function (a, b) { return (a.carpeta ? 1 : 0) - (b.carpeta ? 1 : 0) || b.ruta.length - a.ruta.length; });
    const hechos = {};
    const resultados = orden.map(function (a) {
      const r = { id: a.id, nombre: a.nombre, ok: false, motivo: "" };
      if (a.conHoja) { r.motivo = "Contiene la hoja del sistema: se queda."; return r; }
      if (!a.propio) { r.motivo = "Es de " + a.propietario + ": solo esa cuenta puede mandarlo a la papelera."; return r; }
      if (a.carpeta && !a.completa) { r.motivo = "Tiene más de lo que se puede listar aquí: revísala en Drive."; return r; }
      if (a.carpeta && lista.archivos.some(function (x) { return x.padre === a.id && !hechos[x.id]; })) {
        r.motivo = "La carpeta conserva archivos que no se mandaron a la papelera: se queda.";
        return r;
      }
      try {
        (a.carpeta ? DriveApp.getFolderById(a.id) : DriveApp.getFileById(a.id)).setTrashed(true);
        r.ok = true;
        hechos[a.id] = true;
      } catch (e) {
        r.motivo = "Drive no lo permitió: " + e.message;
      }
      return r;
    });
    let movida = false;
    if (moverA) {
      if (!lista.carpetas.some(function (c) { return c.id === moverA; })) fallo_("DATO_INVALIDO", "La carpeta de destino no es de la lista.");
      DriveApp.getFileById(lista.hoja.id).moveTo(DriveApp.getFolderById(moverA));
      movida = true;
    }
    return { resultados: resultados, movida: movida };
  });
}

/**
 * Nombre legible del tipo de un archivo de Drive.
 * @param {string} mime
 * @returns {string}
 */
function tipoLegible_(mime) {
  const tipos = {};
  tipos[MimeType.GOOGLE_SHEETS] = "Hoja de cálculo de Google";
  tipos[MimeType.MICROSOFT_EXCEL] = "Excel (.xlsx)";
  tipos[MimeType.GOOGLE_APPS_SCRIPT] = "Proyecto de Apps Script";
  tipos[MimeType.FOLDER] = "Carpeta";
  return tipos[mime] || mime;
}

/**
 * Lo que hay en las carpetas de la app, sin la carpeta raíz de Mi unidad (si la hoja
 * estuviera ahí, no se lista nada de ella).
 * @returns {ListaLimpieza}
 */
function listaLimpieza_() {
  const hoja = DriveApp.getFileById(libroBd_().getId());
  const raiz = DriveApp.getRootFolder().getId();
  const yo = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  /** @type {Array<{id: string, nombre: string, url: string, conHoja: boolean}>} */
  const carpetas = [];
  const agregar = function (it, conHoja) {
    while (it.hasNext()) {
      const c = it.next();
      if (c.getId() === raiz || carpetas.some(function (x) { return x.id === c.getId(); })) continue;
      carpetas.push({ id: c.getId(), nombre: c.getName(), url: c.getUrl(), conHoja: conHoja });
    }
  };
  agregar(hoja.getParents(), true);
  /* Las carpetas que contienen la hoja, a cualquier altura: mandarlas a la papelera se la llevaría. */
  const ancestros = {};
  const subir = function (it, nivel) {
    while (it.hasNext() && nivel < 10) { const c = it.next(); if (ancestros[c.getId()]) continue; ancestros[c.getId()] = true; subir(c.getParents(), nivel + 1); }
  };
  subir(hoja.getParents(), 0);
  const anterior = PropertiesService.getScriptProperties().getProperty("SIS_BD_ANTERIOR_ID");
  if (anterior) { try { agregar(DriveApp.getFileById(anterior).getParents(), false); } catch (e) { /* ya no se puede abrir */ } }

  /** @type {ArchivoLimpieza[]} */
  const archivos = [];
  const propietario = function (x) { try { const u = x.getOwner(); return u ? String(u.getEmail() || "").toLowerCase() : ""; } catch (e) { return ""; } };
  const recorrer = function (carpeta, ruta, nivel) {
    const fs = carpeta.getFiles();
    while (fs.hasNext() && archivos.length < MAX_ARCHIVOS_LIMPIEZA_) {
      const f = fs.next();
      if (f.getId() === hoja.getId() || f.isTrashed() || archivos.some(function (x) { return x.id === f.getId(); })) continue;
      const mime = f.getMimeType(), dueno = propietario(f);
      archivos.push({
        id: f.getId(), nombre: f.getName(), tipo: tipoLegible_(mime), propietario: dueno, propio: dueno === yo,
        modificado: Dominio.isoPeru(f.getLastUpdated()), ruta: ruta, padre: carpeta.getId(), carpeta: false, completa: true, conHoja: false, url: f.getUrl(),
        aviso: mime === MimeType.GOOGLE_APPS_SCRIPT ? "Si es el proyecto de la app anterior, su enlace deja de funcionar." : ""
      });
    }
    const cs = carpeta.getFolders();
    while (cs.hasNext() && archivos.length < MAX_ARCHIVOS_LIMPIEZA_) {
      const c = cs.next();
      if (c.isTrashed() || archivos.some(function (x) { return x.id === c.getId(); })) continue;
      const dueno = propietario(c);
      archivos.push({
        id: c.getId(), nombre: c.getName(), tipo: tipoLegible_(MimeType.FOLDER), propietario: dueno, propio: dueno === yo,
        modificado: Dominio.isoPeru(c.getLastUpdated()), ruta: ruta, padre: carpeta.getId(), carpeta: true, completa: nivel < 3, conHoja: !!ancestros[c.getId()], url: c.getUrl(),
        aviso: ancestros[c.getId()] ? "Contiene la hoja del sistema: no se puede mandar a la papelera." : ""
      });
      if (nivel < 3) recorrer(c, ruta + " / " + c.getName(), nivel + 1);
    }
  };
  carpetas.forEach(function (c) { recorrer(DriveApp.getFolderById(c.id), c.nombre, 1); });
  /* Si la lista se cortó, ninguna carpeta se conoce entera. */
  if (archivos.length >= MAX_ARCHIVOS_LIMPIEZA_) archivos.forEach(function (a) { if (a.carpeta) a.completa = false; });
  return { hoja: { id: hoja.getId(), nombre: hoja.getName(), url: hoja.getUrl() }, carpetas: carpetas, archivos: archivos };
}
