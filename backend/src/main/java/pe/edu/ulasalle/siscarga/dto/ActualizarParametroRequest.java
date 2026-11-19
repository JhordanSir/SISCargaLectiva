package pe.edu.ulasalle.siscarga.dto;

/**
 * Cuerpo que llega en PUT /api/parametros/{clave}.
 * JSON: { "valor": "42", "usuario": "director@ulasalle.edu.pe" }
 * "usuario" es el correo de quien hace el cambio (lo manda Apps Script); si no llega, se guarda "desconocido".
 */
public record ActualizarParametroRequest(String valor, String usuario) {
}
