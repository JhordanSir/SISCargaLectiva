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
  ejecutar(e, A, "tableroObtener", CICLO);   // lee los xlsx: 8 planes Registrados
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

test("el catálogo se precalcula al revisar los xlsx y se renueva antes de caducar", () => {
  const e = sistema();
  ejecutar(e, A, "tableroObtener", CICLO, { releer: true });
  e.reiniciarCuentas();
  assert.equal(ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING").catalogo.length, 12);
  assert.equal(e.cuentas.drive, 0, "la asignación no espera a leer CargaDeDocentes");

  const clave = ejecutar(e, A, "claveCache_", "catalogo", e.propiedades.SIS_CARPETA_ID);
  const antes = ejecutar(e, A, "leerDeCache_", clave).leidoEn;
  e.desfase = 55 * 60000;   // quedan 5 minutos de caché y ya pasó el intervalo de revisión
  ejecutar(e, A, "tableroObtener", CICLO);
  assert.notEqual(ejecutar(e, A, "leerDeCache_", clave).leidoEn, antes, "la revisión de los xlsx lo vuelve a leer");
});

test("las secciones salen de los planes Registrados y las asigna el departamento de su carrera", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  assert.deepEqual([st.carrera, st.departamento, st.puedeEditar], ["ING", "DIMA", true]);
  assert.equal(st.unidades.length, 365);
  const Dominio = e.ctx.Dominio;
  assert.ok(st.unidades.every(u => u.dpto === Dominio.dptoDeCarrera(u.carrera) && !u.derivada), "sin derivaciones, decide la carrera");
  const mate = unidad(st, "ADM", "1.1.4.24");   // Matemática Básica de ADM: la columna DPTO dice DIMA
  assert.deepEqual([mate.dpto, mate.dptoAsignatura], ["DACTE", "DIMA"], "la columna DPTO queda solo como dato");
  const calc = unidad(st, "ING", "3.2.3.24");   // Cálculo I: 2 HT + 4 HP
  assert.deepEqual(calc.componentes.map(c => [c.c, c.horas]), [["T", 2], ["P", 4]]);
  assert.equal(ejecutar(e, DAHUC, "asignacionObtener", CICLO).carrera, "PSI", "sin carrera, la primera del departamento del director");

  /* Un plan en Borrador no pide docentes. */
  const p = ejecutar(e, A, "edicionPlanAbrir", "2026-2", "ING");
  ejecutar(e, A, "edicionPlanGuardar", "2026-2", "ING", { asignaturas: [{ sem: 1, malla: "2024", codigo: "X.1", nombre: "Prueba", dpto: "DIMA", obs: "",
    grupos: [{ id: "g1", n: 1, ht: "2", hp: "0", desdoble: null, fusion: null }] }], estado: "Borrador", tipo: "guardar borrador", versionBase: p.version });
  assert.equal(ejecutar(e, DIMA, "asignacionObtener", "2026-2", "ING").unidades.length, 0);
});

test("la carga de una carrera la edita el director de su departamento; los demás la consultan", () => {
  const e = sistema();
  assert.equal(ejecutar(e, DAHUC, "asignacionObtener", CICLO, "ING").puedeEditar, false);
  assert.equal(ejecutar(e, A, "asignacionObtener", CICLO, "ING").puedeEditar, false);
  assert.throws(() => ejecutar(e, A, "asignacionEdicionAbrir", CICLO, "ING"), { codigo: "SIN_PERMISO", message: /coordinador de carrera consulta/ });
  assert.throws(() => ejecutar(e, DAHUC, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [] }), { codigo: "SIN_PERMISO", message: /carreras de DAHUC \(PSI, COM\)/ });
  assert.throws(() => ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ADM"), { codigo: "SIN_PERMISO" }, "ADM es de DACTE");
  for (const s of ["ING", "IND", "ICO", "ARQ"]) {
    const r = ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, s);
    assert.ok(r.expira && r.version === 0, s + ": cada carrera tiene su propia carga y su propio bloqueo");
  }
});

