import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar, ejecutarFallo, fijarUsuarios, USUARIOS_PRUEBA, DIRECTORES } from "./falsos.mjs";
import { XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES, plano, partesXlsx } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";      // coordinador de todas las carreras
const B = "fmaresg@ulasalle.edu.pe";       // otro coordinador
const DIMA = DIRECTORES.DIMA, DAHUC = DIRECTORES.DAHUC;
const CICLO = "2026-1";

function sistema({ conDocentes = true } = {}) {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  fijarUsuarios(e, USUARIOS_PRUEBA);
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA), { fecha: "2026-09-20T10:00:00Z" });
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO), { fecha: "2026-09-20T10:05:00Z" });
  if (conDocentes) e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", fs.readFileSync(XLSX_DOCENTES), { fecha: "2026-09-20T10:10:00Z" });
  ejecutar(e, A, "obtenerTablero", CICLO);   // lee los xlsx: 8 planes Registrados
  return e;
}

const unidad = (estado, carrera, codigo, n = 1) =>
  estado.unidades.find(u => u.miembros.some(m => m.carrera === carrera && m.codigo === codigo && String(m.n) === String(n)));

test("el catálogo sale de CargaDeDocentes con su departamento y dedicación", () => {
  const e = sistema();
  const cat = ejecutar(e, A, "leerCatalogoDocentes_", true);
  assert.equal(cat.docentes.length, 12);
  const d = cat.docentes.find(x => x.nombreCompleto.includes("ALATRISTA"));
  assert.deepEqual([d.dpto, d.dedicacion, d.tcOtra, d.cargo, d.noLectivas], ["DACTE", "TP", false, "", null]);
  assert.deepEqual(cat.columnas, { tcOtra: false, cargo: false, noLectivas: false });
});

test("las secciones salen de los planes Registrados y cada una lleva sus componentes", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  assert.equal(st.puedeEditar, true);
  assert.equal(st.unidades.length, 365);
  const dima = st.unidades.filter(u => u.dpto === "DIMA");
  assert.ok(dima.length > 0);
  const calc = unidad(st, "ING", "3.2.3.24");   // Cálculo I: 2 HT + 4 HP
  assert.deepEqual(calc.componentes.map(c => [c.c, c.horas]), [["T", 2], ["P", 4]]);

  /* Un plan en Borrador no pide docentes. */
  const p = ejecutar(e, A, "abrirEdicion", "2026-2", "ING");
  ejecutar(e, A, "guardarPlan", "2026-2", "ING", { asignaturas: [{ sem: 1, malla: "2024", codigo: "X.1", nombre: "Prueba", dpto: "DIMA", obs: "",
    grupos: [{ id: "g1", n: 1, ht: "2", hp: "0", desdoble: null, fusion: null }] }], estado: "Borrador", tipo: "guardar borrador", versionBase: p.version });
  assert.equal(ejecutar(e, DIMA, "obtenerCargaDocente", "2026-2", "DIMA").unidades.length, 0);
});

test("solo el director del departamento edita su carga; los demás la consultan", () => {
  const e = sistema();
  assert.equal(ejecutar(e, DAHUC, "obtenerCargaDocente", CICLO, "DIMA").puedeEditar, false);
  assert.equal(ejecutar(e, A, "obtenerCargaDocente", CICLO, "DIMA").puedeEditar, false);
  assert.throws(() => ejecutar(e, A, "abrirEdicionCarga", CICLO, "DIMA"), { codigo: "SIN_PERMISO", message: /coordinador de carrera consulta/ });
  assert.throws(() => ejecutar(e, DAHUC, "guardarCarga", CICLO, "DIMA", { asignaciones: [] }), { codigo: "SIN_PERMISO", message: /Solo asignas docentes en DAHUC/ });
  const r = ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  assert.equal(r.version, 0);
  assert.ok(r.expira);
});

