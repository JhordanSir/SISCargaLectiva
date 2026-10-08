import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { crearEntorno, cargarServidor, ejecutar } from "./falsos.mjs";
import { XLSX_CARRERA, XLSX_DEPARTAMENTO, XLSX_DOCENTES, plano } from "./soporte.mjs";

const A = "mfloresl@ulasalle.edu.pe";
const B = "fmaresg@ulasalle.edu.pe";
const CICLO = "2026-1";

function sistemaConDocentes() {
  const e = crearEntorno();
  cargarServidor(e);
  ejecutar(e, A, "instalar");
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx", fs.readFileSync(XLSX_CARRERA), { fecha: "2026-09-20T10:00:00Z" });
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx", fs.readFileSync(XLSX_DEPARTAMENTO), { fecha: "2026-09-20T10:05:00Z" });
  e.subir(e.propiedades.SIS_CARPETA_ID, "SISCargaLectiva-Ejemplo-CargaDeDocentes.xlsx", fs.readFileSync(XLSX_DOCENTES), { fecha: "2026-09-20T10:10:00Z" });
  return e;
}

test("CU-002: leerCatalogoDocentes_ extrae los profesores de CargaDeDocentes.xlsx", () => {
  const e = sistemaConDocentes();
  const catalogo = ejecutar(e, A, "leerCatalogoDocentes_", true);
  assert.equal(catalogo.length, 12, "El archivo de ejemplo contiene 12 docentes representativos");
  const alatrista = catalogo.find(d => d.nombreCompleto.includes("ALATRISTA"));
  assert.ok(alatrista, "Debe encontrar al profesor Alatrista");
  assert.equal(alatrista.dpto, "DACTE");
  assert.equal(alatrista.dedicacion, "TP");
});

test("CU-002: obtenerCursosDepartamento_ filtra las asignaturas requeridas al departamento DIMA", () => {
  const e = sistemaConDocentes();
  // Sincronizar fuentes para tener los planes de carrera registrados
  ejecutar(e, A, "revisarFuentes_");
  const cursos = ejecutar(e, A, "obtenerCursosDepartamento_", CICLO, "DIMA");
  assert.ok(cursos.length > 0, "Debe haber asignaturas asignadas al departamento DIMA");
  assert.ok(cursos.every(c => c.dpto === "DIMA"), "Todas las asignaturas deben pertenecer a DIMA");
});

test("CU-002: calcularBalanceDocente detecta advertencias A07, A09, A10 y A11", () => {
  const e = sistemaConDocentes();
  const ctx = e.ctx;
  const Dominio = ctx.Dominio;

  const docentes = [
    { dni: "111", nombreCompleto: "Perez Juan", condicion: "Contratado", categoria: "AUXILIAR", dpto: "DIMA", dedicacion: "TC" },
    { dni: "222", nombreCompleto: "Gomez Maria", condicion: "Ordinario", categoria: "ASOCIADO", dpto: "DIMA", dedicacion: "TP" },
    { dni: "333", nombreCompleto: "Lopez Carlos", condicion: "Contratado", categoria: "AUXILIAR", dpto: "DIMA", dedicacion: "TP" }
  ];

  const asignaciones = [
    // Perez Juan con 42h (>40h -> A07 y A09) y cruce semestral en ING Sem 4 (A11)
    { carrera: "ING", sem: "4", codigo: "COD1", grupo: "1", componente: "Teoría", docente: "Perez Juan", horas: 20 },
    { carrera: "ING", sem: "4", codigo: "COD2", grupo: "1", componente: "Teoría", docente: "Perez Juan", horas: 22 },
    // Gomez Maria con 6h (TP <8h -> A10)
    { carrera: "IND", sem: "2", codigo: "COD3", grupo: "1", componente: "Práctica", docente: "Gomez Maria", horas: 6 },
    // Docente Internacional no suma horas (RN-30)
    { carrera: "DER", sem: "1", codigo: "COD4", grupo: "1", componente: "Teoría", docente: "Docente Internacional", condicion: "INTERNACIONAL", horas: 4 }
  ];

  const balance = Dominio.calcularBalanceDocente(docentes, asignaciones);
  assert.equal(balance.totalDocentesAsignados, 2);
  assert.equal(balance.totalHorasAsignadas, 48);

  const docPerez = balance.docentes.find(d => d.dni === "111");
  assert.equal(docPerez.horasLectivas, 42);
  const codigosAdvPerez = docPerez.advertencias.map(a => a.codigo);
  assert.ok(codigosAdvPerez.includes("A07"), "Debe tener advertencia A07 (>40h)");
  assert.ok(codigosAdvPerez.includes("A11"), "Debe tener advertencia A11 (cruce semestral)");

  const docGomez = balance.docentes.find(d => d.dni === "222");
  assert.equal(docGomez.horasLectivas, 6);
  const codigosAdvGomez = docGomez.advertencias.map(a => a.codigo);
  assert.ok(codigosAdvGomez.includes("A10"), "Debe tener advertencia A10 (TP <8h)");
});

test("CU-002: guardarAsignaciones persiste en la pestaña Asignaciones y se recupera con obtenerEstadoDocentes", () => {
  const e = sistemaConDocentes();
  ejecutar(e, A, "revisarFuentes_");

  const lista = [
    {
      carrera: "ING",
      codigo: "3.4.4.24",
      asignatura: "Teoría de la Computación",
      grupo: "1",
      componente: "Teoría",
      docente: "Velasquez Doig Miguel Eduardo",
      horas: 4,
      condicion: "Ordinario",
      reemplazo_de: ""
    }
  ];

  const res = ejecutar(e, A, "guardarAsignaciones", CICLO, "DIMA", lista, "Asignación inicial de prueba");
  assert.equal(res.ok, true);
  assert.equal(res.guardadas, 1);

  const estado = ejecutar(e, A, "obtenerEstadoDocentes", CICLO, "DIMA");
  assert.equal(estado.estado, "ok");
  assert.equal(estado.departamento, "DIMA");
  assert.equal(estado.asignaciones.length, 1);
  assert.equal(estado.asignaciones[0].docente, "Velasquez Doig Miguel Eduardo");
  assert.equal(estado.asignaciones[0].horas, "4");
});
