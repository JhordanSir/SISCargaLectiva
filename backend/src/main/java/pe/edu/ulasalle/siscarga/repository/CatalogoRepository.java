package pe.edu.ulasalle.siscarga.repository;

import org.springframework.stereotype.Repository;
import pe.edu.ulasalle.siscarga.model.Carrera;
import pe.edu.ulasalle.siscarga.model.Facultad;
import pe.edu.ulasalle.siscarga.model.LineaInvestigacion;
import pe.edu.ulasalle.siscarga.model.PlanEstudio;

import java.util.List;

/**
 * Los catálogos de la aplicación, escritos aquí a mano (no hay base de datos y no cambian).
 * Las carreras y sus departamentos son los mismos de la pestaña "Carreras" del Sheet de la app:
 *   DIMA → ING, IND, ARQ, ICO · DACTE → ADM · DACJ → DER · DAHUC → COM, PSI
 * List.of(...) crea listas que no se pueden modificar.
 */
@Repository
public class CatalogoRepository {

    private final List<Facultad> facultades = List.of(
            new Facultad("FIA", "FIA", "Facultad de Ingenierías y Arquitectura", "DIMA"),
            new Facultad("FCE", "FCE", "Facultad de Ciencias Empresariales", "DACTE"),
            new Facultad("FDE", "FDE", "Facultad de Derecho", "DACJ"),
            new Facultad("FHU", "FHU", "Facultad de Humanidades", "DAHUC")
    );

    private final List<Carrera> carreras = List.of(
            new Carrera("ING", "Ingeniería de Software", "FIA", "DIMA", 10),
            new Carrera("IND", "Ingeniería Industrial", "FIA", "DIMA", 10),
            new Carrera("ARQ", "Arquitectura", "FIA", "DIMA", 10),
            new Carrera("ICO", "Ingeniería Comercial", "FIA", "DIMA", 10),
            new Carrera("ADM", "Administración de Negocios Internacionales", "FCE", "DACTE", 10),
            new Carrera("DER", "Derecho", "FDE", "DACJ", 12),
            new Carrera("COM", "Ciencias de la Comunicación", "FHU", "DAHUC", 10),
            new Carrera("PSI", "Psicología", "FHU", "DAHUC", 10)
    );

    /** Dos planes por carrera: el de 2018 (ya no vigente) y el de 2023 (vigente). */
    private final List<PlanEstudio> planesEstudio = List.of(
            new PlanEstudio("ING-2018", "ING", "Plan de estudios 2018 · Ingeniería de Software", 2018, false, 210, 10),
            new PlanEstudio("ING-2023", "ING", "Plan de estudios 2023 · Ingeniería de Software", 2023, true, 220, 10),
            new PlanEstudio("IND-2018", "IND", "Plan de estudios 2018 · Ingeniería Industrial", 2018, false, 210, 10),
            new PlanEstudio("IND-2023", "IND", "Plan de estudios 2023 · Ingeniería Industrial", 2023, true, 218, 10),
            new PlanEstudio("ARQ-2018", "ARQ", "Plan de estudios 2018 · Arquitectura", 2018, false, 214, 10),
            new PlanEstudio("ARQ-2023", "ARQ", "Plan de estudios 2023 · Arquitectura", 2023, true, 224, 10),
            new PlanEstudio("ICO-2018", "ICO", "Plan de estudios 2018 · Ingeniería Comercial", 2018, false, 208, 10),
            new PlanEstudio("ICO-2023", "ICO", "Plan de estudios 2023 · Ingeniería Comercial", 2023, true, 216, 10),
            new PlanEstudio("ADM-2018", "ADM", "Plan de estudios 2018 · Administración de Negocios Internacionales", 2018, false, 206, 10),
            new PlanEstudio("ADM-2023", "ADM", "Plan de estudios 2023 · Administración de Negocios Internacionales", 2023, true, 212, 10),
            new PlanEstudio("DER-2018", "DER", "Plan de estudios 2018 · Derecho", 2018, false, 236, 12),
            new PlanEstudio("DER-2023", "DER", "Plan de estudios 2023 · Derecho", 2023, true, 244, 12),
            new PlanEstudio("COM-2018", "COM", "Plan de estudios 2018 · Ciencias de la Comunicación", 2018, false, 204, 10),
            new PlanEstudio("COM-2023", "COM", "Plan de estudios 2023 · Ciencias de la Comunicación", 2023, true, 210, 10),
            new PlanEstudio("PSI-2018", "PSI", "Plan de estudios 2018 · Psicología", 2018, false, 212, 10),
            new PlanEstudio("PSI-2023", "PSI", "Plan de estudios 2023 · Psicología", 2023, true, 220, 10)
    );

