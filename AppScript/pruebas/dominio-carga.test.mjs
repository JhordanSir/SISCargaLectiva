/* Fase 1 del plan (docs/plan/plan-carga-por-carrera.md): dominio de la carga docente por
   carrera, sin servicios de Google. Las cifras de los Excel reales son de regresión: si
   cambian, revisar el porqué antes de actualizarlas. */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { cargar, partesXlsx, plano, XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES } from "./soporte.mjs";

const ctx = cargar(["Dominio.js", "DominioCarga.js", "LectorXlsx.js"]);
const D = ctx.Dominio;
const C = ctx.dominioCarga_();
const leer = ruta => ctx.leerLibroXlsx(partesXlsx(ruta));
const LIBROS = { carrera: leer(XLSX_CARRERA), departamento: leer(XLSX_DEPARTAMENTO), docentes: leer(XLSX_DOCENTES) };
const sembrar = usuario => ctx.cicloDesdeLibros(LIBROS.carrera, LIBROS.departamento, LIBROS.docentes, usuario);
const general = () => C.leerGeneral(LIBROS.docentes.filter(h => h.nombre === "General")[0].filas);

const grupo = (ht, hp, extra) => Object.assign({ id: "g", n: 1, ht: String(ht), hp: String(hp), desdoble: null, fusion: null,
                                                 turno: "", asignacion: null }, extra || {});
const asignatura = (codigo, sem, grupos, extra) => Object.assign({ sem: sem, malla: "2024", codigo: codigo, nombre: "Curso " + codigo,
                                                                   dpto: "DIMA", obs: "", grupos: grupos }, extra || {});
const buscar = (planes, sig, codigo) => planes[sig].filter(a => a.codigo === codigo)[0];
const docente = (texto, id) => ({ texto: texto, id: id, vinculo: "exacto" });

test("componentes: teoría y práctica, subgrupos de un desdoble y grupo sin horas", () => {
  const claves = g => plano(D.componentes(g)).map(c => c.clave + ":" + c.horas);
  assert.deepEqual(claves(grupo(3, 2)), ["T:3", "P:2"]);
  assert.deepEqual(claves(grupo(3, 2, { desdoble: "PRA×2" })), ["T:3", "P1:2", "P2:2"]);
  assert.deepEqual(claves(grupo(2, 2, { desdoble: "TEO×3" })), ["T1:2", "T2:2", "T3:2", "P:2"]);
  assert.deepEqual(claves(grupo(0, 4)), ["P:4"]);
  assert.deepEqual(claves(grupo(0, 0)), ["T:0"]);
  assert.equal(D.horasDictado(grupo(3, 2, { desdoble: "PRA×2" })), 7);
});

test("totales: el dictado suma los subgrupos de un desdoble (RF-033) y cuenta la cobertura", () => {
  const plan = [asignatura("X1", 1, [grupo(3, 2, { desdoble: "PRA×2" })]),
                asignatura("X2", 1, [grupo(2, 2, { asignacion: { T: docente("A", "a"), P: docente("A", "a") } })])];
  const t = plano(D.totales(plan));
  assert.equal(t.th, 9);
  assert.equal(t.dictado, 11, "3 de teoría y 2 + 2 de práctica, más los 4 de X2");
  assert.equal(t.cub, 1);
});

