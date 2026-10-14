/* Siembra de un ciclo con los tres Excel de ejemplo (P110, P117). Se leen de la carpeta
   SIS_CARPETA_XLSX sin convertirlos ni modificarlos, y llenan las hojas del ciclo: las 8 de
   carrera, General y las 4 por departamento. Cada carrera con oferta queda Registrada v1
   («importación desde xlsx»), como decidió el equipo el 2026-09-29. Los docentes de la
   columna DOCENTE se aplican como lo haría un Director con todos los departamentos, con
   las mismas reglas: lo que A07, A08 o A11 impiden queda pendiente, con nota (P122).
   Solo la cuenta propietaria, desde el editor del proyecto. */
function sembrarCiclo(ciclo, forzar) {
  exigirPropietario_();
  const cfg = config_();
  const c = validarCiclo_(ciclo || cfg.cicloActual);
  const avisos = [];
  const carpeta = abrirCarpeta_(cfg.carpetaXlsx);
  if (!carpeta) throw new Error("No se encuentra la carpeta de los .xlsx (SIS_CARPETA_XLSX). Ejecuta instalar() desde el editor.");
  const f = localizarXlsx_(carpeta, avisos);
  if (!f.carrera) throw new Error("La carpeta «" + carpeta.getName() + "» no tiene el archivo CargaXCarrera (.xlsx).");
  const leer = function (a) { return a ? leerLibroXlsx(descomprimirXlsx_(a.getBlob())) : null; };
  const r = cicloDesdeLibros(leer(f.carrera), leer(f.departamento), leer(f.docentes),
                             { rol: "director", departamento: "TODOS" }, cfg.reglas);
  const quien = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();

  return conCandado_(function () {
    const conVersion = leerPlanes_().filter(function (p) { return p.ciclo === c && (parseInt(p.version, 10) || 0) > 0; });
    if (conVersion.length && !forzar)
      throw new Error("El ciclo " + c + " ya tiene planes guardados (" + conVersion.map(function (p) { return p.carrera; }).join(", ") +
                      "). Para sembrarlo de nuevo y reemplazar sus hojas, ejecuta sembrarCiclo(\"" + c + "\", true).");
    asegurarHojasCiclo_(c);
    const fecha = new Date().toISOString();
    const resumen = {};
    Dominio.CARRERAS.forEach(function (car) {
      const asignaturas = r.planes[car.sig] || [];
      escribirHojaCarrera_(c, car.sig, asignaturas, r.planes);
      resumen[car.sig] = asignaturas.length;
      if (!asignaturas.length) return;
      registrarVersion_(c, car.sig, {
        estado: Dominio.ESTADOS.REGISTRADO, tipo: "importación desde xlsx", usuario: "xlsx: " + f.carrera.getName(),
        fecha: fecha, motivo: "", asignaturas: asignaturas
      });
    });
    actualizarReportes_(c, r.planes, r.catalogo);
    const avisosProteccion = protegerHojasCiclo_(c);
    const detalle = {
      asignaturas: resumen, fusiones: r.fusiones.length, altas: r.docentes.altas.length,
      pendientes: r.docentes.pendientes.length, archivos: [f.carrera, f.departamento, f.docentes].filter(Boolean).map(function (a) { return a.getName(); })
    };
    anotarBitacora_(quien, c, "", "siembra desde xlsx", "", JSON.stringify(detalle));
    return {
      ciclo: c, asignaturas: resumen, fusiones: r.fusiones.length, docentes: r.catalogo.length, altas: r.docentes.altas.length,
      pendientes: r.docentes.pendientes, avisos: avisos.concat(r.avisos, avisosProteccion)
    };
  });
}

/* ============================================================
   Localización de los .xlsx en la carpeta
   ============================================================ */

function tipoDeFuente_(nombre) {
  const n = Dominio.normalizar(nombre).replace(/[^A-Z]/g, "");
  if (n.indexOf("CARGAXCARRERA") >= 0) return "carrera";
  if (n.indexOf("CARGAXDEPARTAMENTO") >= 0) return "departamento";
  if (n.indexOf("CARGADEDOCENTES") >= 0 || n.indexOf("DOCENTES") >= 0) return "docentes";
  return null;
}

/* El .xlsx más reciente de cada tipo. Uno convertido a Hoja de cálculo de Google no se lee:
   el sistema usa el .xlsx original. */
function localizarXlsx_(carpeta, avisos) {
  const candidatos = { carrera: [], departamento: [], docentes: [] };
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const a = it.next();
    if (a.isTrashed()) continue;
    const tipo = tipoDeFuente_(a.getName());
    if (!tipo) continue;
    if (a.getMimeType() === MimeType.GOOGLE_SHEETS) {
      avisos.push("«" + a.getName() + "» está convertido a Hoja de cálculo de Google y no se lee: " +
                  "el sistema usa el .xlsx original. Súbelo sin convertir.");
      continue;
    }
    if (a.getMimeType() !== MimeType.MICROSOFT_EXCEL && !/\.xlsx$/i.test(a.getName())) continue;
    candidatos[tipo].push(a);
  }
  const elegir = function (lista, etiqueta) {
    if (!lista.length) return null;
    lista.sort(function (x, y) { return y.getLastUpdated().getTime() - x.getLastUpdated().getTime(); });
    if (lista.length > 1)
      avisos.push("Hay " + lista.length + " archivos " + etiqueta + " en la carpeta; se usa el más reciente, «" + lista[0].getName() + "».");
    return lista[0];
  };
  return {
    carrera: elegir(candidatos.carrera, "CargaXCarrera"),
    departamento: elegir(candidatos.departamento, "CargaXDepartamento"),
    docentes: elegir(candidatos.docentes, "CargaDeDocentes")
  };
}
