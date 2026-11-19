package pe.edu.ulasalle.siscarga.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.ulasalle.siscarga.dto.ActualizarParametroRequest;
import pe.edu.ulasalle.siscarga.model.Parametro;
import pe.edu.ulasalle.siscarga.service.ParametroService;

import java.util.List;

/**
 * Endpoints de los parámetros del sistema.
 *   GET /api/parametros           → lista de todos los parámetros
 *   PUT /api/parametros/{clave}   → cambia el valor de uno
 * ⬅ VIENE DE Apps Script (Parametros.js → paramConsultar / paramActualizar), Postman o Swagger.
 * ➡ SIGUE EN ParametroService. Si el servicio lanza un error, ManejadorErrores arma la respuesta 400/404.
 */
@RestController
@RequestMapping("/api/parametros")
@Tag(name = "Parámetros", description = "Parámetros del sistema: horas docentes, ciclo y plazos, sistema")
public class ParametroController {

    private final ParametroService servicio;

    public ParametroController(ParametroService servicio) {
        this.servicio = servicio;
    }

    /** GET /api/parametros → 200 con la lista (Spring la convierte a JSON sola). */
    @GetMapping
    @Operation(summary = "Lista todos los parámetros del sistema")
    public List<Parametro> listar() {
        return servicio.listar();
    }

    /**
     * PUT /api/parametros/{clave} con cuerpo { "valor": "42", "usuario": "correo" }
     * → 200 con el parámetro ya cambiado · 400 valor inválido o solo lectura · 404 clave inexistente.
     */
    @PutMapping("/{clave}")
    @Operation(summary = "Actualiza el valor de un parámetro")
    public Parametro actualizar(@PathVariable String clave, @RequestBody ActualizarParametroRequest pedido) {
        return servicio.actualizar(clave, pedido);
    }
}