test("la carga de cada carrera se versiona, se bloquea por separado y avisa del conflicto", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING");
  const asig = [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO", horas: null }];
  const r1 = ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: asig, versionBase: 0 });
  assert.equal(r1.version, 1);
  assert.match(r1.fecha, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$/, "la fecha va en hora de Perú");
  const r2 = ejecutarFallo(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: asig, versionBase: 0 });
  assert.deepEqual([r2.codigo, r2.detalle.n], ["CONFLICTO", 1], "se guardó otra versión después de la base");

  /* Otra cuenta de DIMA no puede tomar el bloqueo de ING mientras dure, pero sí el de IND. */
  const OTRO = "otro.dima@ulasalle.edu.pe";
  fijarUsuarios(e, USUARIOS_PRUEBA.concat([[OTRO, "director", "", "DIMA"]]));
  assert.equal(ejecutarFallo(e, OTRO, "asignacionEdicionAbrir", CICLO, "ING").detalle.correo, DIMA);
  assert.ok(ejecutar(e, OTRO, "asignacionEdicionAbrir", CICLO, "IND").expira);
  assert.throws(() => ejecutar(e, OTRO, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [], versionBase: 1 }), { codigo: "BLOQUEADO", message: /la está editando/ });
  ejecutar(e, DIMA, "sesionEdicionLiberar", CICLO, "carga:ING");
  assert.ok(ejecutar(e, OTRO, "asignacionEdicionAbrir", CICLO, "ING").expira);

  const h = ejecutar(e, DIMA, "asignacionHistorial", CICLO, "ING");
  assert.deepEqual(h.map(v => [v.n, v.tipo, v.usuario]), [[1, "guardar", DIMA]]);
  assert.equal(ejecutar(e, B, "asignacionVerVersion", CICLO, "ING", 1)[0].docente, "VELASQUEZ DOIG, MIGUEL EDUARDO");
  assert.deepEqual(e.hoja("Cargas").filas().map(f => [f[0], f[1]]), [[CICLO, "ING"]], "el índice de cargas va por carrera");
});

test("nadie pasa de 40 h; un docente con cargo sobre 24 h exige motivo", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const secciones = st.unidades.filter(u => u.carrera === "ING" && u.ht + u.hp >= 4).slice(0, 11);
  const docente = "PRUEBA, DOCENTE";
  const asignar = lista => lista.flatMap(u => u.componentes.map(c => ({ unidad: u.id, componente: c.c, docente: docente, horas: null })));
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING");
  assert.throws(() => ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: asignar(secciones), versionBase: 0 }), { codigo: "EXCESO_HORAS", message: /superaría las 40 h/ });

  /* Con cargo: 26 h pide motivo; con motivo se guarda. */
  const Dominio = e.ctx.Dominio;
  const cargo = [{ dni: "9", nombreCompleto: docente, dpto: "DIMA", dedicacion: "TC", condicion: "Ordinario", cargo: "Director de escuela" }];
  const pocas = [];
  let horas = 0;
  for (const u of secciones) { if (horas + u.ht + u.hp > 26) break; pocas.push(u); horas += u.ht + u.hp; }
  const bal = Dominio.calcularBalance(cargo, st.unidades, { ING: asignar(pocas) });
  const d = bal.docentes[0];
  assert.ok(d.advertencias.some(a => a.codigo === "A12"), JSON.stringify(d.advertencias));
  assert.ok(d.advertencias.some(a => a.codigo === "A09"), "ordinario sobre 24 h");
  const exc = Dominio.excesosAlGuardar({ docentes: [] }, bal);
  assert.equal(exc.severos.length, horas > 24 ? 1 : 0);
});

