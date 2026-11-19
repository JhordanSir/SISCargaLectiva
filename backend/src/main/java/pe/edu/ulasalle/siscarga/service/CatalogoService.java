package pe.edu.ulasalle.siscarga.service;

import org.springframework.stereotype.Service;
import pe.edu.ulasalle.siscarga.model.Catalogos;
import pe.edu.ulasalle.siscarga.repository.CatalogoRepository;

import java.util.List;

/**
 * Reglas de los catálogos: juntarlos todos o elegir uno por su nombre.
 * ⬅ VIENE DE CatalogoController · ➡ SIGUE EN CatalogoRepository (las listas fijas).
 */
@Service
public class CatalogoService {

    /** Los nombres que acepta GET /api/catalogos/{tipo}. */
    public static final String TIPOS_VALIDOS = "carreras, facultades, planesEstudio";

    private final CatalogoRepository repositorio;

    public CatalogoService(CatalogoRepository repositorio) {
        this.repositorio = repositorio;
    }

    /** GET /api/catalogos: los tres catálogos en un solo objeto. */
    public Catalogos todos() {
        return new Catalogos(
                repositorio.findCarreras(),
                repositorio.findFacultades(),
                repositorio.findPlanesEstudio());
    }

    /**
     * GET /api/catalogos/{tipo}: solo la lista de ese tipo. Un tipo desconocido → 404.
     * Devuelve List<?> porque cada catálogo es una lista de una clase distinta.
     */
    public List<?> porTipo(String tipo) {
        return switch (tipo) {
            case "carreras" -> repositorio.findCarreras();
            case "facultades" -> repositorio.findFacultades();
            case "planesEstudio" -> repositorio.findPlanesEstudio();
            default -> throw new NoEncontradoException(
                    "No existe el catálogo \"" + tipo + "\". Tipos válidos: " + TIPOS_VALIDOS + ".");
        };
    }
}
