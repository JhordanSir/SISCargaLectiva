package pe.edu.ulasalle.siscarga.model;

/**
 * Elemento del catálogo de líneas de investigación (dos por carrera).
 * Ejemplo JSON: { "id": "LI-ING-01", "carreraId": "ING", "nombre": "Ingeniería de software y calidad",
 *                 "descripcion": "…" }
 */
public record LineaInvestigacion(String id, String carreraId, String nombre, String descripcion) {
}