test("advertencias A10, A11 y A14 del balance, que suma todas las carreras", () => {
  const e = sistema();
  const Dominio = e.ctx.Dominio;
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const catalogo = [
    { dni: "1", nombreCompleto: "TP, POCAS", dpto: "DIMA", dedicacion: "TP", condicion: "Contratado" },
    { dni: "2", nombreCompleto: "CRUCE, DOS", dpto: "DAHUC", dedicacion: "TC", condicion: "Contratado", noLectivas: 10 }
  ];
  const ing4 = st.unidades.filter(u => u.carrera === "ING" && String(u.sem) === "4" && u.miembros.length === 1);
  const g1 = st.unidades.filter(u => u.carrera === "DER" && u.codigo === "2.1.3.24");   // Historia del Derecho: grupos 1 y 2
  const cargas = {
    ING: [{ unidad: ing4[0].id, componente: "T", docente: "TP, POCAS", horas: 2 },
          { unidad: ing4[0].id, componente: "P", docente: "CRUCE, DOS", horas: null },
          { unidad: ing4[1].id, componente: "P", docente: "CRUCE, DOS", horas: null }],
    DER: g1.map(u => ({ unidad: u.id, componente: "T", docente: "TP, POCAS", horas: 2 }))
  };
  const bal = Dominio.calcularBalance(catalogo, st.unidades, cargas);
  const cod = n => bal.docentes.find(d => d.nombre === n).advertencias.map(a => a.codigo);
  assert.ok(cod("TP, POCAS").includes("A10"));
  assert.ok(!cod("TP, POCAS").includes("A11"), "dos grupos del mismo curso no son un cruce");
  assert.ok(cod("CRUCE, DOS").includes("A11"));
  assert.ok(cod("CRUCE, DOS").includes("A14"), "es de DAHUC y dicta cursos que asigna DIMA");
  assert.ok(cod("CRUCE, DOS").includes("A15"), "TC con pocas horas lectivas y no lectivas");
  assert.equal(bal.docentes.find(d => d.nombre === "TP, POCAS").horas, 6, "suma ING y DER");
});

test("lee la hoja real de CargaXDepartamento y separa las filas de otras carreras", () => {
  const e = sistema();
  const Dominio = e.ctx.Dominio;
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "DER");
  const libro = e.ctx.leerLibroXlsx_(partesXlsx(XLSX_DEPARTAMENTO));
  const hoja = libro.find(h => /DACJ/.test(h.nombre));
  const r = plano(Dominio.interpretarCargaDepartamento(hoja.filas, st.unidades, { carrera: "DER", dpto: "DACJ" }, st.catalogo));
  const historia = r.filas.filter(f => f.codigo === "2.1.3.24");
  assert.deepEqual(historia.map(f => f.n), ["1", "2"], "«1-1» y «1-2» son los grupos 1 y 2");
  assert.ok(historia.every(f => f.estado === "ok" && f.unidad));
  assert.ok(r.filas.every(f => !/TOTAL/i.test(f.docenteTexto)));
  const cuenta = (filas, estado) => filas.filter(f => f.estado === estado).length;
  assert.deepEqual([r.filas.length, cuenta(r.filas, "ok"), cuenta(r.filas, "otra-carrera")], [77, 67, 10], "los cursos que DACJ dicta en otras carreras no van en la carga de DER");
  const dima = plano(Dominio.interpretarCargaDepartamento(libro.find(h => /DIMA/.test(h.nombre)).filas, st.unidades, { carrera: "ING", dpto: "DIMA" }, st.catalogo));
  assert.deepEqual([cuenta(dima.filas, "ok"), cuenta(dima.filas, "otra-carrera"), cuenta(dima.filas, "fuera")], [54, 35, 3]);
});

