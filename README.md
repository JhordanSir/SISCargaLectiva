# SISCargaLectiva

Aplicación web en Google Apps Script para planificar la **carga lectiva** de la Universidad La Salle (Arequipa): qué cursos y grupos abre cada carrera en un ciclo (**CU-001 Registrar plan de ciclo**) y qué docentes los dictan (**CU-002 Carga docente**). Los datos viven en el Google Sheet vinculado "SISCargaLectiva - Centro de datos".

Esta es la versión **simplificada** (noviembre de 2026): 8 archivos y unas 4 000 líneas de aplicación (casi un tercio, comentarios), sin compilación ni dependencias. El estado anterior está en la etiqueta `antes-de-simplificar`.

## Qué hace

- **Inicio** con dos botones: "Registrar plan de ciclo" y "Carga docente". El del rol del usuario se resalta; el otro abre su vista en solo lectura.
- **Acceso:** la cuenta tiene que ser de `@ulasalle.edu.pe` y figurar en la pestaña Usuarios como `coordinador` o `director`. Si no, se muestra "Acceso denegado" con el motivo.
- **CU-001 (Coordinador de carrera).** Elige el ciclo, ve la tabla de carreras y pulsa "Editar" en una de sus carreras. Pega el rango copiado de Excel o Google Sheets, o sube un `.csv` (con `;` o `,`), y el servidor lo interpreta: encuentra las cabeceras aunque haya títulos encima, toma la segunda "HT" como total y lee `1-2` como semestre 1, grupo 2. Las filas de otra carrera se descartan con aviso, y lo que no entiende lo conserva con un aviso en la fila. Después puede agregar o quitar grupos, hacer desdobles parciales y fusionar grupos de su carrera o de otras. Una fusión con otra carrera se guarda solo en el plan que la crea, y la otra carrera la ve como "FUS – fusionado con …". El plan se guarda con un solo botón "Guardar".
- **CU-002 (Director de departamento).** La carga es **por carrera**: el Director edita las carreras de su departamento y ve las demás en solo lectura. Cada grupo tiene docente de teoría (T) y de práctica (P), o T1…Tn / P1…Pn si hay desdoble. Una fusión se asigna en la carrera de su grupo principal. Hay carga masiva con el formato CargaXDepartamento (pegado o `.csv`), búsqueda de docentes por nombre y reglas A07 a A15 al guardar: A07 (más de 40 h) impide guardar y A12 (cargo con más de 24 h) pide un motivo.
- **En los dos CU:** cada guardado crea una versión, y el historial permite verla y restaurarla como versión nueva. Al guardar se rechaza el cambio si hay una versión más nueva. El bloqueo de edición es por carrera, ciclo y CU, y vence tras 30 minutos sin actividad: mientras hay actividad, la vista lo renueva cada 5 minutos. No hay autoguardado.

## Los 8 archivos

Apps Script no admite un `.js` y un `.html` con el mismo nombre (`clasp push` falla), así que cada vista se llama `<Nombre>Vista.html` y su backend `<Nombre>.js`.

| Archivo | Qué es | Líneas |
|---|---|---:|
| [AppScript/Index.js](AppScript/Index.js) | `doGet` (sirve la página), `include` (pega las vistas) e `indexUsuario` (dominio y pestaña Usuarios). | 98 |
| [AppScript/IndexVista.html](AppScript/IndexVista.html) | Carcasa: Alpine desde el CDN, el CSS escrito a mano, la barra con las vistas, el correo y el rol, "Acceso denegado" y los `include` de las tres vistas. | 150 |
| [AppScript/InicioVista.html](AppScript/InicioVista.html) | Inicio: los dos botones. No tiene backend. | 36 |
| [AppScript/PlanDeCicloVista.html](AppScript/PlanDeCicloVista.html) | Vista del CU-001: marcado y `Alpine.data("planDeCiclo")`. | 778 |
| [AppScript/PlanDeCiclo.js](AppScript/PlanDeCiclo.js) | Backend del CU-001: todo empieza por `plan`. | 944 |
| [AppScript/CargaDocenteVista.html](AppScript/CargaDocenteVista.html) | Vista del CU-002: marcado y `Alpine.data("cargaDocente")`. | 707 |
| [AppScript/CargaDocente.js](AppScript/CargaDocente.js) | Backend del CU-002: todo empieza por `carga`. | 1351 |
| [AppScript/appsscript.json](AppScript/appsscript.json) | Manifiesto: zona `America/Lima`, aplicación web del dominio y permisos de hojas de cálculo y correo. | |

