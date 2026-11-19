package pe.edu.ulasalle.siscarga.model;

/**
 * Elemento del catálogo de carreras. El id es la sigla que usa la app (ING, ICO, DER…).
 * Ejemplo JSON: { "id": "ING", "nombre": "Ingeniería de Software", "facultadId": "FIA",
 *                 "departamento": "DIMA", "duracionSemestres": 10 }
 */
public record Carrera(String id, String nombre, String facultadId, String departamento, int duracionSemestres) {
}
