/* Fase 2 del plan: formato de la hoja de carrera (RF-086 a RF-089) y conversión entre el
   plan y las filas, sin servicios de Google. */
import test from "node:test";
import assert from "node:assert/strict";
import { cargar, partesXlsx, plano, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const ctx = cargar(["Dominio.js", "DominioCarga.js", "HojaCarrera.js", "LectorXlsx.js"]);
const D = ctx.Dominio;
const C = ctx.dominioCarga_();
const leer = ruta => ctx.leerLibroXlsx(partesXlsx(ruta));
const LIBROS = [leer(XLSX_CARRERA), leer(XLSX_DEPARTAMENTO), leer(XLSX_DOCENTES)];
const sembrar = () => ctx.cicloDesdeLibros(...LIBROS);
const col = n => ctx.COLUMNAS_HOJA_.indexOf(n);

/* Lo que devolvería getDisplayValues() de la hoja escrita. */
const mostrar = filas => filas.map(f => f.valores.map(v => String(v)));
const canonico = asignaturas => D.contenidoCanonico(plano(asignaturas));

const grupo = (n, ht, hp, extra) => Object.assign({ id: "g" + n + ht + hp, n: n, ht: String(ht), hp: String(hp), desdoble: null,
                                                     fusion: null, turno: "Mañana", asignacion: null }, extra || {});
const asignatura = (codigo, sem, grupos, extra) => Object.assign({ sem: sem, malla: "2024", codigo: codigo, nombre: "Curso " + codigo,
                                                                   dpto: "DIMA", obs: "", grupos: grupos }, extra || {});
const doc = texto => ({ texto: texto, id: "N:" + texto, vinculo: "exacto" });

test("nombres de las hojas: el de la pestaña del Excel y el ciclo en romano (P131)", () => {
  assert.equal(ctx.cicloRomano("2026-1"), "2026-I");
  assert.equal(ctx.cicloRomano("2027-2"), "2027-II");
  assert.equal(ctx.nombreHojaCarrera("ING", "2026-1"), "Ing. Software 2026-I");
  assert.equal(ctx.nombreHojaCarrera("COM", "2026-2"), "Cs. de la Comunicación 2026-II");
  assert.equal(ctx.nombreHojaGeneral("2026-1"), "General 2026-I");
  assert.equal(ctx.nombreHojaDepartamento("DIMA", "2026-1"), "CARGA DIMA 2026-I");
  assert.equal(ctx.tituloHojaCarrera("2026-1"), "CARGA LECTIVA 2026-I");
  assert.deepEqual(plano(D.CARRERAS.map(c => c.sig)), ["ADM", "DER", "ING", "ICO", "COM", "PSI", "ARQ", "IND"]);
});

test("las 8 carreras sembradas se escriben y se leen sin perder nada", () => {
  const r = sembrar();
  for (const sig of Object.keys(r.planes)) {
    const filas = ctx.filasDeCarrera(sig, r.planes[sig], r.planes);
    assert.ok(filas.every(f => f.valores.length === 16));
    const leido = ctx.planDeFilas(sig, mostrar(filas));
    assert.equal(canonico(leido.asignaturas), canonico(r.planes[sig]), sig + ": el plan leído es el escrito");
    assert.deepEqual(plano(leido.asignaturas).flatMap(a => a.grupos.map(g => g.id)),
                     plano(r.planes[sig]).flatMap(a => a.grupos.map(g => g.id)), sig + ": conserva los identificadores");
    assert.deepEqual([leido.cambiosDocente.length, leido.obsCambiadas.length, leido.editadas], [0, 0, 0], sig);
  }
});

test("columnas de la hoja: GRUPO al final, TH escrita por el sistema y SECCIÓN de una fusión entre carreras (P132, P134)", () => {
  const r = sembrar();
  const filaDe = (sig, codigo) => ctx.filasDeCarrera(sig, r.planes[sig], r.planes).filter(f => f.valores[col("CODIGO")] === codigo)[0];
  const ing = ctx.filasDeCarrera("ING", r.planes.ING, r.planes).filter(f => f.valores[col("CODIGO")] === "3.1.1.24");
  assert.deepEqual(plano(ing.map(f => [f.valores[col("SEMESTRE")], f.valores[col("GRUPO")], f.valores[col("TH")]])), [["1", "1", 6], ["1", "2", 6]]);
  assert.equal(ing[1].valores[col("DOCENTE")], "ZEGARRA MILAGROS / BERNEDO FLORES LIZ");
  assert.match(ing[1].nota, /«ZEGARRA MILAGROS» se vinculó por parecido con «ZEGARRA MEJIA, MILAGROS ROCIO DEL CARMEN»/);

  const principal = filaDe("ICO", "7.3.3.24"), miembro = filaDe("COM", "8.3.3.24");
  assert.match(principal.valores[col("SECCIÓN")], /^F[0-9A-F]{6} · principal$/);
  assert.equal(miembro.valores[col("SECCIÓN")], principal.valores[col("SECCIÓN")].replace(" · principal", " · con ICO 7.3.3.24"));
  assert.deepEqual([miembro.valores[col("HT")], miembro.valores[col("HP")]], [2, 2], "el miembro muestra las horas del principal");
  assert.equal(miembro.colorSeccion, ctx.COLOR_FUSIONADO_);
});

test("lo editado a mano: DOCENTE, horas, filas nuevas con «1-2» o GRUPO, filas borradas y anotaciones nuevas", () => {
  const plan = [asignatura("X1", 1, [grupo(1, 2, 2, { asignacion: { T: doc("Ana Ruiz"), P: doc("Ana Ruiz") } })]),
                asignatura("X2", 2, [grupo(1, 3, 0)])];
  const filas = mostrar(ctx.filasDeCarrera("ING", plan, { ING: plan }));
  filas[0][col("DOCENTE")] = "Ana Ruiz / Beto Soto";
  filas[1][col("HT")] = "4";
  const sinSis = (sem, grupoCelda, docente) => ["ING", "2024", sem, "X3", "Curso nuevo", "2", "2", "", docente, "DIMA", "Tarde", "", grupoCelda, "", "", ""];
  filas.push(sinSis("3-2", "", "Carla Díaz"), sinSis("3", "4", ""));
  const leido = plano(ctx.planDeFilas("ING", filas));
  assert.equal(leido.editadas, 4);
  assert.deepEqual(leido.cambiosDocente.map(c => [c.ci, c.claves.join(""), c.texto]), [[0, "TP", "Ana Ruiz / Beto Soto"], [2, "TP", "Carla Díaz"]]);
  assert.equal(leido.asignaturas[1].grupos[0].ht, "4");
  assert.deepEqual(leido.asignaturas[2].grupos.map(g => [g.n, g.turno]), [[2, "Tarde"], [4, "Tarde"]]);
  assert.equal(leido.asignaturas[2].sem, 3);

  const borrada = plano(ctx.planDeFilas("ING", mostrar(ctx.filasDeCarrera("ING", plan, { ING: plan })).slice(1)));
  assert.deepEqual(borrada.asignaturas.map(a => a.codigo), ["X2"]);

  const conAnotacion = mostrar(ctx.filasDeCarrera("ING", plan, { ING: plan }));
  conAnotacion[1][col("OBSERVACIONES")] = "FUSIÓN CON ADM-2";
  assert.deepEqual(plano(ctx.planDeFilas("ING", conAnotacion).obsCambiadas).map(a => a.codigo), ["X2"]);
});

test("desdoble: una fila por subgrupo, cada una con su DOCENTE (P133)", () => {
  const g = grupo(1, 3, 2, { desdoble: "PRA×2", asignacion: { T: doc("Patiño"), P1: doc("Patiño"), P2: doc("Bernedo") } });
  const plan = [asignatura("3.3.1.24", 3, [g])];
  const filas = ctx.filasDeCarrera("ING", plan, { ING: plan });
  assert.deepEqual(plano(filas.map(f => [f.valores[col("HT")], f.valores[col("HP")], f.valores[col("TH")], f.valores[col("DOCENTE")], f.valores[col("SUBGRUPO")]])),
                   [[3, 2, 5, "Patiño", "P1"], [0, 2, 2, "Bernedo", "P2"]]);
  assert.equal(canonico(ctx.planDeFilas("ING", mostrar(filas)).asignaturas), canonico(plan));

  const otra = mostrar(filas);
  otra[1][col("DOCENTE")] = "Díaz";
  otra[1][col("HP")] = "3";
  const leido = plano(ctx.planDeFilas("ING", otra));
  assert.deepEqual(leido.cambiosDocente.map(c => [c.claves.join(""), c.texto]), [["P2", "Díaz"]]);
  assert.equal(leido.asignaturas[0].grupos[0].hp, "3", "la práctica de un subgrupo es la del desdoble");

  const sinSegundo = plano(ctx.planDeFilas("ING", mostrar(filas).slice(0, 1)));
  assert.equal(sinSegundo.asignaturas[0].grupos[0].desdoble, null, "con un solo subgrupo ya no hay desdoble");

  const teoria = [asignatura("T1", 1, [grupo(1, 2, 2, { desdoble: "TEO×2" })])];
  assert.deepEqual(plano(ctx.filasDeCarrera("ING", teoria, { ING: teoria }).map(f => [f.valores[col("HT")], f.valores[col("HP")], f.valores[col("SUBGRUPO")]])),
                   [[2, 2, "T1"], [2, 0, "T2"]]);
});

test("una fila copiada con el identificador de otra se lee como grupo nuevo, y CARRERA distinta avisa", () => {
  const plan = [asignatura("X1", 1, [grupo(1, 2, 2)])];
  const filas = mostrar(ctx.filasDeCarrera("ING", plan, { ING: plan }));
  filas.push(filas[0].slice());
  filas[1][col("CARRERA")] = "ADM";
  const leido = plano(ctx.planDeFilas("ING", filas));
  assert.equal(leido.asignaturas[0].grupos.length, 2);
  assert.notEqual(leido.asignaturas[0].grupos[0].id, leido.asignaturas[0].grupos[1].id);
  assert.ok(leido.avisos.some(a => /repite el identificador/.test(a)));
  assert.ok(leido.avisos.some(a => /dice CARRERA «ADM», pero está en la hoja de ING/.test(a)));
});

test("un DOCENTE escrito a mano que incumple A11 vuelve a su último valor aceptado, con nota y en rojo (P122)", () => {
  const r = sembrar();
  const filas = mostrar(ctx.filasDeCarrera("IND", r.planes.IND, r.planes));
  const i = filas.findIndex(f => f[col("CODIGO")] === "17.3.6.24");
  filas[i][col("DOCENTE")] = "ARIAS ENRÍQUEZ JOEL FERNANDO";
  const leido = ctx.planDeFilas("IND", filas);
  r.planes.IND = leido.asignaturas;
  const res = plano(C.aplicarCambiosDocente(r.planes, leido.cambiosDocente, r.catalogo, { rol: "director", departamento: "TODOS" }));
  assert.deepEqual(res.rechazados.map(x => [x.codigo, x.regla]), [["17.3.6.24", "A11"]]);
  const despues = ctx.filasDeCarrera("IND", r.planes.IND, r.planes)[i];
  assert.equal(despues.valores[col("DOCENTE")], "");
  assert.equal(despues.colorDocente, ctx.COLOR_RECHAZO_);
  assert.match(despues.nota, /No se aceptó «ARIAS ENRÍQUEZ JOEL FERNANDO»: .*\(A11\)/);

  const otra = mostrar(ctx.filasDeCarrera("IND", r.planes.IND, r.planes));
  otra[i][col("DOCENTE")] = "VILCA MAMANI MARCO ANTONIO";
  const segunda = ctx.planDeFilas("IND", otra);
  r.planes.IND = segunda.asignaturas;
  const ok = plano(C.aplicarCambiosDocente(r.planes, segunda.cambiosDocente, r.catalogo, { rol: "director", departamento: "TODOS" }));
  assert.equal(ok.aceptados.length, 1);
  const final = ctx.filasDeCarrera("IND", r.planes.IND, r.planes)[i];
  assert.equal(final.valores[col("DOCENTE")], "VILCA MAMANI MARCO ANTONIO");
  assert.equal(final.colorDocente, null);
  assert.equal(final.nota, "", "el rechazo desaparece al asignar otro docente");
});

test("General: el orden y las columnas de CargaDeDocentes, con horas por carrera, LECTIVAS y totales (RF-097)", () => {
  const r = sembrar();
  const g = plano(ctx.filasDeGeneral(r.catalogo, C.horasGeneral(r.planes, r.catalogo)));
  assert.equal(g.filas.length, 119);
  assert.equal(ctx.COLUMNAS_GENERAL_.length, g.filas[0].length);
  const alatrista = g.filas.filter(f => f[2] === "ALATRISTA")[0];
  assert.deepEqual([alatrista[1], alatrista[ctx.COLUMNAS_GENERAL_.indexOf("ADM")], alatrista[ctx.COLUMNAS_GENERAL_.indexOf("LECTIVAS")]],
                   ["40566116", 9, 9], "las 9 h de ADM que trae CargaDeDocentes");
  assert.equal(g.total[ctx.COLUMNAS_GENERAL_.indexOf("DEDIC.")], "TOTAL");
  assert.equal(g.total[ctx.COLUMNAS_GENERAL_.indexOf("LECTIVAS")], g.filas.reduce((s, f) => s + f[ctx.COLUMNAS_GENERAL_.indexOf("LECTIVAS")], 0));
});

test("CARGA DIMA: cada docente con sus cursos y su TOTAL, y los grupos sin docente (RF-098)", () => {
  const r = sembrar();
  const filas = plano(ctx.filasDeDepartamento(C.consolidadoDepartamento(r.planes, r.catalogo, "DIMA")));
  const i = filas.findIndex(f => /^ARIAS ENR/.test(f[0]));
  assert.deepEqual(filas.slice(i, i + 4).map(f => [f[0] ? "Arias" : "", f[1], f[4], f[8]]),
                   [["Arias", "ADM", "1.3.1.24", 4], ["", "ARQ", "16.3.1.24", 4], ["", "IND", "17.3.1.24", 0], ["", "", "", 8]]);
  assert.equal(filas[i + 3][7], "TOTAL");
  const sin = filas.findIndex(f => f[0] === "SIN DOCENTE");
  assert.match(filas[sin + 1][9], /^Grupo 1: falta T\. No se aceptó «ARIAS ENRÍQUEZ JOEL FERNANDO» \(A11\)$/);
  assert.match(filas[filas.length - 1][0], /^Horas pedidas: 418 · cubiertas: 416 · cobertura: 99\.5 %$/);
});