test("la carga avisa con tipo si el plan cambió después de guardarla o una asignación quedó sin sección", () => {
  const e = sistema({ conDocentes: false });
  let st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  assert.deepEqual(st.avisos.map(a => a.tipo), ["CATALOGO_FALTA"], "sin CargaDeDocentes, el aviso va con los demás");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING");
  ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO", horas: null }], versionBase: 0 });

  /* Cambia el plan de ADM (no tiene que ver con ING) y el coordinador quita el curso del plan de ING. */
  ejecutar(e, A, "edicionPlanAbrir", CICLO, "ADM");
  const adm = ejecutar(e, A, "consultaObtener", CICLO, "ADM");
  ejecutar(e, A, "edicionPlanGuardar", CICLO, "ADM", { asignaturas: adm.asignaturas.slice(1), estado: "Registrado", tipo: "guardar cambios", versionBase: adm.version });
  ejecutar(e, A, "edicionPlanAbrir", CICLO, "ING");
  const plan = ejecutar(e, A, "consultaObtener", CICLO, "ING");
  ejecutar(e, A, "edicionPlanGuardar", CICLO, "ING", { asignaturas: plan.asignaturas.filter(a => a.codigo !== "3.4.4.24"),
    estado: "Registrado", tipo: "guardar cambios", versionBase: plan.version });

  st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const cambios = st.avisos.filter(a => a.tipo === "PLAN_CAMBIADO");
  assert.deepEqual(cambios.map(a => a.datos), [{ carrera: "ING", antes: 1, ahora: 2, usuario: A }], "solo avisa del plan de la carrera");
  assert.match(cambios[0].texto, /Ingeniería de Software cambió después del último guardado/);
  const sin = st.avisos.find(a => a.tipo === "SIN_SECCION");
  assert.deepEqual([sin.nivel, sin.datos.cuantas], ["aviso", 1]);
});

test("derivar un curso es una excepción: lo asigna otro departamento, en la carga de su carrera", () => {
  const e = sistema();
  const DACTE = DIRECTORES.DACTE;
  let st = ejecutar(e, DACTE, "asignacionObtener", CICLO, "ADM");
  const mate = unidad(st, "ADM", "1.1.4.24");                       // Matemática Básica: la asigna DACTE
  const otra = st.unidades.find(u => u.carrera === "ADM" && u.id !== mate.id);
  assert.throws(() => ejecutar(e, DIMA, "derivacionGuardar", CICLO, "ADM", mate.id, "DIMA", ""), { codigo: "SIN_PERMISO", message: /Solo puedes derivar/ });
  const r = ejecutar(e, DACTE, "derivacionGuardar", CICLO, "ADM", mate.id, "DIMA", "lo dicta Matemáticas");
  assert.equal(r.version, 2);
  assert.match(ejecutar(e, B, "edicionPlanHistorial", CICLO, "ADM")[1].motivo, /DACTE → DIMA\. lo dicta Matemáticas/);
  const a = ejecutar(e, B, "consultaObtener", CICLO, "ADM").asignaturas.find(x => x.codigo === "1.1.4.24");
  assert.deepEqual([a.derivado, a.dpto], ["DIMA", "DIMA"], "se anota la derivación; la columna DPTO no cambia");

  st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ADM");
  assert.equal(st.puedeEditar, true, "DIMA entra en la carga de ADM por el curso derivado");
  assert.deepEqual([unidad(st, "ADM", "1.1.4.24").dpto, unidad(st, "ADM", "1.1.4.24").derivada], ["DIMA", true]);

  /* Cada director solo cambia lo que le toca; el servidor conserva lo demás. */
  ejecutar(e, DACTE, "asignacionEdicionAbrir", CICLO, "ADM");
  ejecutar(e, DACTE, "asignacionEdicionGuardar", CICLO, "ADM", { versionBase: 0, asignaciones: [
    { unidad: otra.id, componente: "T", docente: "DOCENTE, DE DACTE" },
    { unidad: mate.id, componente: "T", docente: "INTRUSO, DACTE" }] });
  ejecutar(e, DACTE, "sesionEdicionLiberar", CICLO, "carga:ADM");
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ADM");
  const g = ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ADM", { versionBase: 1, asignaciones: [
    { unidad: mate.id, componente: "T", docente: "DOCENTE, DE DIMA" },
    { unidad: otra.id, componente: "T", docente: "INTRUSO, DIMA" }] });
  assert.deepEqual(g.asignaciones.map(x => x.docente).sort(), ["DOCENTE, DE DACTE", "DOCENTE, DE DIMA"]);
  ejecutar(e, DIMA, "sesionEdicionLiberar", CICLO, "carga:ADM");

  /* Derivarlo de vuelta al departamento de la carrera quita la derivación; el docente lo sigue. */
  assert.equal(ejecutar(e, DIMA, "derivacionGuardar", CICLO, "ADM", mate.id, "DIMA", "").sinCambios, true);
  ejecutar(e, DIMA, "derivacionGuardar", CICLO, "ADM", mate.id, "DACTE", "");
  assert.equal(ejecutar(e, B, "consultaObtener", CICLO, "ADM").asignaturas.find(x => x.codigo === "1.1.4.24").derivado, undefined);
  assert.match(ejecutar(e, B, "edicionPlanHistorial", CICLO, "ADM")[2].motivo, /vuelve al departamento de la carrera/);
  st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ADM");
  assert.equal(st.puedeEditar, false);
  const vig = e.ctx.Dominio.asignacionesVigentes(st.unidades, { ADM: st.cargas.ADM.asignaciones });
  assert.equal(vig.porUnidad.get(mate.id)[0].docente, "DOCENTE, DE DIMA");
});

