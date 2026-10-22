import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { cargar, plano, ARCHIVOS_DOMINIO } from "./soporte.mjs";

const D = cargar(ARCHIVOS_DOMINIO).Dominio;

const CABECERA = ["CARRERA", "MALLA", "SEMESTRE", "CÓDIGO", "ASIGNATURA", "GRUPO", "HT", "HP", "TH", "DPTO", "OBSERVACIÓN"];

test("divide texto tabulado y CSV con comillas", () => {
  assert.deepEqual(plano(D.matrizDesdeTexto("a\tb\n\n c \t d ")), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(plano(D.matrizDesdeTexto('x;"y;z";"di ""hola"""\n1;2;3')), [["x", "y;z", 'di "hola"'], ["1", "2", "3"]]);
});

test("interpreta la plantilla con título encima, sinónimos y semestre-grupo", () => {
  const m = [["PLAN 2026-1"], [], CABECERA,
    ["ING", "2024", "1-2", "3.1.1.24", "Cálculo I", "", "3", "2", "5", "DIMA", "VIRTUAL"],
    ["ING", "2024", "1", "3.1.1.24", "Cálculo I", "", "3", "2", "5", "DIMA", ""],
    ["ING", "2024", "2", "3.2.1.24", "Física I", "3", "4", "2", "6", "DIMA", ""]];
  const { asignaturas, ignoradas } = plano(D.interpretar(m, { carrera: "ING" }));
  assert.equal(ignoradas, 0);
  assert.equal(asignaturas.length, 2);
  assert.deepEqual(asignaturas[0].grupos.map(g => g.n), [1, 2]);
  assert.equal(asignaturas[0].obs, "VIRTUAL");
  assert.deepEqual(asignaturas[1].grupos.map(g => g.n), ["3"]);
});

test("importa solo las filas de la carrera del plan y cuenta las demás", () => {
  const m = [CABECERA,
    ["Ing. Software", "2024", "1", "3.1.1.24", "Cálculo I", "1", "3", "2", "5", "DIMA", ""],
    ["ADM", "2024", "1", "1.1.1.24", "Comunicación I", "1", "2", "2", "4", "DAHUC", ""],
    ["", "2024", "1", "3.1.2.24", "Álgebra", "1", "3", "2", "5", "DIMA", ""],
    ["DER", "2024", "1", "2.1.1.24", "Derecho Romano", "1", "2", "2", "4", "DACJ", ""]];
  const r = plano(D.interpretar(m, { carrera: "ING" }));
  assert.equal(r.ignoradas, 2);
  assert.deepEqual(r.asignaturas.map(a => a.codigo), ["3.1.1.24", "3.1.2.24"]);
  assert.equal(plano(D.interpretar(m)).asignaturas.length, 4);
});

test("sin cabeceras deduce las columnas por su contenido y conserva el texto", () => {
  const m = [["3.1.1.24", "Cálculo diferencial", "2024", "1", "3", "muchas", "DIMA"],
             ["3.1.2.24", "Programación básica", "2024", "1", "3", "2", "DIMA"]];
  const { asignaturas } = plano(D.interpretar(m));
  assert.equal(asignaturas[0].nombre, "Cálculo diferencial");
  assert.equal(asignaturas[0].dpto, "DIMA");
  assert.equal(asignaturas[0].grupos[0].hp, "muchas");
  const t = D.totales(asignaturas);
  assert.equal(t.ht, 6);
  assert.equal(t.hp, 2);
  assert.equal(t.asig, 2);
});

function planDePrueba() {
  const m = [CABECERA,
    ["ADM", "2024", "4", "1.4.1.24", "Ética", "1", "2", "2", "4", "DAHUC", ""],
    ["ICO", "2024", "4", "1.4.9.24", "Ética", "1", "3", "0", "3", "DAHUC", ""],
    ["ADM", "2024", "4", "1.4.2.24", "Finanzas", "1", "3", "2", "5", "DACTE", ""]];
  return D.interpretar(m).asignaturas;
}

test("deshacer una fusión devuelve a cada grupo sus horas", () => {
  const p = planDePrueba();
  const i = p.findIndex(a => a.codigo === "1.4.1.24"), j = p.findIndex(a => a.codigo === "1.4.9.24");
  const r = D.fusionar(p, [i + ":0", j + ":0"], i + ":0");
  assert.equal(r.difs.length, 1);
  assert.equal(p[j].grupos[0].ht, "2");
  assert.equal(p[j].grupos[0].hp, "2");
  assert.equal(D.totales(p).dictado, 4 + 5);
  D.deshacerFusion(p, r.marca);
  assert.equal(p[j].grupos[0].ht, "3");
  assert.equal(p[j].grupos[0].hp, "0");
  assert.equal(p[i].grupos[0].fusion, null);
  assert.equal(plano(p).some(a => a.grupos.some(g => "previas" in g)), false);
});

test("el aviso A05 compara las horas como números", () => {
  const p = planDePrueba();
  p[0].grupos[0].ht = 2;
  p[0].grupos.push({ id: "x", n: 2, ht: "2", hp: "2", desdoble: null, fusion: null });
  const r = D.fusionar(p, ["0:0", "0:1"], "0:0");
  assert.equal(r.difs.length, 0);
});

test("al disolverse una fusión por eliminación, el grupo restante recupera sus horas", () => {
  const p = planDePrueba();
  const i = p.findIndex(a => a.codigo === "1.4.1.24"), j = p.findIndex(a => a.codigo === "1.4.9.24");
  D.fusionar(p, [i + ":0", j + ":0"], i + ":0");
  D.eliminarGrupo(p, i, 0);
  const ico = p.find(a => a.codigo === "1.4.9.24");
  assert.equal(ico.grupos[0].fusion, null);
  assert.equal(ico.grupos[0].ht, "3");
});

test("un grupo que pasa a otra fusión disuelve la anterior si queda sola", () => {
  const p = planDePrueba();
  const f1 = D.fusionar(p, ["0:0", "1:0"], "0:0").marca;
  const f2 = D.fusionar(p, ["1:0", "2:0"], "2:0").marca;
  assert.equal(p[0].grupos[0].fusion, null);
  assert.equal(p[1].grupos[0].fusion, f2);
  assert.notEqual(f1, f2);
  D.deshacerFusion(p, f2);
  const horas = p.map(a => [a.codigo, a.grupos[0].ht, a.grupos[0].hp]);
  assert.deepEqual(plano(horas), [["1.4.1.24", "2", "2"], ["1.4.2.24", "3", "2"], ["1.4.9.24", "3", "0"]]);
});

test("desdoblar y quitar el desdoble", () => {
  const p = planDePrueba();
  D.desdoblar(p[0].grupos[0], "Práctica", 3);
  assert.equal(p[0].grupos[0].desdoble, "PRA×3");
  assert.equal(D.totales(p).des, 1);
  D.quitarDesdoble(p[0].grupos[0]);
  assert.equal(p[0].grupos[0].desdoble, null);
  assert.equal(D.totales(p).des, 0);
});

test("agregar asignatura con semestre-grupo, grupo y grupo a todo el semestre", () => {
  const p = planDePrueba();
  const a = D.agregarAsignatura(p, { sem: "4-2", malla: "2024", codigo: "1.4.3.24", nombre: "Marketing", ht: "3", hp: "2", dpto: "DACTE", obs: "" });
  assert.equal(a.sem, 4);
  assert.equal(a.grupos[0].n, 2);
  assert.equal(D.agregarGrupo(p, p.indexOf(a), 0), 3);
  assert.equal(D.agregarGrupoSemestre(p, 4), 4);
  assert.equal(D.totales(p).grupos, 3 + 2 + 4);
});

test("la firma del contenido ignora los identificadores de grupo", () => {
  const a = planDePrueba(), b = planDePrueba();
  assert.notEqual(a[0].grupos[0].id, b[0].grupos[0].id);
  assert.equal(D.hash(D.contenidoCanonico(a)), D.hash(D.contenidoCanonico(b)));
  b[0].grupos[0].ht = "9";
  assert.notEqual(D.hash(D.contenidoCanonico(a)), D.hash(D.contenidoCanonico(b)));
});

test("reconoce la carrera por sigla, nombre o alias de hoja", () => {
  assert.equal(D.siglaDeCarrera("Adm. Neg. Int."), "ADM");
  assert.equal(D.siglaDeCarrera("DER "), "DER");
  assert.equal(D.siglaDeCarrera("cs de la comunicacion"), "COM");
  assert.equal(D.siglaDeCarrera("Medicina"), null);
});

test("fuenteDominio_() recrea Dominio fuera de su archivo, como en el navegador", () => {
  const ctx = cargar(ARCHIVOS_DOMINIO);
  const fuente = ctx.fuenteDominio_();
  const dominio = vm.runInNewContext(fuente, {});
  assert.equal(dominio.nombreCarrera("ING"), "Ingeniería de Software");
  assert.equal(dominio.interpretar([["3.1.1.24", "Cálculo diferencial", "2024", "1", "3", "2", "DIMA"]]).asignaturas.length, 1);
});

test("isoPeru escribe la hora de Perú (UTC−5) en ISO 8601, y Date.parse la lee igual", () => {
  assert.equal(D.isoPeru("2026-10-15T16:01:11.000Z"), "2026-10-15T11:01:11-05:00");
  assert.equal(D.isoPeru("2026-10-16T02:30:00Z"), "2026-10-15T21:30:00-05:00", "después de las 19:00 en Perú sigue siendo el mismo día");
  assert.equal(D.isoPeru(Date.parse("2026-01-01T05:00:00Z")), "2026-01-01T00:00:00-05:00");
  assert.equal(D.isoPeru(new Date("2026-07-01T12:00:00Z")), "2026-07-01T07:00:00-05:00", "sin horario de verano");
  assert.equal(Date.parse(D.isoPeru("2026-10-15T16:01:11Z")), Date.parse("2026-10-15T16:01:11Z"));
  assert.match(D.isoPeru(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-05:00$/);
  assert.equal(D.isoPeru("no es fecha"), "no es fecha");
});

test("cada carrera pertenece a un departamento", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(D.DPTOS.map(d => [d, D.carrerasDeDpto(d)]))),
    [["DIMA", ["ING", "IND", "ARQ", "ICO"]], ["DAHUC", ["PSI", "COM"]], ["DACJ", ["DER"]], ["DACTE", ["ADM"]]]);
  assert.equal(D.dptoDeCarrera("ICO"), "DIMA");
  assert.equal(D.dptoDeCarrera("XXX"), "");
});
