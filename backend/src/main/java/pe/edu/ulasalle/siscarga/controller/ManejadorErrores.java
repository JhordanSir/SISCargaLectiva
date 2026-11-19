package pe.edu.ulasalle.siscarga.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import pe.edu.ulasalle.siscarga.dto.ErrorRespuesta;
import pe.edu.ulasalle.siscarga.service.NoEncontradoException;
import pe.edu.ulasalle.siscarga.service.ValorInvalidoException;

/**
 * Convierte los errores de los servicios en respuestas HTTP con { "error": "mensaje" }.
 * Así ningún controlador necesita try/catch: el servicio lanza la excepción y Spring la trae aquí.
 */
@RestControllerAdvice
public class ManejadorErrores {

    /** Lo pedido no existe (clave de parámetro o tipo de catálogo) → 404. */
    @ExceptionHandler(NoEncontradoException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorRespuesta noEncontrado(NoEncontradoException e) {
        return new ErrorRespuesta(e.getMessage());
    }

    /** El valor del PUT no sirve → 400. */
    @ExceptionHandler(ValorInvalidoException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorRespuesta valorInvalido(ValorInvalidoException e) {
        return new ErrorRespuesta(e.getMessage());
    }

    /** El cuerpo del PUT no es JSON (o falta) → 400. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorRespuesta cuerpoIlegible(HttpMessageNotReadableException e) {
        return new ErrorRespuesta("El cuerpo debe ser un JSON como { \"valor\": \"42\", \"usuario\": \"correo\" }.");
    }
}
