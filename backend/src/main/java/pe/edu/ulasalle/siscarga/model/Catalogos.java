package pe.edu.ulasalle.siscarga.model;

import java.util.List;

/**
 * Todos los catálogos juntos: es lo que devuelve GET /api/catalogos.
 * JSON: { "carreras": [...], "facultades": [...], "planesEstudio": [...], "lineasInvestigacion": [...] }
 */
public record Catalogos(List<Carrera> carreras,
                        List<Facultad> facultades,
                        List<PlanEstudio> planesEstudio,
                        List<LineaInvestigacion> lineasInvestigacion) {
}