test("la derivación se conserva cuando el Excel de la carrera cambia", () => {
  const e = sistema();
  const mate = unidad(ejecutar(e, A, "asignacionObtener", CICLO, "ADM"), "ADM", "1.1.4.24");
  ejecutar(e, DIRECTORES.DACTE, "derivacionGuardar", CICLO, "ADM", mate.id, "DIMA", "");
  const antes = ejecutar(e, A, "consultaObtener", CICLO, "ADM").asignaturas;
  const nuevas = plano(antes).map(a => Object.assign(a, { derivado: undefined }));
  e.ctx.Dominio.conservarIds(nuevas, antes);
  assert.equal(nuevas.find(a => a.codigo === "1.1.4.24").derivado, "DIMA");
});

test("la fusión con un grupo de otra carrera se lleva a su plan, va en la carga del grupo principal y cuenta las horas una vez", () => {
  const e = sistema();
  const p = ejecutar(e, A, "edicionPlanAbrir", CICLO, "ING");
  const otro = ejecutar(e, B, "consultaObtener", CICLO, "PSI");
  const Dominio = e.ctx.Dominio;
  const ci = p.asignaturas.findIndex(a => a.codigo === "3.4.6.24");   // Liderazgo y Trabajo en Equipo
  const ext = otro.asignaturas.find(a => a.codigo === "9.4.2.24");
  const g = ext.grupos[0];
  const lista = plano(p.asignaturas);
  const res = Dominio.fusionar(lista, [ci + ":0"], ci + ":0", [{ carrera: "PSI", grupoId: g.id, codigo: ext.codigo, nombre: ext.nombre, n: g.n, ht: g.ht, hp: g.hp }]);
  assert.equal(res.conOtras, true);
  const r = ejecutar(e, A, "edicionPlanGuardar", CICLO, "ING", { asignaturas: lista, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 });
  assert.deepEqual(r.otros.map(o => [o.sig, o.version]), [["PSI", 2]]);
  const psi = ejecutar(e, B, "consultaObtener", CICLO, "PSI").asignaturas.find(a => a.codigo === "9.4.2.24").grupos[0];
  assert.equal(psi.fusion, res.marca);
  assert.equal(psi.fusionCon[0].carrera, "ING");
  assert.equal(psi.fusionCon[0].principal, true);
  assert.equal(ejecutar(e, B, "edicionPlanHistorial", CICLO, "PSI")[1].tipo, "fusión");

  /* Una sola sección para asignar, con sus dos grupos, en la carga de ING (el grupo principal). */
  const st = ejecutar(e, DAHUC, "asignacionObtener", CICLO, "PSI");
  const u = st.unidades.filter(x => x.fusion === res.marca);
  assert.equal(u.length, 1);
  assert.deepEqual(u[0].miembros.map(m => m.carrera).sort(), ["ING", "PSI"]);
  assert.deepEqual([u[0].carrera, u[0].dpto], ["ING", "DIMA"]);
  const t = ejecutar(e, B, "tableroObtener", CICLO);
  const psiT = t.filas.find(f => f.sig === "PSI").totales, ingT = t.filas.find(f => f.sig === "ING").totales;
  assert.equal(psiT.dictado + 4, e.ctx.Dominio.totales(otro.asignaturas).dictado, "PSI deja de contar las horas: las dicta ING");
  assert.equal(ingT.fus, 1);

  /* Deshacerla desde ING la deshace también en PSI. */
  const p2 = ejecutar(e, A, "consultaObtener", CICLO, "ING").asignaturas;
  Dominio.deshacerFusion(p2, res.marca);
  const r2 = ejecutar(e, A, "edicionPlanGuardar", CICLO, "ING", { asignaturas: p2, estado: "Registrado", tipo: "guardar cambios", versionBase: 2, fusionesDisueltas: [res.marca] });
  assert.equal(r2.otros[0].sig, "PSI");
  const psi2 = ejecutar(e, B, "consultaObtener", CICLO, "PSI").asignaturas.find(a => a.codigo === "9.4.2.24").grupos[0];
  assert.equal(psi2.fusion, null);
  assert.equal(psi2.fusionCon, undefined);
});