test("la segunda «HT» de la cabecera se lee como TH (P117)", () => {
  const conHT = plano(D.ubicarCabeceras([["CARRERA", "MALLA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "HT", "DOCENTE", "DPTO", "TURNO", "OBSERVACIONES"]]));
  assert.equal(conHT.mapa.HT, 5);
  assert.equal(conHT.mapa["TOTAL HORAS"], 7);
  assert.deepEqual(conHT.repetidas, []);
  const conTH = plano(D.ubicarCabeceras([["CARRERA", "HT", "HP", "TH", "DOCENTE", "TURNO"]]));
  assert.equal(conTH.mapa["TOTAL HORAS"], 3);
  assert.equal(conTH.mapa.DOCENTE, 4);
  assert.equal(conTH.mapa.TURNO, 5);
});

test("interpretar lee TURNO y deja el texto de DOCENTE aparte, sin meterlo en el plan", () => {
  const m = [["CARRERA", "SEMESTRE", "CODIGO", "ASIGNATURA", "HT", "HP", "DOCENTE", "TURNO"],
             ["ING", "1-2", "3.1.1.24", "Introducción a la Programación", "2", "4", "ZEGARRA MILAGROS / BERNEDO FLORES LIZ", "Tarde"]];
  const r = D.interpretar(m, { carrera: "ING" });
  const g = r.asignaturas[0].grupos[0];
  assert.equal(g.turno, "Tarde");
  assert.equal(g.asignacion, null);
  assert.equal(r.lecturaDocente.length, 1);
  assert.equal(r.lecturaDocente[0].grupo, g);
  assert.equal(r.lecturaDocente[0].texto, "ZEGARRA MILAGROS / BERNEDO FLORES LIZ");
});

test("celda DOCENTE: un docente, cátedra compartida, subgrupos, vacante y textos sin docente", () => {
  const partes = t => plano(C.leerCeldaDocente(t));
  assert.deepEqual(partes("Arce Larrea Glenn//Portugal Pacheco Angela").map(p => p.texto), ["Arce Larrea Glenn", "Portugal Pacheco Angela"]);
  assert.deepEqual(partes("ZEGARRA MILAGROS / BERNEDO FLORES LIZ").map(p => p.texto), ["ZEGARRA MILAGROS", "BERNEDO FLORES LIZ"]);
  assert.deepEqual(partes("Docente Internacional Pendiente"), [{ texto: "Docente Internacional Pendiente", vacante: true }]);
  assert.deepEqual(partes("PENDIENTE"), [{ texto: "PENDIENTE", sinDocente: true }]);
  assert.deepEqual(partes("A / "), [{ texto: "A" }, { texto: "", sinDocente: true }]);

  const reparto = (g, t) => plano(C.repartir(g, C.leerCeldaDocente(t)));
  assert.deepEqual(Object.entries(reparto(grupo(2, 2), "A / B").asignacion).map(([k, p]) => k + "=" + p.texto), ["T=A", "P=B"]);
  assert.deepEqual(Object.entries(reparto(grupo(3, 2, { desdoble: "PRA×2" }), "A / B").asignacion).map(([k, p]) => k + "=" + p.texto),
                   ["T=A", "P1=B", "P2=B"]);
  assert.deepEqual(Object.entries(reparto(grupo(3, 2, { desdoble: "PRA×2" }), "A / B / C").asignacion).map(([k, p]) => k + "=" + p.texto),
                   ["T=A", "P1=B", "P2=C"]);
  const sobra = reparto(grupo(3, 0), "A / B");
  assert.deepEqual(Object.keys(sobra.asignacion), ["T"]);
  assert.match(sobra.aviso, /no se usó «B»/);

  const g = grupo(3, 2, { desdoble: "PRA×2", asignacion: { T: docente("A"), P1: docente("A"), P2: docente("B") } });
  assert.equal(C.escribirCeldaDocente(g), "A / A / B");
  assert.equal(C.escribirCeldaDocente(grupo(2, 2, { asignacion: { T: docente("A"), P: docente("B") } })), "A / B");
  assert.equal(C.escribirCeldaDocente(grupo(2, 2, { asignacion: { T: docente("A") } })), "A / ");
  assert.equal(C.escribirCeldaDocente(grupo(2, 2, { asignacion: { T: { texto: "", vacante: "INTERNACIONAL" }, P: { texto: "", vacante: "INTERNACIONAL" } } })),
               "Docente Internacional Pendiente");
});

test("General de CargaDeDocentes: fichas, identificadores, departamentos y marcas de P124", () => {
  const cat = general();
  assert.equal(cat.length, 12);
  const por = n => cat.filter(f => D.normalizar(f.nombre).includes(n))[0];
  assert.equal(por("ALATRISTA").id, "DNI:40566116");
  assert.equal(por("ALATRISTA").dpto, "DACTE");
  assert.equal(por("ALFARO").dpto, "DIMA");
  assert.equal(por("ARAMAYO").dpto, "DACJ");
  assert.equal(por("CHAVEZ CONTRERAS").dpto, "DAHUC");
  assert.equal(por("ALFARO").dedicacion, "TC");
  assert.equal(por("FLORES PARRA").id, "N:FLORES JOSUE MIGUEL PARRA", "sin DNI, el identificador sale del nombre");
  assert.equal(por("FLORES PARRA").categoria, "AUXILIAR/INTERNACIONAL");
  assert.ok(cat.every(f => !f.porCompletar));

  const conMarcas = C.leerGeneral([["N°", "DNI", "APELLIDO PAT", "APELLIDO MAT", "NOMBRES", "CONDICIÓN", "DEDIC.", "TC_OTRA_UNIV", "CARGO_ADMIN"],
                                   ["1", "123", "Pérez", "Rojas", "Ana", "Ordinario", "TC", "Sí", "Coordinadora"]]);
  assert.equal(conMarcas[0].tcOtraUniv, true);
  assert.equal(conMarcas[0].cargo, "Coordinadora");
});

test("emparejamiento con el catálogo: exacto, parecido en los dos sentidos, ambiguo y nuevo (P126)", () => {
  const cat = general();
  const estado = t => C.emparejar(t, cat).estado;
  const quien = t => C.emparejar(t, cat).docente.nombre;
  assert.equal(estado("ALFARO BEJARANO JULIO CARLO"), "exacto");
  assert.equal(quien("Chávez Contreras, Ángel Evaristo"), "CHÁVEZ CONTRERAS, ÁNGEL EVARISTO");
  assert.equal(quien("Ludgens Zereceda, Cesar Adolfo"), "LÜTGENS ZERECEDA, CÉSAR ADOLFO");
  assert.equal(quien("ZEGARRA MILAGROS"), "ZEGARRA MEJIA, MILAGROS ROCIO DEL CARMEN");
  assert.equal(estado("Zegarra"), "nuevo", "una sola palabra solo empareja si es exacta");
  assert.equal(estado("Mazeyra Guillén, Orlando Alonso"), "nuevo");

  const corto = [C.altaPorCompletar("BERNEDO FLORES LIZ", [])];
  assert.equal(C.emparejar("BERNEDO FLORES LIZ SANDRA", corto).estado, "probable");
  const dos = [C.altaPorCompletar("García Pérez, Juan", []), C.altaPorCompletar("García Pérez, Juana", [])];
  assert.equal(C.emparejar("García Pérez", dos).estado, "ambiguo");
});

test("alta por completar: apellidos y nombres con y sin coma, y partículas", () => {
  const partes = t => plano(C.separarNombre(t));
  assert.deepEqual(partes("Amat y León Arispe, Juan Sebastian"), { paterno: "Amat y León", materno: "Arispe", nombres: "Juan Sebastian" });
  assert.deepEqual(partes("Gómez de la Torre Rivera, Carlos"), { paterno: "Gómez de la Torre", materno: "Rivera", nombres: "Carlos" });
  assert.deepEqual(partes("ZEGARRA MEJIA MILAGROS ROCIO DEL CARMEN"), { paterno: "ZEGARRA", materno: "MEJIA", nombres: "MILAGROS ROCIO DEL CARMEN" });
  const f = C.altaPorCompletar("Villanueva, Carlos", general());
  assert.equal(f.porCompletar, true);
  assert.equal(f.n, "115", "el N° siguiente al mayor del catálogo (114)");
  assert.equal(f.nombre, "Villanueva, Carlos");
});

test("lectura de las anotaciones de fusión", () => {
  const lee = t => { const r = D.leerFusionTexto(t); return r && { partes: plano(r.partes).map(p => p.sig + "-" + p.sem), con: r.con }; };
  assert.deepEqual(lee("FUSIÓN ADM-4/ICO-4/COM-4"), { partes: ["ADM-4", "ICO-4", "COM-4"], con: false });
  assert.deepEqual(lee("Fusión  ADM4/ICO 4"), { partes: ["ADM-4", "ICO-4"], con: false });
  assert.deepEqual(lee("Fusionado con ADM IV"), { partes: ["ADM-4"], con: true });
  assert.deepEqual(lee("FUSION ING - 10"), { partes: ["ING-10"], con: false });
  assert.deepEqual(lee("FUSIÓN CON COM-3"), { partes: ["COM-3"], con: true });
  assert.deepEqual(lee("FUSIÓN DER-9 / ICO-7 /COM-6"), { partes: ["DER-9", "ICO-7", "COM-6"], con: false });
  assert.equal(lee("INTERNACIONAL COLOMBIA- VIRTUAL"), null);
});

test("fusiones de los Excel reales: 23 secciones con el principal de CargaXDepartamento (P118, P130)", () => {
  const r = sembrar();
  assert.equal(r.fusiones.length, 23);
  const principal = (sig, codigo) => buscar(r.planes, sig, codigo).grupos[0].fusionPrincipal;
  for (const [si, no] of [[["COM", "8.3.1.24"], ["ICO", "7.3.2.24"]],     // «CON» contradictorios: Informática
                          [["ARQ", "16.3.1.24"], ["IND", "17.3.1.24"]],   // Informática
                          [["ING", "3.4.7.24"], ["ING", "3.10.6.21"]],    // Derechos Humanos
                          [["ADM", "1.4.6.24"], ["ICO", "7.6.3.22"]],     // lista sin resolver + «con ADM IV»
                          [["ADM", "1.3.5.24"], ["ICO", "7.5.1.24"]],     // lista + «con ADM 3»
                          [["ICO", "7.3.3.24"], ["COM", "8.3.3.24"]]]) {  // lista: Epistemología
    assert.equal(principal(...si), true, si.join(" ") + " es el principal");
    assert.equal(principal(...no), false, no.join(" ") + " no es el principal");
  }
  const com = buscar(r.planes, "COM", "8.3.3.24").grupos[0];
  assert.deepEqual(plano([com.ht, com.hp, com.previas]), ["2", "2", { ht: "4", hp: "0" }], "toma las horas del principal y guarda las suyas");
  assert.ok(r.avisos.some(a => /«Fusión  ADM4\/ICO 4» cita ICO-4/.test(a)));
  assert.equal(r.avisos.filter(a => /no coinciden en el grupo principal/.test(a)).length, 3);
});

test("siembra con los Excel reales: vínculos, altas y las asignaciones que A11 deja pendientes (P122)", () => {
  const r = sembrar();
  const d = plano(r.docentes);
  assert.equal(r.catalogo.length, 119);
  assert.equal(d.altas.length, 107);
  assert.deepEqual(d.vinculos.map(v => v.texto).sort(), ["Ardiles Zevallos, Luis Albert", "BERNEDO FLORES LIZ SANDRA",
    "Ludgens Zereceda, Cesar Adolfo", "ZEGARRA MILAGROS", "Zegarra Pajuelo, Mariela Ada Lux"]);
  assert.deepEqual(d.ambiguos, []);
  assert.deepEqual(d.pendientes.map(p => [p.sig, p.codigo, p.componentes.join(""), p.regla, p.texto]), [
    ["ADM", "1.8.5.21", "T", "A11", "Parreño Fernández Andrea Camila"],
    ["ADM", "1.8.5.21", "P", "A11", "Rivera Castillo Jaime Ignacio"],
    ["IND", "17.3.6.24", "T", "A11", "ARIAS ENRÍQUEZ JOEL FERNANDO"]]);
  const tlc = buscar(r.planes, "ADM", "1.8.5.21").grupos[0];
  assert.equal(tlc.asignacion, null);
  assert.equal(tlc.rechazos.length, 2, "el nombre rechazado queda para la nota de la celda");

  const ing = buscar(r.planes, "ING", "3.1.1.24").grupos[1];
  assert.equal(ing.asignacion.T.id, "DNI:29619827", "cátedra compartida: la teoría para Zegarra Mejía");
  assert.equal(ing.asignacion.P.texto, "BERNEDO FLORES LIZ");
  assert.equal(C.escribirCeldaDocente(ing), "ZEGARRA MILAGROS / BERNEDO FLORES LIZ");
  const ico = buscar(r.planes, "ICO", "7.3.2.24").grupos[0];
  assert.equal(ico.asignacion.T.id, "DNI:29619827", "el grupo fusionado recibe el docente del principal");
  assert.ok(r.avisos.some(a => /ING 3\.7\.7\.21 «Epistemología».*se le asignó «Mendoza Vargas, Miguel Gerardo» y no «Ávila Fernández, Gonzalo Arturo»/.test(a)));
});

test("balance del ciclo: la fusión cuenta una vez, A09 y los grupos sin docente (A13)", () => {
  const r = sembrar();
  const ev = C.evaluarCiclo(r.planes, r.catalogo);
  const horas = n => ev.docentes.filter(x => D.normalizar(x.ficha ? x.ficha.nombre : x.texto).includes(n))[0];
  assert.equal(horas("ARIAS ENRIQUEZ").horas, 8);
  assert.deepEqual(plano(horas("ARIAS ENRIQUEZ").porCarrera), { ADM: 4, ARQ: 4, IND: 0 });
  assert.equal(horas("AVILA FERNANDEZ").horas, 20, "32 h sin descontar las secciones fusionadas");
  assert.equal(horas("BEDREGAL CACERES").horas, 19);
  const avisos = ev.docentes.flatMap(x => x.advertencias.map(a => a.codigo + " " + (x.ficha ? x.ficha.nombre : x.texto)));
  assert.deepEqual(plano(avisos), ["A09 TORRES CALCIN, HENRY LUIS"]);
  assert.deepEqual(Object.entries(ev.pendientes).filter(([, p]) => p.grupos.length).map(([sig, p]) => sig + ":" + p.grupos.length), ["ADM:1", "IND:1"]);
  assert.equal(ev.pendientes.ADM.advertencia.codigo, "A13");
});

test("bloqueos: A07, A08 y A11 impiden asignar y lo que no empeora pasa (P119, P122, P123)", () => {
  const cat = [Object.assign(C.altaPorCompletar("Ana Ruiz", []), { condicion: "Ordinario", dedicacion: "TC", porCompletar: false }),
               Object.assign(C.altaPorCompletar("Beto Soto", []), { condicion: "Contratado", dedicacion: "TP", tcOtraUniv: true, porCompletar: false })];
  const ana = docente("Ana Ruiz", cat[0].id), beto = docente("Beto Soto", cat[1].id);
  const planes = {
    ING: [asignatura("X1", 1, [grupo(2, 2)]), asignatura("X2", 1, [grupo(2, 2)]), asignatura("X3", 2, [grupo(2, 2)], { malla: "2021" }),
          asignatura("X4", 1, [grupo(2, 2)], { malla: "2021" })].concat(
          [5, 6, 7, 8, 9].map(s => asignatura("Y" + s, s, [grupo(4, 4)])))
  };
  const ref = codigo => ({ sig: "ING", ci: planes.ING.findIndex(a => a.codigo === codigo), gi: 0 });
  const todo = d => ({ T: d, P: d });

  assert.equal(C.asignar(planes, ref("X1"), todo(ana), cat).ok, true);
  const cruce = C.asignar(planes, ref("X2"), todo(ana), cat);
  assert.equal(cruce.ok, false);
  assert.equal(cruce.bloqueos[0].codigo, "A11");
  assert.equal(buscar(planes, "ING", "X2").grupos[0].asignacion, null, "si bloquea, no cambia nada");
  assert.equal(C.asignar(planes, ref("X4"), todo(ana), cat).ok, true, "otra malla del mismo semestre no cruza");

  ["Y5", "Y6"].forEach(c => assert.equal(C.asignar(planes, ref(c), todo(beto), cat).ok, true));   // 16 h
  const a08 = C.asignar(planes, ref("X3"), { T: beto }, cat);
  assert.equal(a08.ok, false);
  assert.equal(a08.bloqueos[0].codigo, "A08");

  ["Y5", "Y6", "Y7", "Y8"].forEach(c => assert.equal(C.asignar(planes, ref(c), todo(ana), cat).ok, true));   // 8 + 32 = 40 h
  const a07 = C.asignar(planes, ref("X3"), { T: ana }, cat);
  assert.equal(a07.ok, false);
  assert.equal(a07.bloqueos[0].codigo, "A07");
  assert.equal(C.asignar(planes, ref("Y8"), { T: null, P: null }, cat).ok, true, "quitar horas siempre se puede");
  assert.equal(C.asignar(planes, ref("X3"), { T: ana }, cat).ok, true, "con 32 h vuelve a caber");
  assert.equal(C.asignar(planes, ref("Y9"), todo(ana), cat, { A07: { max: 50 } }).ok, true, "el tope es configurable (RNF-11)");
});

test("reemplazo: el reemplazante pasa a vigente, el titular queda en el historial y rigen las mismas reglas", () => {
  const cat = [C.altaPorCompletar("Lady Ruiz", []), C.altaPorCompletar("Luis Patiño", [])];
  const lady = docente("Lady Ruiz", cat[0].id), luis = docente("Luis Patiño", cat[1].id);
  const planes = { ING: [asignatura("X1", 1, [grupo(2, 2, { asignacion: { T: lady, P: lady } })]),
                         asignatura("X2", 1, [grupo(2, 2, { asignacion: { T: luis, P: luis } })])],
                   ICO: [asignatura("Z1", 1, [grupo(2, 2, { asignacion: { T: lady, P: lady } })])] };
  D.fusionarEnCiclo(planes, [{ sig: "ING", ci: 0, gi: 0 }, { sig: "ICO", ci: 0, gi: 0 }], { sig: "ING", ci: 0, gi: 0 }, "FX");
  const datos = { motivo: "Licencia médica", resolucion: "R-123-2026", fechaEfectiva: "2026-05-04", usuario: "director@ulasalle.edu.pe", fecha: "2026-05-03" };

  const cruce = C.reemplazar(planes, { sig: "ING", ci: 0, gi: 0 }, ["T", "P"], luis, datos, cat);
  assert.equal(cruce.ok, false, "Luis ya dicta X2 en el mismo semestre");
  assert.equal(cruce.bloqueos[0].codigo, "A11");

  planes.ING[1].grupos[0].asignacion = null;
  assert.equal(C.reemplazar(planes, { sig: "ING", ci: 0, gi: 0 }, ["T", "P"], luis, datos, cat).ok, true);
  const t = planes.ING[0].grupos[0].asignacion.T;
  assert.equal(t.texto, "Luis Patiño");
  assert.deepEqual(plano(t.historial), [{ texto: "Lady Ruiz", id: cat[0].id, motivo: "Licencia médica", resolucion: "R-123-2026",
                                          fechaEfectiva: "2026-05-04", usuario: "director@ulasalle.edu.pe", fecha: "2026-05-03" }]);
  assert.equal(planes.ICO[0].grupos[0].asignacion.T.texto, "Luis Patiño", "el reemplazo alcanza a toda la sección fusionada");
});

test("importar: un Coordinador no asigna docentes y un Director solo en su DPTO (P114, P127)", () => {
  const coord = sembrar({ rol: "coordinador", carreras: ["ING"] });
  assert.equal(coord.docentes.ignoradas, 365);
  assert.match(coord.docentes.avisos.slice(-1)[0], /solo los asigna un Director, en las filas de su DPTO/);
  assert.ok(Object.values(coord.planes).every(p => p.every(a => a.grupos.every(g => g.asignacion === null))));

  const dima = sembrar({ rol: "director", departamento: "DIMA" });
  assert.equal(dima.docentes.ignoradas, 271);
  const asignados = Object.values(dima.planes).flatMap(p => p.filter(a => a.grupos.some(g => g.asignacion)));
  assert.ok(asignados.length > 0);
  assert.ok(asignados.every(a => D.normalizarDpto(a.dpto) === "DIMA"));
});

test("consolidado por departamento: por docente, con la sección fusionada en 0 h y los pendientes (RF-098)", () => {
  const r = sembrar();
  const resumen = Object.fromEntries(["DIMA", "DAHUC", "DACJ", "DACTE"].map(k => {
    const c = C.consolidadoDepartamento(r.planes, r.catalogo, k);
    return [k, [c.docentes.length, c.pendientes.length, c.horasPedidas, c.horasCubiertas, c.cobertura]];
  }));
  assert.deepEqual(resumen, { DIMA: [32, 1, 418, 416, 99.5], DAHUC: [27, 0, 388, 388, 100], DACJ: [29, 0, 320, 320, 100], DACTE: [35, 1, 330, 325, 98.5] });

  const dima = C.consolidadoDepartamento(r.planes, r.catalogo, "DIMA");
  const arias = dima.docentes.filter(x => /ARIAS/.test(D.normalizar(x.nombre)))[0];
  assert.deepEqual(plano(arias.filas).map(f => [f.sig, f.codigo, f.ht, f.hp, f.th]),
                   [["ADM", "1.3.1.24", 2, 2, 4], ["ARQ", "16.3.1.24", 2, 2, 4], ["IND", "17.3.1.24", 0, 0, 0]]);
  assert.equal(arias.total, 8);
  assert.deepEqual(plano(dima.pendientes).map(p => [p.sig, p.codigo, p.rechazos[0].texto]), [["IND", "17.3.6.24", "ARIAS ENRÍQUEZ JOEL FERNANDO"]]);
});

test("crearDominioCarga() funciona fuera de su archivo, como en el navegador", () => {
  const fuentes = cargar(["Dominio.js", "DominioCarga.js"]);
  const texto = "(function () { var Dominio = (" + fuentes.crearDominio.toString() + ")(); return (" +
                fuentes.crearDominioCarga.toString() + ")(Dominio); })()";
  const carga = vm.runInNewContext(texto, {});
  assert.equal(carga.escribirCeldaDocente({ ht: "2", hp: "2", asignacion: { T: { texto: "A" }, P: { texto: "B" } } }), "A / B");
  assert.equal(carga.reglas().A07.max, 40);
});
