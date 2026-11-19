package pe.edu.ulasalle.siscarga.service;

import org.springframework.stereotype.Service;
import pe.edu.ulasalle.siscarga.dto.ActualizarParametroRequest;
import pe.edu.ulasalle.siscarga.model.Parametro;
import pe.edu.ulasalle.siscarga.repository.ParametroRepository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Reglas de los parámetros del sistema.
 * ⬅ VIENE DE ParametroController · ➡ SIGUE EN ParametroRepository (los datos en memoria).
 */
@Service
public class ParametroService {

    private static final ZoneId PERU = ZoneId.of("America/Lima");
    private static final DateTimeFormatter FORMATO_FECHA_HORA = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

    private final ParametroRepository repositorio;

    /** Spring pasa aquí el ParametroRepository que creó al arrancar (inyección por constructor). */
    public ParametroService(ParametroRepository repositorio) {
        this.repositorio = repositorio;
    }

    /** GET /api/parametros: todos los parámetros. */
    public List<Parametro> listar() {
        return repositorio.findAll();
    }

    /**
     * PUT /api/parametros/{clave}: cambia el valor de un parámetro, después de validarlo.
     * "synchronized" = si llegan dos PUT a la vez, se atienden uno detrás de otro.
     */
    public synchronized Parametro actualizar(String clave, ActualizarParametroRequest pedido) {
        // PASO 1 · ¿Existe el parámetro? Si no → 404.
        Parametro parametro = repositorio.findByClave(clave);
        if (parametro == null) {
            throw new NoEncontradoException("No existe el parámetro " + clave + ".");
        }

        // PASO 2 · ¿Se puede cambiar? Algunos son solo de lectura (DOMINIO_PERMITIDO, MAX_CARACTERES_CELDA) → 400.
        if (!parametro.isEditable()) {
            throw new ValorInvalidoException("El parámetro " + clave + " es de solo lectura.");
        }

        // PASO 3 · ¿Llegó un valor? Se quitan los espacios de los extremos.
        String valor = (pedido == null || pedido.valor() == null) ? "" : pedido.valor().trim();
        if (valor.isEmpty()) {
            throw new ValorInvalidoException("Falta el valor de " + clave + ".");
        }

        // PASO 4 · ¿El valor tiene el formato de su tipo?
        switch (parametro.getTipo()) {
            case "ENTERO" -> {
                int numero;
                try {
                    numero = Integer.parseInt(valor);
                } catch (NumberFormatException e) {
                    throw new ValorInvalidoException(clave + " debe ser un número entero mayor o igual a 0.");
                }
                if (numero < 0) {
                    throw new ValorInvalidoException(clave + " debe ser un número entero mayor o igual a 0.");
                }
                valor = String.valueOf(numero); // "08" se guarda como "8"
            }
            case "FECHA" -> {
                try {
                    LocalDate.parse(valor); // exige AAAA-MM-DD y una fecha que exista
                } catch (DateTimeParseException e) {
                    throw new ValorInvalidoException(clave + " debe ser una fecha válida con formato AAAA-MM-DD.");
                }
            }
            case "CICLO" -> {
                if (!valor.matches("^\\d{4}-[12]$")) {
                    throw new ValorInvalidoException(clave + " debe tener el formato AAAA-1 o AAAA-2 (por ejemplo 2027-1).");
                }
            }
            default -> {
                // TEXTO: basta con que no esté vacío (ya se comprobó en el PASO 3).
            }
        }

        // PASO 5 · Las horas mínimas no pueden pasar a las máximas (se revisa en los dos sentidos).
        if (clave.equals("MIN_HORAS_DOCENTE")) {
            int maximo = Integer.parseInt(repositorio.findByClave("MAX_HORAS_DOCENTE").getValor());
            if (Integer.parseInt(valor) > maximo) {
                throw new ValorInvalidoException("MIN_HORAS_DOCENTE no puede ser mayor que MAX_HORAS_DOCENTE (" + maximo + ").");
            }
        }
        if (clave.equals("MAX_HORAS_DOCENTE")) {
            int minimo = Integer.parseInt(repositorio.findByClave("MIN_HORAS_DOCENTE").getValor());
            if (Integer.parseInt(valor) < minimo) {
                throw new ValorInvalidoException("MAX_HORAS_DOCENTE no puede ser menor que MIN_HORAS_DOCENTE (" + minimo + ").");
            }
        }

        // PASO 6 · Se guarda el cambio, con quién lo hizo y cuándo (hora de Perú).
        String usuario = (pedido.usuario() == null || pedido.usuario().isBlank()) ? "desconocido" : pedido.usuario().trim();
        parametro.setValor(valor);
        parametro.setActualizadoPor(usuario);
        parametro.setFechaActualizacion(OffsetDateTime.now(PERU).format(FORMATO_FECHA_HORA));
        return parametro;
    }
}
