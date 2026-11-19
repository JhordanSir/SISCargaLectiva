package pe.edu.ulasalle.siscarga;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Punto de entrada del backend. Al correr main, Spring Boot levanta el servidor web
 * y busca las clases marcadas con @RestController, @Service y @Repository en este paquete.
 *
 * Capas (cada petición baja y sube por ellas):
 *   controller  → recibe la petición HTTP y devuelve JSON
 *   service     → reglas (validar el valor de un parámetro, elegir un catálogo)
 *   repository  → los datos, guardados en listas en memoria (no hay base de datos)
 *   model / dto → las clases que viajan como JSON
 */
@SpringBootApplication
public class SisCargaApplication {
    public static void main(String[] args) {
        SpringApplication.run(SisCargaApplication.class, args);
    }
}