`AppScript/pruebas/` no se sube (`.claspignore`): [logica.test.mjs](AppScript/pruebas/logica.test.mjs) tiene las pruebas y [recorrido.mjs](AppScript/pruebas/recorrido.mjs), el recorrido en Chrome y el Apps Script falso que usan las dos.

## Cómo se empareja una vista con su backend

- **Mismo nombre, sufijo `Vista`:** `PlanDeCicloVista.html` ↔ `PlanDeCiclo.js`, `CargaDocenteVista.html` ↔ `CargaDocente.js`, `IndexVista.html` ↔ `Index.js`.
- **Mismo verbo, con prefijo en el servidor:** el método `guardar()` del componente llama a `planGuardar()`, `buscarDocentes()` a `cargaBuscarDocentes()`, etc. Cada método escribe su propia llamada a `google.script.run` con promesa (sin envoltorio compartido), así que se ve en el mismo sitio qué función del servidor se llama y qué se hace con la respuesta.
- **Nada compartido entre los dos CU.** En Apps Script todos los nombres son globales, así que todo lo del CU-001 empieza por `plan` y todo lo del CU-002 por `carga`. Bloqueo, versionado, lectura de CSV y normalización están copiados en cada `.js`, y dentro de cada `.js` en cada función que los usa. Una prueba comprueba que ningún nombre de un CU aparece en el otro.
- **Cabecera:** cada archivo empieza con un comentario que dice qué vista es, qué botón llama a qué método y a qué función del servidor, y qué pestañas del Sheet usa.
- **Una función por acción, de arriba abajo.** Cada función pública del servidor hace toda su acción dentro de sí misma y se lee como un texto, con `PASO 1`, `PASO 2`…: validar el usuario, leer las pestañas, tomar el candado, escribir, responder. Lo que necesita (leer una pestaña, cortar con un error, pasar a texto) son herramientas de una línea declaradas al principio de esa misma función. En las vistas, los métodos van en el orden en que se usan y cada uno sigue el mismo patrón: `ocupado`, llamada, respuesta, `finally`.
- **Marcas en los comentarios** para seguir los datos: `📥 SHEET · LEE`, `📤 SHEET · ESCRIBE`, `🗑 SHEET · BORRA` y `🔒 CANDADO` en el servidor; `📡 → SERVIDOR`, `⬅ VUELVE` y `✎ SOLO MEMORIA` en las vistas; `⬅ VIENE DE` y `➡ SIGUE EN` en los dos lados para saber de dónde llega una llamada y dónde continúa. Con buscar `SHEET ·` se ven todas las lecturas y escrituras del Sheet.
- **Respuesta del servidor:** toda función pública devuelve `{ ok: true, datos }` o `{ ok: false, error: "mensaje" }` y nunca lanza. Las escrituras van dentro de `LockService.getScriptLock()`.

| Archivo | Funciones públicas |
|---|---|
| `Index.js` | `doGet`, `include`, `indexUsuario` |
| `PlanDeCiclo.js` | `planInicio`, `planAbrir`, `planInterpretar`, `planCandidatosFusion`, `planGuardar`, `planMantener`, `planSalir`, `planHistorial`, `planVersion`, `planRestaurar` |
| `CargaDocente.js` | `cargaInicio`, `cargaAbrir`, `cargaInterpretar`, `cargaBuscarDocentes`, `cargaGuardar`, `cargaMantener`, `cargaSalir`, `cargaHistorial`, `cargaVersion`, `cargaRestaurar` |

## Dónde se usa Alpine.js

Alpine 3.17.5 se carga desde el CDN en [IndexVista.html:22](AppScript/IndexVista.html:22). Cada vista registra lo suyo dentro de `document.addEventListener("alpine:init", …)`.

