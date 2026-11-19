package pe.edu.ulasalle.siscarga;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Pruebas de los 4 endpoints y sus errores. MockMvc hace peticiones HTTP falsas sin abrir un puerto.
 * Corre con "mvn test" (y dentro de "docker build", que hace mvn package).
 * @DirtiesContext: cada prueba arranca con los datos iniciales (el PUT de una no afecta a otra).
 */
@SpringBootTest
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ApiTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void listaLosParametros() throws Exception {
        mvc.perform(get("/api/parametros"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(13)))
                .andExpect(jsonPath("$[1].clave").value("MAX_HORAS_DOCENTE"))
                .andExpect(jsonPath("$[1].valor").value("40"))
                .andExpect(jsonPath("$[1].tipo").value("ENTERO"))
                .andExpect(jsonPath("$[1].editable").value(true));
    }

    @Test
    void actualizaUnParametro() throws Exception {
        mvc.perform(put("/api/parametros/MAX_HORAS_DOCENTE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"valor\": \"42\", \"usuario\": \"director@ulasalle.edu.pe\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valor").value("42"))
                .andExpect(jsonPath("$.actualizadoPor").value("director@ulasalle.edu.pe"))
                .andExpect(jsonPath("$.fechaActualizacion").value(startsWith("20")));
    }

    @Test
    void rechazaValoresInvalidos() throws Exception {
        // ENTERO con letras
        mvc.perform(put("/api/parametros/MAX_HORAS_DOCENTE")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"cuarenta\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("MAX_HORAS_DOCENTE debe ser un número entero mayor o igual a 0."));
        // mínimo mayor que el máximo (40)
        mvc.perform(put("/api/parametros/MIN_HORAS_DOCENTE")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"50\"}"))
                .andExpect(status().isBadRequest());
        // ciclo con formato incorrecto
        mvc.perform(put("/api/parametros/CICLO_VIGENTE")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"2027-3\"}"))
                .andExpect(status().isBadRequest());
        // fecha que no existe
        mvc.perform(put("/api/parametros/FECHA_LIMITE_PLAN")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"2026-02-30\"}"))
                .andExpect(status().isBadRequest());
        // parámetro de solo lectura
        mvc.perform(put("/api/parametros/DOMINIO_PERMITIDO")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"@gmail.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("El parámetro DOMINIO_PERMITIDO es de solo lectura."));
    }

    @Test
    void claveInexistenteDa404() throws Exception {
        mvc.perform(put("/api/parametros/NO_EXISTE")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"valor\": \"1\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("No existe el parámetro NO_EXISTE."));
    }

    @Test
    void devuelveTodosLosCatalogos() throws Exception {
        mvc.perform(get("/api/catalogos"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.carreras", hasSize(8)))
                .andExpect(jsonPath("$.facultades", hasSize(4)))
                .andExpect(jsonPath("$.planesEstudio", hasSize(16)))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$.carreras[0].id").value("ING"));
    }

    @Test
    void devuelveUnCatalogoPorTipo() throws Exception {
        mvc.perform(get("/api/catalogos/facultades"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(4)))
                .andExpect(jsonPath("$[0].nombre").value("Facultad de Ingenierías y Arquitectura"));
        mvc.perform(get("/api/catalogos/cursos"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value(
                        "No existe el catálogo \"cursos\". Tipos válidos: carreras, facultades, planesEstudio."));
    }
}