test("la carga se versiona, se bloquea por departamento y avisa del conflicto", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  const asig = [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO", horas: null }];
  const r1 = ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: asig, versionBase: 0 });
  assert.equal(r1.version, 1);
  const r2 = ejecutarFallo(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: asig, versionBase: 0 });
  assert.deepEqual([r2.codigo, r2.detalle.n], ["CONFLICTO", 1], "se guardó otra versión después de la base");

  /* Otra cuenta no puede tomar el bloqueo mientras dure. */
  fijarUsuarios(e, USUARIOS_PRUEBA.concat([["otro.dima@ulasalle.edu.pe", "director", "", "DIMA"]]));
  assert.equal(ejecutarFallo(e, "otro.dima@ulasalle.edu.pe", "abrirEdicionCarga", CICLO, "DIMA").detalle.correo, DIMA);
  assert.throws(() => ejecutar(e, "otro.dima@ulasalle.edu.pe", "guardarCarga", CICLO, "DIMA", { asignaciones: [], versionBase: 1 }), { codigo: "BLOQUEADO", message: /la está editando/ });
  ejecutar(e, DIMA, "liberarBloqueoCarga", CICLO, "DIMA");
  assert.ok(ejecutar(e, "otro.dima@ulasalle.edu.pe", "abrirEdicionCarga", CICLO, "DIMA").expira);

  const h = ejecutar(e, DIMA, "obtenerHistorialCarga", CICLO, "DIMA");
  assert.deepEqual(h.map(v => [v.n, v.tipo, v.usuario]), [[1, "guardar", DIMA]]);
  assert.equal(ejecutar(e, B, "obtenerVersionCarga", CICLO, "DIMA", 1)[0].docente, "VELASQUEZ DOIG, MIGUEL EDUARDO");
});

test("nadie pasa de 40 h; un docente con cargo sobre 24 h exige motivo", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const secciones = st.unidades.filter(u => u.dpto === "DIMA" && u.ht + u.hp >= 4).slice(0, 11);
  const docente = "PRUEBA, DOCENTE";
  const asignar = lista => lista.flatMap(u => u.componentes.map(c => ({ unidad: u.id, componente: c.c, docente: docente, horas: null })));
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  assert.throws(() => ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: asignar(secciones), versionBase: 0 }), { codigo: "EXCESO_HORAS", message: /superaría las 40 h/ });

  /* Con cargo: 26 h pide motivo; con motivo se guarda. */
  const Dominio = e.ctx.Dominio;
  const cargo = [{ dni: "9", nombreCompleto: docente, dpto: "DIMA", dedicacion: "TC", condicion: "Ordinario", cargo: "Director de escuela" }];
  const pocas = [];
  let horas = 0;
  for (const u of secciones) { if (horas + u.ht + u.hp > 26) break; pocas.push(u); horas += u.ht + u.hp; }
  const bal = Dominio.calcularBalance(cargo, st.unidades, { DIMA: asignar(pocas) });
  const d = bal.docentes[0];
  assert.ok(d.advertencias.some(a => a.codigo === "A12"), JSON.stringify(d.advertencias));
  assert.ok(d.advertencias.some(a => a.codigo === "A09"), "ordinario sobre 24 h");
  const exc = Dominio.excesosAlGuardar({ docentes: [] }, bal);
  assert.equal(exc.severos.length, horas > 24 ? 1 : 0);
});

test("advertencias A10, A11 y A14 del balance", () => {
  const e = sistema();
  const Dominio = e.ctx.Dominio;
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const catalogo = [
    { dni: "1", nombreCompleto: "TP, POCAS", dpto: "DIMA", dedicacion: "TP", condicion: "Contratado" },
    { dni: "2", nombreCompleto: "CRUCE, DOS", dpto: "DAHUC", dedicacion: "TC", condicion: "Contratado", noLectivas: 10 }
  ];
  const ing4 = st.unidades.filter(u => u.carrera === "ING" && String(u.sem) === "4" && u.miembros.length === 1 && u.dpto === "DIMA");
  const g1 = st.unidades.filter(u => u.carrera === "DER" && u.codigo === "2.1.3.24");   // Historia del Derecho: grupos 1 y 2
  const cargas = {
    DIMA: [{ unidad: ing4[0].id, componente: "T", docente: "TP, POCAS", horas: 2 },
           { unidad: ing4[0].id, componente: "P", docente: "CRUCE, DOS", horas: null },
           { unidad: ing4[1].id, componente: "P", docente: "CRUCE, DOS", horas: null }],
    DACJ: g1.map(u => ({ unidad: u.id, componente: "T", docente: "TP, POCAS", horas: 2 }))
  };
  const bal = Dominio.calcularBalance(catalogo, st.unidades, cargas);
  const cod = n => bal.docentes.find(d => d.nombre === n).advertencias.map(a => a.codigo);
  assert.ok(cod("TP, POCAS").includes("A10"));
  assert.ok(!cod("TP, POCAS").includes("A11"), "dos grupos del mismo curso no son un cruce");
  assert.ok(cod("CRUCE, DOS").includes("A11"));
  assert.ok(cod("CRUCE, DOS").includes("A14"), "es de DAHUC y dicta cursos de DIMA");
  assert.ok(cod("CRUCE, DOS").includes("A15"), "TC con pocas horas lectivas y no lectivas");
});