test("la fusión no toca el plan de otra carrera mientras otra cuenta lo edita", () => {
  const e = sistema();
  const p = ejecutar(e, A, "edicionPlanAbrir", CICLO, "ING");
  ejecutar(e, B, "edicionPlanAbrir", CICLO, "PSI");
  const otro = ejecutar(e, B, "consultaObtener", CICLO, "PSI");
  const ext = otro.asignaturas.find(a => a.codigo === "9.4.2.24"), g = ext.grupos[0];
  const lista = plano(p.asignaturas);
  const ci = lista.findIndex(a => a.codigo === "3.4.6.24");
  e.ctx.Dominio.fusionar(lista, [ci + ":0"], ci + ":0", [{ carrera: "PSI", grupoId: g.id, codigo: ext.codigo, nombre: ext.nombre, n: g.n, ht: g.ht, hp: g.hp }]);
  assert.throws(() => ejecutar(e, A, "edicionPlanGuardar", CICLO, "ING", { asignaturas: lista, estado: "Registrado", tipo: "guardar cambios", versionBase: 1 }), { codigo: "BLOQUEADO", message: /está editando fmaresg/ });
  assert.equal(ejecutar(e, B, "consultaObtener", CICLO, "ING").version, 1, "no se guardó nada");
});

test("el tablero dice qué grupos tienen docente y la recuperación se guarda y se borra", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const u = unidad(st, "ING", "3.4.4.24");
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING");
  ejecutar(e, DIMA, "sesionEdicionGuardarCopia", CICLO, "carga:ING", { contenido: [{ unidad: u.id, componente: "T", docente: "X" }], versionBase: 0 });
  assert.equal(ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING").recuperacion.contenido[0].docente, "X");
  assert.throws(() => ejecutar(e, A, "sesionEdicionGuardarCopia", CICLO, "carga:ING", { contenido: [] }), { codigo: "SIN_PERMISO", message: /consulta la asignación/ });
  ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO" }], versionBase: 0 });
  assert.equal(ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING").recuperacion, null, "al guardar se borra");
  const t = ejecutar(e, A, "tableroObtener", CICLO);
  assert.ok(t.filas.every(f => !("docentes" in f)), "el tablero no trae los docentes: se piden aparte");
  assert.deepEqual(ejecutar(e, A, "docentesAsignadosObtener", CICLO).ING[u.id], ["VELASQUEZ DOIG, MIGUEL EDUARDO (DIMA)"]);
});

test("los docentes por grupo se guardan en caché con la versión de cada plan y cada carga", () => {
  const e = sistema();
  const st = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  const u = unidad(st, "ING", "3.4.4.24");
  assert.deepEqual(ejecutar(e, A, "docentesAsignadosObtener", CICLO), {});
  ejecutar(e, DIMA, "asignacionEdicionAbrir", CICLO, "ING");
  ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [{ unidad: u.id, componente: "T", docente: "VELASQUEZ DOIG, MIGUEL EDUARDO" }], versionBase: 0 });
  assert.equal(ejecutar(e, A, "docentesAsignadosObtener", CICLO).ING[u.id].length, 1, "guardar la carga cambia la clave");

  e.reiniciarCuentas();
  ejecutar(e, A, "docentesAsignadosObtener", CICLO);
  assert.deepEqual(Object.keys(e.cuentas.lecturas).sort(), ["Cargas", "Planes"], "con la caché caliente solo lee los índices");

  ejecutar(e, DIMA, "asignacionEdicionGuardar", CICLO, "ING", { asignaciones: [], versionBase: 1 });
  assert.equal(ejecutar(e, A, "docentesAsignadosObtener", CICLO).ING, undefined);
  assert.deepEqual(ejecutar(e, A, "docentesAsignadosObtener", "2026-2"), {}, "un ciclo sin planes");
});

