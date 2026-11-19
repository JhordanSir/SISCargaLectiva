package pe.edu.ulasalle.siscarga.model;

/**
 * Elemento del catálogo de facultades.
 * Ejemplo JSON: { "id": "FIA", "sigla": "FIA", "nombre": "Facultad de Ingenierías y Arquitectura", "departamento": "DIMA" }
 * "departamento" es el departamento académico que agrupa sus carreras (como en la pestaña Carreras del Sheet).
 * Un record de Java es una clase de solo lectura: el constructor, los getters, equals y toString se crean solos.
 */
public record Facultad(String id, String sigla, String nombre, String departamento) {
}
