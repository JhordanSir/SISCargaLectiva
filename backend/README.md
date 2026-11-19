# SISCargaLectiva · backend REST (Spring Boot)

Servicios REST que consume la aplicación de Apps Script de SISCargaLectiva: **parámetros del sistema** (consulta y actualización) y **catálogos de datos** (carreras, facultades, planes de estudio y líneas de investigación). No hay base de datos: los datos son listas fijas en memoria, y un cambio hecho con el `PUT` dura hasta que se reinicia el contenedor.

Java 21 · Spring Boot 3.3.5 · Maven · Swagger UI (springdoc).

## Endpoints

| Método | Ruta | Qué hace | Respuestas |
|---|---|---|---|
| GET | `/api/parametros` | Lista los 13 parámetros | 200 |
| PUT | `/api/parametros/{clave}` | Cambia el valor de uno. Cuerpo: `{ "valor": "42", "usuario": "correo" }` | 200 parámetro actualizado · 400 valor inválido o solo lectura · 404 clave inexistente |
| GET | `/api/catalogos` | Los cuatro catálogos juntos | 200 |
| GET | `/api/catalogos/{tipo}` | Un catálogo: `carreras`, `facultades`, `planesEstudio`, `lineasInvestigacion` | 200 · 404 tipo inexistente |

Los errores llegan como `{ "error": "mensaje" }`.

### Parámetros

Cada parámetro tiene `clave`, `valor` (siempre texto), `tipo`, `unidad`, `grupo`, `descripcion`, `editable`, `actualizadoPor` y `fechaActualizacion` (hora de Perú).

| Grupo | Clave | Valor inicial | Tipo | Editable |
|---|---|---|---|---|
| HORAS | `MIN_HORAS_DOCENTE` | 8 | ENTERO | sí |
| HORAS | `MAX_HORAS_DOCENTE` | 40 (regla A07) | ENTERO | sí |
| HORAS | `MAX_HORAS_ORDINARIO` | 24 (regla A09) | ENTERO | sí |
| HORAS | `MAX_HORAS_CON_CARGO` | 24 (regla A12) | ENTERO | sí |
| HORAS | `AVISO_HORAS_CON_CARGO` | 20 (regla A12) | ENTERO | sí |
| CICLO | `CICLO_VIGENTE` | 2026-2 | CICLO | sí |
| CICLO | `FECHA_INICIO_CICLO` | 2026-08-17 | FECHA | sí |
| CICLO | `FECHA_LIMITE_PLAN` | 2026-07-10 | FECHA | sí |
| CICLO | `FECHA_LIMITE_CARGA` | 2026-07-31 | FECHA | sí |
| SISTEMA | `MINUTOS_BLOQUEO` | 30 | ENTERO | sí |
| SISTEMA | `NOMBRE_INSTITUCION` | Universidad La Salle | TEXTO | sí |
| SISTEMA | `DOMINIO_PERMITIDO` | @ulasalle.edu.pe | TEXTO | no |
| SISTEMA | `MAX_CARACTERES_CELDA` | 50000 | ENTERO | no |

Validación del `PUT`: ENTERO = entero ≥ 0; FECHA = `AAAA-MM-DD` que exista; CICLO = `AAAA-1` o `AAAA-2`; TEXTO no vacío; `MIN_HORAS_DOCENTE` no puede pasar a `MAX_HORAS_DOCENTE` (ni al revés); un parámetro no editable responde 400.

### Catálogos

| Tipo | Campos | Elementos |
|---|---|---|
| `carreras` | `id` (sigla), `nombre`, `facultadId`, `departamento`, `duracionSemestres` | 8: ING, IND, ARQ, ICO, ADM, DER, COM, PSI (las de la pestaña Carreras) |
| `facultades` | `id`, `sigla`, `nombre`, `departamento` | 4: FIA, FCE, FDE, FHU |
| `planesEstudio` | `id`, `carreraId`, `nombre`, `anio`, `vigente`, `creditosTotales`, `cantidadSemestres` | 16: 2018 y 2023 por carrera |
| `lineasInvestigacion` | `id`, `carreraId`, `nombre`, `descripcion` | 16: dos por carrera |

## Probar

- **Swagger UI:** `<BASE_URL>/swagger-ui.html` (el JSON de OpenAPI en `/v3/api-docs`).
- **Postman:** importar [endpoints.json](endpoints.json) y cambiar la variable `baseUrl`.
- **curl:**

```bash
curl http://localhost:8080/api/parametros
```

```bash
curl -X PUT http://localhost:8080/api/parametros/MAX_HORAS_DOCENTE -H "Content-Type: application/json" -d "{\"valor\":\"42\",\"usuario\":\"director@ulasalle.edu.pe\"}"
```

```bash
curl http://localhost:8080/api/catalogos
```

```bash
curl http://localhost:8080/api/catalogos/carreras
```

## Construir y correr

Con Docker (compila y corre las pruebas dentro de la imagen; no hace falta Java ni Maven locales), desde esta carpeta:

```bash
docker build -t siscarga-api .
```

```bash
docker run --rm -p 8080:8080 siscarga-api
```

Con Java 21 y Maven instalados: `mvn test` para las pruebas y `mvn spring-boot:run` para levantarlo en el puerto 8080.

**Dokploy:** aplicación con build type Dockerfile, ruta del Dockerfile `backend/Dockerfile` y contexto `backend`; el contenedor escucha en el puerto **8080** (o en `PORT` si se define). Al dominio se le asigna ese puerto, con HTTPS.

## Código

Capas clásicas; cada petición baja y sube por ellas:

```
src/main/java/pe/edu/ulasalle/siscarga/
  SisCargaApplication.java   arranque
  controller/   ParametroController, CatalogoController (rutas HTTP) · ManejadorErrores (excepción → 400/404)
  service/      ParametroService (validación del PUT) · CatalogoService · NoEncontradoException · ValorInvalidoException
  repository/   ParametroRepository, CatalogoRepository (los datos en listas en memoria)
  model/        Parametro, Carrera, Facultad, PlanEstudio, LineaInvestigacion, Catalogos
  dto/          ActualizarParametroRequest (cuerpo del PUT) · ErrorRespuesta ({ "error" })
src/test/java/.../ApiTest.java   pruebas de los 4 endpoints y sus errores (MockMvc)
```

## Quién lo usa

La vista "Parámetros" de la app de Apps Script (`AppScript/Parametros.js`) hace las 4 llamadas con `UrlFetchApp`: al abrir la vista trae parámetros y catálogos, el botón "Guardar" de cada parámetro hace el `PUT` (solo el director) y el desplegable de catálogos pide uno por tipo. La dirección del servicio está en la constante `PARAM_API_URL` de ese archivo.

- **Permiso nuevo en Apps Script.** `UrlFetchApp` necesita el scope `script.external_request` (ya está en `appsscript.json`). Después del `clasp push`, la cuenta que despliega tiene que abrir el editor, ejecutar una vez una función (por ejemplo `paramConsultar`) y aceptar "Conectarse a un servicio externo". Si no, la vista muestra "No se pudo conectar con el servicio de parámetros".
- **Sin autenticación.** Por decisión del equipo, los endpoints son públicos: la regla "solo el director actualiza" la aplica Apps Script, pero cualquiera con la URL (o desde Swagger) puede hacer el `PUT` y poner el `usuario` que quiera. Como los datos están en memoria, un reinicio del contenedor devuelve los valores iniciales.
