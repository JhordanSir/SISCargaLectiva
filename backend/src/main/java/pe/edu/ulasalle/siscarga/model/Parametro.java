package pe.edu.ulasalle.siscarga.model;

/**
 * Un parámetro del sistema, por ejemplo MAX_HORAS_DOCENTE = 40.
 * Así se ve en el JSON que devuelve GET /api/parametros:
 * {
 *   "clave": "MAX_HORAS_DOCENTE", "valor": "40", "tipo": "ENTERO", "unidad": "horas",
 *   "grupo": "HORAS", "descripcion": "…", "editable": true,
 *   "actualizadoPor": "sistema", "fechaActualizacion": "2026-11-01T08:00:00-05:00"
 * }
 * Es una clase con getters y setters (no un record) porque el PUT cambia valor, actualizadoPor y fecha.
 */
public class Parametro {

    /** Nombre único, en MAYÚSCULAS: MIN_HORAS_DOCENTE, CICLO_VIGENTE… */
    private String clave;
    /** El valor siempre viaja como texto; "tipo" dice cómo leerlo. */
    private String valor;
    /** ENTERO, FECHA (AAAA-MM-DD), CICLO (2026-2) o TEXTO. */
    private String tipo;
    /** horas, minutos, caracteres… o vacío. */
    private String unidad;
    /** HORAS, CICLO o SISTEMA: para agrupar en la pantalla. */
    private String grupo;
    private String descripcion;
    /** false = solo lectura (el PUT responde 400). */
    private boolean editable;
    /** Correo de quien lo cambió por última vez ("sistema" si nunca se cambió). */
    private String actualizadoPor;
    /** Fecha y hora de Perú del último cambio. */
    private String fechaActualizacion;

    public Parametro(String clave, String valor, String tipo, String unidad, String grupo,
                     String descripcion, boolean editable, String actualizadoPor, String fechaActualizacion) {
        this.clave = clave;
        this.valor = valor;
        this.tipo = tipo;
        this.unidad = unidad;
        this.grupo = grupo;
        this.descripcion = descripcion;
        this.editable = editable;
        this.actualizadoPor = actualizadoPor;
        this.fechaActualizacion = fechaActualizacion;
    }

    public String getClave() { return clave; }
    public void setClave(String clave) { this.clave = clave; }

    public String getValor() { return valor; }
    public void setValor(String valor) { this.valor = valor; }

    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }

    public String getUnidad() { return unidad; }
    public void setUnidad(String unidad) { this.unidad = unidad; }

    public String getGrupo() { return grupo; }
    public void setGrupo(String grupo) { this.grupo = grupo; }

    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }

    public boolean isEditable() { return editable; }
    public void setEditable(boolean editable) { this.editable = editable; }

    public String getActualizadoPor() { return actualizadoPor; }
    public void setActualizadoPor(String actualizadoPor) { this.actualizadoPor = actualizadoPor; }

    public String getFechaActualizacion() { return fechaActualizacion; }
    public void setFechaActualizacion(String fechaActualizacion) { this.fechaActualizacion = fechaActualizacion; }
}
