package pe.edu.ulasalle.siscarga.repository;

import org.springframework.stereotype.Repository;
import pe.edu.ulasalle.siscarga.model.Parametro;

import java.util.ArrayList;
import java.util.List;

/**
 * Dónde viven los parámetros del sistema: una lista en memoria (no hay base de datos).
 * La lista se llena al arrancar el servidor (en el constructor). Si alguien cambia un valor con el PUT,
 * el cambio dura hasta que se reinicie el contenedor; al reiniciar vuelven estos valores.
 *
 * @Repository le dice a Spring: crea UN objeto de esta clase y pásalo a quien lo pida (ParametroService).
 */
@Repository
public class ParametroRepository {

    /** Fecha de los valores iniciales (hora de Perú). */
    private static final String FECHA_INICIAL = "2026-11-01T08:00:00-05:00";

    private final List<Parametro> parametros = new ArrayList<>();

    public ParametroRepository() {
        // ---------- Grupo HORAS: límites de horas lectivas de un docente (reglas de CU-002) ----------
        agregar("MIN_HORAS_DOCENTE", "8", "ENTERO", "horas", "HORAS",
                "Mínima cantidad de horas lectivas que debe dictar un docente en el ciclo.", true);
        agregar("MAX_HORAS_DOCENTE", "40", "ENTERO", "horas", "HORAS",
                "Máxima cantidad de horas lectivas que puede dictar un docente (regla A07: más de esto impide guardar).", true);
        agregar("MAX_HORAS_ORDINARIO", "24", "ENTERO", "horas", "HORAS",
                "Horas a partir de las cuales se advierte que un docente ordinario tiene demasiada carga (regla A09).", true);
        agregar("MAX_HORAS_CON_CARGO", "24", "ENTERO", "horas", "HORAS",
                "Horas máximas de un docente con cargo; por encima se exige un motivo (regla A12).", true);
        agregar("AVISO_HORAS_CON_CARGO", "20", "ENTERO", "horas", "HORAS",
                "Horas a partir de las cuales se avisa que un docente con cargo se acerca al máximo (regla A12).", true);

        // ---------- Grupo CICLO: ciclo académico actual y plazos de los dos casos de uso ----------
        agregar("CICLO_VIGENTE", "2026-2", "CICLO", "", "CICLO",
                "Ciclo académico actual (formato AAAA-1 o AAAA-2).", true);
        agregar("FECHA_INICIO_CICLO", "2026-08-17", "FECHA", "", "CICLO",
                "Fecha de inicio de clases del ciclo vigente.", true);
        agregar("FECHA_LIMITE_PLAN", "2026-07-10", "FECHA", "", "CICLO",
                "Último día para que el Coordinador registre el plan de ciclo (CU-001).", true);
        agregar("FECHA_LIMITE_CARGA", "2026-07-31", "FECHA", "", "CICLO",
                "Último día para que el Director asigne docentes al plan de ciclo (CU-002).", true);

        // ---------- Grupo SISTEMA: funcionamiento de la aplicación ----------
        agregar("MINUTOS_BLOQUEO", "30", "ENTERO", "minutos", "SISTEMA",
                "Minutos sin actividad tras los que vence el bloqueo de edición de una carrera.", true);
        agregar("NOMBRE_INSTITUCION", "Universidad La Salle", "TEXTO", "", "SISTEMA",
                "Nombre de la institución que se muestra en la aplicación.", true);
        agregar("DOMINIO_PERMITIDO", "@ulasalle.edu.pe", "TEXTO", "", "SISTEMA",
                "Dominio de las cuentas de Google que pueden entrar a la aplicación.", false);
        agregar("MAX_CARACTERES_CELDA", "50000", "ENTERO", "caracteres", "SISTEMA",
                "Límite de Google Sheets para una celda: cada versión de un plan o carga debe caber en él.", false);
    }

    /** Atajo para no repetir "sistema" y la fecha inicial en cada parámetro. */
    private void agregar(String clave, String valor, String tipo, String unidad, String grupo,
                         String descripcion, boolean editable) {
        parametros.add(new Parametro(clave, valor, tipo, unidad, grupo, descripcion, editable, "sistema", FECHA_INICIAL));
    }

    /** Todos los parámetros, en el orden en que se agregaron (ya van agrupados). */
    public List<Parametro> findAll() {
        return parametros;
    }

    /** El parámetro con esa clave, o null si no existe. */
    public Parametro findByClave(String clave) {
        for (Parametro p : parametros) {
            if (p.getClave().equals(clave)) {
                return p;
            }
        }
        return null;
    }
}
