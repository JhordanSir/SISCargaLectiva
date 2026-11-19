package pe.edu.ulasalle.siscarga.model;

/**
 * Elemento del catálogo de planes de estudio (cada carrera tiene un plan antiguo y uno vigente).
 * Ejemplo JSON: { "id": "ING-2023", "carreraId": "ING", "nombre": "Plan de estudios 2023 · Ingeniería de Software",
 *                 "anio": 2023, "vigente": true, "creditosTotales": 220, "cantidadSemestres": 10 }
 */
public record PlanEstudio(String id, String carreraId, String nombre, int anio, boolean vigente,
                          int creditosTotales, int cantidadSemestres) {
}