test("instalar() pasa las cargas por departamento de antes a cargas por carrera", () => {
  const e = sistema();
  const st = ejecutar(e, A, "asignacionObtener", CICLO, "ING");
  const ing = unidad(st, "ING", "3.4.4.24"), adm = unidad(st, "ADM", "1.1.4.24");
  /* Una carga de DIMA guardada como antes (clave = departamento), con su bloqueo. */
  ejecutar(e, A, "registrarVersionCarga_", CICLO, "DIMA", null, { tipo: "guardar", usuario: DIMA, fecha: "2026-10-01T15:00:00.000Z", planes: {}, asignaciones: [
    { id: "a1", unidad: ing.id, componente: "T", docente: "UNO, ING" },
    { id: "a2", unidad: adm.id, componente: "T", docente: "DOS, ADM" },
    { id: "a3", unidad: null, componente: "C", docente: "TRES, SIN SECCION", carrera: "IND", codigo: "X.9" }] });
  ejecutar(e, A, "tomarBloqueo_", CICLO, "carga:DIMA", DIMA);

  /* Antes de migrar, sus asignaciones se ven como heredadas en la carrera. */
  let vista = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  let vig = e.ctx.Dominio.asignacionesVigentes(vista.unidades, Object.fromEntries(Object.entries(vista.cargas).map(([k, c]) => [k, c.asignaciones])));
  assert.deepEqual([vig.porUnidad.get(ing.id)[0].heredada, vig.porUnidad.get(ing.id)[0].cargaDe], [true, "DIMA"]);

  const resumen = ejecutar(e, A, "instalar");
  assert.match(resumen, /Se pasaron 3 asignaciones/);
  assert.deepEqual(e.hoja("Cargas").filas().map(f => f[1]).sort(), ["ADM", "IND", "ING"], "ya no hay cargas por departamento en el índice");
  const tipos = e.hoja("VersionesCarga").filas().map(f => [f[1], f[3]]);
  assert.ok(tipos.some(t => t[0] === "DIMA"), "la versión de antes queda como historial");
  assert.ok(tipos.filter(t => t[0] !== "DIMA").every(t => t[1] === "migración a carga por carrera"));
  vista = ejecutar(e, DIMA, "asignacionObtener", CICLO, "ING");
  assert.deepEqual(vista.cargas.ING.asignaciones.map(a => a.docente), ["UNO, ING"]);
  assert.deepEqual(vista.cargas.ADM.asignaciones.map(a => a.docente), ["DOS, ADM"]);
  assert.deepEqual(vista.cargas.IND.asignaciones.map(a => a.docente), ["TRES, SIN SECCION"]);
  assert.ok(e.hoja("Bloqueos").filas().every(f => f[1] !== "carga:DIMA"), "se suelta el bloqueo de la carga por departamento");
  const fecha = e.hoja("VersionesCarga").filas().find(f => f[1] === "DIMA")[5];
  assert.equal(fecha, "2026-10-01T10:00:00-05:00", "y sus fechas pasan a la hora de Perú");

  ejecutar(e, A, "instalar");
  assert.equal(e.hoja("VersionesCarga").filas().length, tipos.length, "repetir instalar() no vuelve a migrar");
});