| Uso | Dónde |
|---|---|
| **Navegación.** `Alpine.store("nav", { vista: "inicio" })` y cada vista en `<section x-show="$store.nav.vista === '…'">` | Store en [IndexVista.html:111](AppScript/IndexVista.html:111); barra con `@click` y `:class` activo en [IndexVista.html:79-81](AppScript/IndexVista.html:79); botones de Inicio en [InicioVista.html:22](AppScript/InicioVista.html:22) y [:29](AppScript/InicioVista.html:29); secciones en [PlanDeCicloVista.html:19](AppScript/PlanDeCicloVista.html:19) y [CargaDocenteVista.html:20](AppScript/CargaDocenteVista.html:20) |
| **Usuario.** `Alpine.store("usuario")` con el correo, el rol y el motivo de "Acceso denegado" | [IndexVista.html:114](AppScript/IndexVista.html:114) |
| **Botones en espera.** `ocupado` vale la acción en curso (`"guardar"`, `"interpretar"`, `"buscar"`…) y vuelve a `""` en el éxito y en el error; los botones usan `:disabled="!!ocupado"` y `x-text="ocupado === 'guardar' ? 'Guardando…' : 'Guardar'"` | En cada método que llama al servidor; el patrón está explicado en [PlanDeCicloVista.html:213](AppScript/PlanDeCicloVista.html:213) y [CargaDocenteVista.html:245](AppScript/CargaDocenteVista.html:245) |
| **`x-for` con datos del servidor (CU-001)** | Tabla de carreras (`planInicio`) [PlanDeCicloVista.html:42](AppScript/PlanDeCicloVista.html:42); previsualización por semestre (`planInterpretar` / `planAbrir`) [:121](AppScript/PlanDeCicloVista.html:121); historial (`planHistorial`) [:83](AppScript/PlanDeCicloVista.html:83); candidatos de fusión (`planCandidatosFusion`) [:184](AppScript/PlanDeCicloVista.html:184) |
| **`x-for` con datos del servidor (CU-002)** | Resultados de la búsqueda (`cargaBuscarDocentes`) [CargaDocenteVista.html:222](AppScript/CargaDocenteVista.html:222); tabla de secciones (`cargaAbrir`) [:171](AppScript/CargaDocenteVista.html:171); advertencias (`cargaGuardar`) [:39](AppScript/CargaDocenteVista.html:39); previsualización de la carga masiva (`cargaInterpretar`) [:142](AppScript/CargaDocenteVista.html:142) |

Dos cuidados:

- **`:disabled="!!ocupado"`, no `:disabled="ocupado"`.** Alpine solo quita un atributo booleano con `null`, `undefined` o `false`. Con el texto vacío `""` deja el botón deshabilitado. Una prueba revisa todos los `:disabled` de las vistas.
- **Sin `//` en el JavaScript de las vistas.** HtmlService quita los comentarios de cada `<script>` y toma por comentario un `//` dentro de una cadena, lo que corta el código. Los comentarios van con `/* … */`, y una prueba lo comprueba.

## Datos

