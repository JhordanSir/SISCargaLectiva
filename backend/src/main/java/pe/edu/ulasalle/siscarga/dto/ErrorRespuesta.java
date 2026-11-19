package pe.edu.ulasalle.siscarga.dto;

/**
 * Cuerpo de toda respuesta con error (400 o 404).
 * JSON: { "error": "MAX_HORAS_DOCENTE debe ser un número entero mayor o igual a 0." }
 * Apps Script muestra este texto tal cual al usuario.
 */
public record ErrorRespuesta(String error) {
}