test("lee la hoja real de CargaXDepartamento: grupo desde SEMESTRE y cursos fuera del plan", () => {
  const e = sistema();
  const Dominio = e.ctx.Dominio;
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DACJ");
  const libro = e.ctx.leerLibroXlsx_(partesXlsx(XLSX_DEPARTAMENTO));
  const hoja = libro.find(h => /DACJ/.test(h.nombre));
  const r = plano(Dominio.interpretarCargaDepartamento(hoja.filas, st.unidades, "DACJ", st.catalogo));
  const historia = r.filas.filter(f => f.codigo === "2.1.3.24");
  assert.deepEqual(historia.map(f => f.n), ["1", "2"], "«1-1» y «1-2» son los grupos 1 y 2");
  assert.ok(historia.every(f => f.estado === "ok" && f.unidad));
  assert.ok(r.filas.every(f => !/TOTAL/i.test(f.docenteTexto)));
  assert.equal(r.filas.length, 77);
  assert.ok(r.filas.every(f => f.estado === "ok"), "todas las filas de DACJ están en el plan y piden docente a DACJ");
  const dima = plano(Dominio.interpretarCargaDepartamento(libro.find(h => /DIMA/.test(h.nombre)).filas, st.unidades, "DIMA", st.catalogo));
  const cuenta = estado => dima.filas.filter(f => f.estado === estado).length;
  assert.deepEqual([cuenta("ok"), cuenta("otro-dpto"), cuenta("fuera")], [88, 1, 3], "se señalan las filas de otro departamento y las que no están en el plan");
});

test("la carga avisa con tipo si el plan cambió después de guardarla o una asignación quedó sin sección", () => {
  const e = sistema({ conDocentes: false });
  let st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  assert.deepEqual(st.avisos.map(a => a.tipo), ["CATALOGO_FALTA"], "sin CargaDeDocentes, el aviso va con los demás");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO", horas: null }], versionBase: 0 });

  /* El coordinador quita el curso del plan de ING. */
  ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  const plan = ejecutar(e, A, "obtenerPlan", CICLO, "ING");
  ejecutar(e, A, "guardarPlan", CICLO, "ING", { asignaturas: plan.asignaturas.filter(a => a.codigo !== "3.4.4.24"),
    estado: "Registrado", tipo: "guardar cambios", versionBase: plan.version });

  st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const cambio = st.avisos.find(a => a.tipo === "PLAN_CAMBIADO");
  assert.deepEqual(cambio.datos, { carrera: "ING", antes: 1, ahora: 2, usuario: A });
  assert.match(cambio.texto, /Ingeniería de Software cambió después del último guardado/);
  const sin = st.avisos.find(a => a.tipo === "SIN_SECCION");
  assert.deepEqual([sin.nivel, sin.datos.cuantas], ["aviso", 1]);
});

