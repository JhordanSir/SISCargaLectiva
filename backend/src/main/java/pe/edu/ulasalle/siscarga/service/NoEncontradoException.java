package pe.edu.ulasalle.siscarga.service;

/**
 * Se lanza cuando lo pedido no existe (una clave de parámetro o un tipo de catálogo).
 * ManejadorErrores la convierte en una respuesta 404 con { "error": mensaje }.
 */
public class NoEncontradoException extends RuntimeException {
    public NoEncontradoException(String mensaje) {
        super(mensaje);
    }
}
