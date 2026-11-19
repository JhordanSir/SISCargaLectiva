package pe.edu.ulasalle.siscarga.service;

/**
 * Se lanza cuando el valor enviado en el PUT no sirve (formato incorrecto, parámetro no editable…).
 * ManejadorErrores la convierte en una respuesta 400 con { "error": mensaje }.
 */
public class ValorInvalidoException extends RuntimeException {
    public ValorInvalidoException(String mensaje) {
        super(mensaje);
    }
}