test("una asignación sigue a su sección si cambia el departamento del curso", () => {
  const e = sistema();
  let st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const u = unidad(st, "ADM", "1.1.4.24");   // Matemática Básica, DIMA
  assert.equal(u.dpto, "DIMA");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [{ unidad: u.id, componente: "T", docente: "ALFARO BEJARANO, JULIO CARLO", horas: null }], versionBase: 0 });

  /* El director de DAHUC no puede derivar un curso de DIMA; el de DIMA sí. */
  assert.throws(() => ejecutar(e, DAHUC, "cambiarDepartamento", CICLO, "ADM", u.id, "DAHUC", ""), { codigo: "SIN_PERMISO", message: /Solo puedes derivar/ });
  const r = ejecutar(e, DIMA, "cambiarDepartamento", CICLO, "ADM", u.id, "DAHUC", "préstamo");
  assert.equal(r.version, 2);
  assert.match(ejecutar(e, B, "obtenerHistorial", CICLO, "ADM")[1].motivo, /DIMA → DAHUC/);

  st = ejecutar(e, DAHUC, "obtenerCargaDocente", CICLO, "DAHUC");
  const v = e.ctx.Dominio.asignacionesVigentes(st.unidades, { DIMA: st.cargas.DIMA.asignaciones, DAHUC: st.cargas.DAHUC.asignaciones });
  const heredadas = v.porUnidad.get(unidad(st, "ADM", "1.1.4.24").id);
  assert.equal(heredadas[0].docente, "ALFARO BEJARANO, JULIO CARLO");
  assert.equal(heredadas[0].heredada, true);

  /* Cuando DAHUC guarda su carga con esa asignación, DIMA deja de tenerla al guardar. */
  ejecutar(e, DAHUC, "abrirEdicionCarga", CICLO, "DAHUC");
  ejecutar(e, DAHUC, "guardarCarga", CICLO, "DAHUC", { asignaciones: [Object.assign({}, heredadas[0], { heredada: undefined, dptoCarga: undefined })], versionBase: 0 });
  const g = ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: st.cargas.DIMA.asignaciones, versionBase: 1 });
  assert.equal(g.asignaciones.length, 0);
});

