// @ts-check
/* Migraciones de datos que aplica instalar(). Se pueden repetir: cada una solo cambia lo
   que todavía está en el formato anterior. */

/* Columnas con fecha y hora de cada pestaña. */
var COLUMNAS_FECHA_ = {
  Planes: ["actualizado_en"], Versiones: ["fecha"], Bloqueos: ["desde", "expira"],
  Fuentes: ["modificado", "procesado_en"], Cargas: ["actualizado_en"], VersionesCarga: ["fecha"],
  Recuperacion: ["fecha"]
};

/**
 * Pasa a hora de Perú (Dominio.isoPeru) las fechas guardadas en UTC («2026-10-15T16:01:11.000Z»).
 * No toca las fechas que van dentro del contenido de las versiones. Debe llamarse dentro de
 * conCandado_.
 * @returns {number} Cuántas celdas cambió.
 */
function convertirFechasAPeru_() {
  let n = 0;
  Object.keys(COLUMNAS_FECHA_).forEach(function (tabla) {
    const h = hojaBd_(tabla);
    const filas = h.getLastRow() - 1;
    if (filas < 1) return;
    COLUMNAS_FECHA_[tabla].forEach(function (campo) {
      const rango = h.getRange(2, TABLAS_[tabla].indexOf(campo) + 1, filas, 1);
      let cambia = false;
      const valores = rango.getValues().map(function (f) {
        const v = String(f[0] == null ? "" : f[0]);
        if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v)) return [v];
        cambia = true;
        n++;
        return [Dominio.isoPeru(v)];
      });
      if (cambia) rango.setValues(valores);
    });
  });
  return n;
}

/**
 * Las cargas por departamento de antes pasan a cargas por carrera. Cada asignación va a la
 * carga de la carrera de su sección (la del grupo principal) o, si ya no tiene sección, a
 * la de la carrera que tiene anotada (o a la primera del departamento). Cada carga que
 * recibe algo gana una versión «migración a carga por carrera». Después se quitan del
 * índice las cargas por departamento (sus versiones quedan en VersionesCarga como
 * historial) y se sueltan sus bloqueos y copias de recuperación. Debe llamarse dentro de
 * conCandado_.
 * @returns {number} Cuántas asignaciones pasó.
 */
function migrarCargasPorCarrera_() {
  const esDpto = function (k) { return Dominio.DPTOS.indexOf(k) >= 0; };
  const viejas = leerIndice_(REPO_CARGA_).filter(function (f) { return esDpto(f.carrera); });
  if (!viejas.length) return 0;
  let n = 0;
  const ciclos = viejas.map(function (f) { return f.ciclo; }).filter(function (c, i, l) { return l.indexOf(c) === i; });
  ciclos.forEach(function (c) {
    const planes = planesDelCiclo_(c);
    const idx = Dominio.indiceUnidades(Dominio.unidadesDelCiclo(planes));
    /** @type {Object<string, Asignacion[]>} */
    const porCarrera = {};
    viejas.filter(function (f) { return f.ciclo === c; }).forEach(function (f) {
      const v = vigente_(f);
      (v.version ? contenidoCarga_(c, f.carrera, v.version, v.filaVersion) : []).forEach(function (a) {
        const seccion = Dominio.unidadDe(idx, a);
        const destino = seccion ? seccion.carrera : (Dominio.siglaDeCarrera(a.carrera) || Dominio.carrerasDeDpto(f.carrera)[0]);
        (porCarrera[destino] = porCarrera[destino] || []).push(a);
        n++;
      });
    });
    /** @type {Object<string, number>} */
    const vistos = {};
    planes.forEach(function (p) { if (p.version) vistos[p.sig] = p.version; });
    const fecha = Dominio.isoPeru();
    Object.keys(porCarrera).forEach(function (s) {
      const fila = filaCarga_(c, s);
      const v = vigente_(fila);
      const actuales = v.version ? contenidoCarga_(c, s, v.version, v.filaVersion) : [];
      const ids = actuales.map(function (a) { return a.id; });
      registrarVersionCarga_(c, s, fila, {
        tipo: Dominio.TIPO_VERSION.MIGRACION_CARGA, usuario: "sistema: instalar()", fecha: fecha,
        motivo: "Asignaciones de las cargas por departamento", planes: vistos,
        asignaciones: actuales.concat(porCarrera[s].filter(function (a) { return ids.indexOf(a.id) < 0; }))
      });
    });
  });
  borrarFilasDonde_(TABLA_.CARGAS, function (f) { return esDpto(f.carrera); });
  borrarFilasDonde_(TABLA_.BLOQUEOS, function (f) { return /^carga:(DIMA|DAHUC|DACJ|DACTE)$/.test(f.ref); });
  borrarFilasDonde_(TABLA_.RECUPERACION, function (f) { return /^carga:(DIMA|DAHUC|DACJ|DACTE)$/.test(f.ref); }, 5);
  return n;
}