El Google Sheet [SISCargaLectiva - Centro de datos](https://docs.google.com/spreadsheets/d/1p-0kW9efq--dgu2m-s6NecqfO7STgiWSG2_z8XqRrIM/edit) está vinculado al script. Todas las celdas son texto, y la fila 1 lleva las cabeceras, inmovilizada.

| Pestaña | Columnas |
|---|---|
| Usuarios | `correo`, `rol` (coordinador / director), `carreras` (siglas separadas por coma), `departamento` |
| Ciclos | `ciclo` (2026-1, 2026-2…) |
| Carreras | `sigla`, `nombre`, `departamento` (DIMA → ING, IND, ARQ, ICO; DACTE → ADM; DACJ → DER; DAHUC → COM, PSI) |
| Docentes | `DOCENTE`, `DEPARTAMENTO`, `CONDICION`, `DEDICACION`, `CARGO`, `TC_OTRA_UNIV`, `NO_LECTIVAS` |
| Planes | `ciclo`, `carrera`, `version`, `usuario`, `fecha`, `contenido` (JSON) |
| Cargas | `ciclo`, `carrera`, `version`, `usuario`, `fecha`, `motivo`, `contenido` (JSON) |
| Bloqueos | `cu` (plan / carga), `ciclo`, `carrera`, `correo`, `vence` |

Cada guardado añade una fila con el contenido completo, y la versión vigente es la de número más alto. Las fechas están en hora de Perú ("2026-11-04T02:29:49-05:00"). El JSON de una versión tiene que caber en una celda de 50 000 caracteres; el plan más grande (Derecho) ocupa unos 12 000.

Antes de la simplificación se hizo una copia del libro en Drive: "SISCargaLectiva - Centro de datos (respaldo antes de simplificar 2026-11-03)". Los Excel de ejemplo siguen en `docs/archivos/`, y los planes y las cargas se vuelven a ingresar desde la aplicación.

## Pruebas

Desde la raíz, con Node 24 y sin instalar nada:

```bash
node --test AppScript/pruebas/logica.test.mjs
```

Son 61 pruebas: la carcasa, CU-001 y CU-002, con Apps Script simulado en `vm` y los `<script>` de las vistas ejecutados con un Alpine falso. Usan los Excel reales de `docs/archivos/`: las 8 carreras dan 345 asignaturas y 366 grupos. Psicología repite el código 9.2.5.24 en dos cursos, y el segundo se lee como otro grupo, con aviso. Con Node 24, `node --test AppScript/pruebas/` no funciona porque toma la carpeta como un archivo, así que hay que nombrar el archivo.

```bash
node AppScript/pruebas/recorrido.mjs
```

El recorrido local abre la página en Chrome sin ventana, con el Apps Script falso, y recorre "Acceso denegado", Inicio → Registrar plan de ciclo → pegar, fusionar con otra carrera y guardar → historial, y después Carga docente → pegar y guardar → buscar un docente. En cada llamada comprueba que el botón muestra su estado de carga y luego vuelve, y al final que no hubo errores en la consola. En Windows encuentra Chrome solo; si no, usa la variable `CHROME`.

```bash
node AppScript/pruebas/recorrido.mjs --dev https://script.google.com/a/macros/ulasalle.edu.pe/s/<ID-de-@HEAD>/dev
```

Hace lo mismo contra `/dev`, en una ventana de Chrome con un perfil propio (`~/.sis-recorrido-chrome`). La primera vez hay que iniciar sesión en esa ventana con una cuenta `@ulasalle.edu.pe`. Recorre el CU que corresponde al rol de la cuenta, y **guarda en el Sheet real**.

```bash
node AppScript/pruebas/recorrido.mjs --servidor
```

Solo sirve la vista previa local en `http://127.0.0.1:8765/?usuario=<correo>`. Es la configuración `sis-local` de `.claude/launch.json`.

## Despliegue

1. Inicia sesión en clasp con tu propia cuenta, que necesita acceso de edición al proyecto y al Sheet: `clasp login`. No compartas `~/.clasprc.json`.
2. Activa la Apps Script API en https://script.google.com/home/usersettings.
3. Sube los cambios desde `AppScript/`: `clasp push --force`.
4. Prueba en `/dev`. La URL sale de la implementación `@HEAD` de `clasp list-deployments`.
5. Para actualizar la URL pública `/exec` (solo cuando lo pida el equipo): `clasp deploy -i AKfycbw7tEwKcnD54HU4To7xEiKA0FHBecpk3e_MAgdoFc81_55fWWG-NcsfmPSAq0BpkKZB -d "Versión simplificada"`.

## Documentación

- [docs/mapa-interactivo.html](docs/mapa-interactivo.html): mapa interactivo para abrir en el navegador. Eliges un botón de la app y lees, de arriba abajo, lo que pasa en la pantalla, en el servidor y en el Google Sheet, con el código real y un recorrido animado paso a paso. También trae las 7 pestañas del Sheet con qué funciones las leen, escriben o borran, una simulación de versiones y bloqueos con dos coordinadores, 71 preguntas en lenguaje sencillo con enlaces al paso exacto del código (también por qué en el editor de Apps Script los `.js` se ven como `.gs`) y cómo se publica un cambio. Los pasos y las marcas salen de los comentarios del código: si cambias `AppScript/`, ejecuta `python3 docs/actualizar-mapa.py`.
- [instrucciones.md](instrucciones.md): qué se simplificó, por qué y con qué decisiones.
- [docs/CU/](docs/CU/): CU-001 y CU-002 en Word.
- [docs/requerimientos/requirements.md](docs/requerimientos/requirements.md): requisitos, decisiones del equipo y lo que quedó fuera de alcance.
- [docs/QA/Checklist.md](docs/QA/Checklist.md): criterios que debe cumplir cada caso de uso.
- [docs/feedback/](docs/feedback/): transcripción de la clase y revisiones del docente.