test("la fusión con un grupo de otra carrera se lleva a su plan y cuenta las horas una vez", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  const otro = ejecutar(e, B, "obtenerPlan", CICLO, "PSI");
  const Dominio = e.ctx.Dominio;
  const ci = p.asignaturas.findIndex(a => a.codigo === "3.4.6.24");   // Liderazgo y Trabajo en Equipo
  const ext = otro.asignaturas.find(a => a.codigo === "9.4.2.24");
  const g = ext.grupos[0];
  const lista = plano(p.asignaturas);
  const res = Dominio.fusionar(lista, [ci + ":0"], ci + ":0", [{ carrera: "PSI", grupoId: g.id, codigo: ext.codigo, nombre: ext.nombre, n: g.n, ht: g.ht, hp: g.hp }]);
  assert.equal(res.conOtras, true);
  const r = ejecutar(e, A, "guardarPlan", CICLO, "ING", { asignaturas: lista, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.deepEqual(r.otros.map(o => [o.sig, o.version]), [["PSI", 2]]);
  const psi = ejecutar(e, B, "obtenerPlan", CICLO, "PSI").asignaturas.find(a => a.codigo === "9.4.2.24").grupos[0];
  assert.equal(psi.fusion, res.marca);
  assert.equal(psi.fusionCon[0].carrera, "ING");
  assert.equal(psi.fusionCon[0].principal, true);
  assert.equal(ejecutar(e, B, "obtenerHistorial", CICLO, "PSI")[1].tipo, "fusión");

  /* Una sola sección para asignar, con sus dos grupos. */
  const st = ejecutar(e, DAHUC, "obtenerCargaDocente", CICLO, "DAHUC");
  const u = st.unidades.filter(x => x.fusion === res.marca);
  assert.equal(u.length, 1);
  assert.deepEqual(u[0].miembros.map(m => m.carrera).sort(), ["ING", "PSI"]);
  const t = ejecutar(e, B, "obtenerTablero", CICLO);
  const psiT = t.filas.find(f => f.sig === "PSI").totales, ingT = t.filas.find(f => f.sig === "ING").totales;
  assert.equal(psiT.dictado + 4, e.ctx.Dominio.totales(otro.asignaturas).dictado, "PSI deja de contar las horas: las dicta ING");
  assert.equal(ingT.fus, 1);

  /* Deshacerla desde ING la deshace también en PSI. */
  const p2 = ejecutar(e, A, "obtenerPlan", CICLO, "ING").asignaturas;
  Dominio.deshacerFusion(p2, res.marca);
  const r2 = ejecutar(e, A, "guardarPlan", CICLO, "ING", { asignaturas: p2, estado: "Registrado", tipo: "guardar cambios", versionBase: 2, fusionesDisueltas: [res.marca] });
  assert.equal(r2.otros[0].sig, "PSI");
  const psi2 = ejecutar(e, B, "obtenerPlan", CICLO, "PSI").asignaturas.find(a => a.codigo === "9.4.2.24").grupos[0];
  assert.equal(psi2.fusion, null);
  assert.equal(psi2.fusionCon, undefined);
});

test("la fusión no toca el plan de otra carrera mientras otra cuenta lo edita", () => {
  const e = sistema();
  const p = ejecutar(e, A, "abrirEdicion", CICLO, "ING");
  ejecutar(e, B, "abrirEdicion", CICLO, "PSI");
  const otro = ejecutar(e, B, "obtenerPlan", CICLO, "PSI");
  const ext = otro.asignaturas.find(a => a.codigo === "9.4.2.24"), g = ext.grupos[0];
  const lista = plano(p.asignaturas);
  const ci = lista.findIndex(a => a.codigo === "3.4.6.24");
  e.ctx.Dominio.fusionar(lista, [ci + ":0"], ci + ":0", [{ carrera: "PSI", grupoId: g.id, codigo: ext.codigo, nombre: ext.nombre, n: g.n, ht: g.ht, hp: g.hp }]);
  assert.throws(() => ejecutar(e, A, "guardarPlan", CICLO, "ING", { asignaturas: lista, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 }), { codigo: "BLOQUEADO", message: /está editando fmaresg/ });
  assert.equal(ejecutar(e, B, "obtenerPlan", CICLO, "ING").version, 1, "no se guardó nada");
});

test("el tablero dice qué grupos tienen docente y la recuperación se guarda y se borra", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIMA, "guardarRecuperacion", CICLO, "carga:DIMA", { contenido: [{ unidad: u.id, componente: "T", docente: "X" }], versionBase: 0 });
  assert.equal(ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA").recuperacion.contenido[0].docente, "X");
  assert.throws(() => ejecutar(e, A, "guardarRecuperacion", CICLO, "carga:DIMA", { contenido: [] }), { codigo: "SIN_PERMISO", message: /consulta la asignación/ });
  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO" }], versionBase: 0 });
  assert.equal(ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA").recuperacion, null, "al guardar se borra");
  const t = ejecutar(e, A, "obtenerTablero", CICLO);
  assert.ok(t.filas.every(f => !("docentes" in f)), "el tablero no trae los docentes: se piden aparte");
  assert.deepEqual(ejecutar(e, A, "obtenerDocentesPorGrupo", CICLO).ING[u.id], ["VELASQUEZ DOIG, MIGUEL EDUARDO (DIMA)"]);
});

test("los docentes por grupo se guardan en caché con la versión de cada plan y cada carga", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "obtenerCargaDocente", CICLO, "DIMA");
  const u = unidad(st, "ING", "3.4.4.24");
  assert.deepEqual(ejecutar(e, A, "obtenerDocentesPorGrupo", CICLO), {});
  ejecutar(e, DIMA, "abrirEdicionCarga", CICLO, "DIMA");
  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO" }], versionBase: 0 });
  assert.equal(ejecutar(e, A, "obtenerDocentesPorGrupo", CICLO).ING[u.id].length, 1, "guardar la carga cambia la clave");

  e.reiniciarCuentas();
  ejecutar(e, A, "obtenerDocentesPorGrupo", CICLO);
  assert.deepEqual(Object.keys(e.cuentas.lecturas).sort(), ["Cargas", "Planes"], "con la caché caliente solo lee los índices");

  ejecutar(e, DIMA, "guardarCarga", CICLO, "DIMA", { asignaciones: [], versionBase: 1 });
  assert.equal(ejecutar(e, A, "obtenerDocentesPorGrupo", CICLO).ING, undefined);
  assert.deepEqual(ejecutar(e, A, "obtenerDocentesPorGrupo", "2026-2"), {}, "un ciclo sin planes");
});
