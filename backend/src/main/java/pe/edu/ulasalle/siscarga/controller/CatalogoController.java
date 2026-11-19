package pe.edu.ulasalle.siscarga.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.edu.ulasalle.siscarga.model.Catalogos;
import pe.edu.ulasalle.siscarga.service.CatalogoService;

import java.util.List;

/**
 * Endpoints de los catálogos de datos.
 *   GET /api/catalogos          → { carreras, facultades, planesEstudio, lineasInvestigacion }
 *   GET /api/catalogos/{tipo}   → solo la lista de ese tipo
 * ⬅ VIENE DE Apps Script (Parametros.js → paramCatalogos / paramCatalogo), Postman o Swagger.
 * ➡ SIGUE EN CatalogoService.
 */
@RestController
@RequestMapping("/api/catalogos")
@Tag(name = "Catálogos", description = "Carreras, facultades, planes de estudio y líneas de investigación")
public class CatalogoController {

    private final CatalogoService servicio;

    public CatalogoController(CatalogoService servicio) {
        this.servicio = servicio;
    }

    /** GET /api/catalogos → 200 con los cuatro catálogos. */
    @GetMapping
    @Operation(summary = "Devuelve todos los catálogos")
    public Catalogos todos() {
        return servicio.todos();
    }

    /** GET /api/catalogos/{tipo} → 200 con la lista · 404 si el tipo no existe. */
    @GetMapping("/{tipo}")
    @Operation(summary = "Devuelve un catálogo: carreras, facultades, planesEstudio o lineasInvestigacion")
    public List<?> porTipo(@PathVariable String tipo) {
        return servicio.porTipo(tipo);
    }
}