    /** Dos líneas de investigación por carrera. */
    private final List<LineaInvestigacion> lineasInvestigacion = List.of(
            new LineaInvestigacion("LI-ING-01", "ING", "Ingeniería de software y calidad",
                    "Procesos de desarrollo, pruebas y mantenimiento de software."),
            new LineaInvestigacion("LI-ING-02", "ING", "Inteligencia artificial y ciencia de datos",
                    "Aprendizaje automático, análisis de datos y sistemas inteligentes."),
            new LineaInvestigacion("LI-IND-01", "IND", "Gestión de operaciones y logística",
                    "Optimización de procesos productivos y cadenas de suministro."),
            new LineaInvestigacion("LI-IND-02", "IND", "Seguridad y salud en el trabajo",
                    "Prevención de riesgos y ergonomía en entornos industriales."),
            new LineaInvestigacion("LI-ARQ-01", "ARQ", "Urbanismo y ciudad sostenible",
                    "Planificación urbana y espacio público en ciudades intermedias."),
            new LineaInvestigacion("LI-ARQ-02", "ARQ", "Patrimonio y arquitectura en sillar",
                    "Conservación y puesta en valor del patrimonio edificado de Arequipa."),
            new LineaInvestigacion("LI-ICO-01", "ICO", "Marketing y comportamiento del consumidor",
                    "Estrategias comerciales y decisiones de compra."),
            new LineaInvestigacion("LI-ICO-02", "ICO", "Comercio electrónico",
                    "Modelos de negocio digitales y canales de venta en línea."),
            new LineaInvestigacion("LI-ADM-01", "ADM", "Comercio exterior y negocios internacionales",
                    "Exportaciones, acuerdos comerciales y mercados internacionales."),
            new LineaInvestigacion("LI-ADM-02", "ADM", "Emprendimiento e innovación",
                    "Creación y crecimiento de empresas en la región sur."),
            new LineaInvestigacion("LI-DER-01", "DER", "Derecho constitucional y derechos humanos",
                    "Garantías constitucionales y protección de derechos fundamentales."),
            new LineaInvestigacion("LI-DER-02", "DER", "Derecho empresarial",
                    "Regulación de sociedades, contratos y competencia."),
            new LineaInvestigacion("LI-COM-01", "COM", "Comunicación digital y medios",
                    "Redes sociales, periodismo digital y audiencias."),
            new LineaInvestigacion("LI-COM-02", "COM", "Comunicación organizacional",
                    "Comunicación interna, imagen institucional y relaciones públicas."),
            new LineaInvestigacion("LI-PSI-01", "PSI", "Psicología clínica y de la salud",
                    "Evaluación, prevención e intervención en salud mental."),
            new LineaInvestigacion("LI-PSI-02", "PSI", "Psicología educativa",
                    "Aprendizaje, desarrollo y convivencia en la escuela.")
    );

    public List<Facultad> findFacultades() { return facultades; }

    public List<Carrera> findCarreras() { return carreras; }

    public List<PlanEstudio> findPlanesEstudio() { return planesEstudio; }

    public List<LineaInvestigacion> findLineasInvestigacion() { return lineasInvestigacion; }
}
