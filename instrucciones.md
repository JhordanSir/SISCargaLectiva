# Instrucciones: simplificar SISCargaLectiva

Este documento explica qué hay que hacer con el proyecto, por qué y en qué orden. Está pensado para quien lo ejecute después de hacer `git pull` de este repositorio. Las decisiones que aparecen aquí ya las tomó el equipo: no hace falta volver a discutirlas. Si algo no se puede hacer como está escrito, pregunta a Jorge Ortiz antes de cambiar el enfoque.

---

## 1. Qué se busca

Hoy la aplicación de Apps Script es difícil de entender. Tiene unas 11.500 líneas en 60 archivos repartidos en `base/`, `cu001/`, `cu002/`, `hoja/` e `inicio/`, más 3.400 líneas de pruebas. Además tiene muchas funciones que los casos de uso no necesitan: tableros vistosos, relectura de Excel desde Drive, rejilla de pegado, copias de recuperación, derivaciones, reemplazos de docentes y otras.

El objetivo es **rehacerla al mínimo**, con unas 1.900 líneas en 8 archivos, sin perder lo esencial:

- **Una página principal con dos botones:**
  - "Registrar plan de ciclo", que corresponde al **CU-001**;
  - "Carga docente", que corresponde al **CU-002**. La carga se hace **por carrera**.
- **Solo dos tipos de usuario:** Coordinador de carrera y Director de departamento.
- **Formas de cargar la información en ambos CU:**
  - **copiar y pegar** desde Excel o Google Sheets;
  - **subir un archivo `.csv`**.
- **Versionado y bloqueo de edición** en ambos CU.
- **Cada vista en dos archivos:**
  - un `.html` con su marcado y su JavaScript;
  - un `.js` con su backend.
- **Nombres claros y nada compartido entre los dos CU.** La lógica que se repita se copia en cada CU con su prefijo; no se crea un archivo común.
- **Alpine.js en toda la interfaz** (ver la sección 5).
- **Sin dashboards llamativos:** HTML sencillo y unas 100 líneas de CSS escrito a mano.

---

## 2. Datos del proyecto

| Qué | Valor |
|---|---|
| Repositorio | `JhordanSir/SISCargaLectiva` (privado), rama `main` |
| Proyecto de Apps Script | scriptId `1-9GD2JRt1wvyDCnAvRw7RObZX3Mb1wYjuKW5IJSsE4q5Jx9Lo941zXDU` (en `AppScript/.clasp.json`) |
| Google Sheet vinculado | "SISCargaLectiva - Centro de datos": https://docs.google.com/spreadsheets/d/1p-0kW9efq--dgu2m-s6NecqfO7STgiWSG2_z8XqRrIM/edit |
| Despliegue web existente | `AKfycbw7tEwKcnD54HU4To7xEiKA0FHBecpk3e_MAgdoFc81_55fWWG-NcsfmPSAq0BpkKZB` |
| Casos de uso | `docs/CU/CU - 001 - Registrar Plan de Ciclo.docx` y `docs/CU/CU - 002 - Asignar docentes a plan de ciclo.docx` |
| Excel de ejemplo | `docs/archivos/*.xlsx` (CargaXCarrera, CargaXDepartamento, CargaDeDocentes) |

Para usar clasp:

1. Ejecuta `clasp login` con tu propia cuenta. Esa cuenta necesita acceso de edición al proyecto y al Sheet.
2. Activa la Apps Script API en https://script.google.com/home/usersettings.
3. Desde `AppScript/`, sube los cambios con `clasp push --force`.

No copies ni compartas archivos de credenciales (`~/.clasprc.json`).

---

## 3. Reglas de trabajo

- **Ramas:**
  - trabaja en la rama `simplificacion`;
  - antes de empezar, marca el estado actual con `git tag antes-de-simplificar main && git push origin antes-de-simplificar`, para poder recuperar cualquier archivo borrado.
- **Commits y PR sin firma de Claude ni de otra IA.** No pongas `Co-Authored-By: Claude…` ni "Generated with Claude Code". En GitHub no debe figurar Claude.
- **Antes de borrar pestañas del Google Sheet:**
  - haz una copia del libro completo en Drive ("Archivo → Hacer una copia");
  - confirma con Jorge.
- **Documentos de casos de uso:** Jorge los está modificando. Antes de reescribirlos, haz `git pull` para tener su última versión y no pises sus cambios.
- **Mensajes:** los mensajes de commit, los textos de la interfaz y los comentarios del código van en español.

---

## 4. Decisiones ya tomadas

### 4.1 Generales

| Tema | Decisión |
|---|---|
| Usuarios | Solo `coordinador` y `director`, leídos de la pestaña **Usuarios**. |
| Acceso | La cuenta tiene que ser de `@ulasalle.edu.pe` **y** estar en Usuarios. Si no, se muestra "Acceso denegado" con el motivo: cuenta no identificada, cuenta fuera del dominio o cuenta sin rol. |
| Permisos | El **Coordinador** edita el CU-001 de *sus* carreras (columna `carreras` de Usuarios). El **Director** edita el CU-002 de las carreras de *su* departamento (pestaña Carreras). Cada uno ve lo demás en **solo lectura**. |
| Ciclo | Un **selector "Ciclo"** en cada CU, con los valores de la pestaña **Ciclos**. |
| Archivos | Pegar texto (separado por tabulaciones, como lo copia Excel o Sheets) o subir **.csv** (separado por `;` o `,`). **No** se aceptan `.xlsx`. |
| Versionado | **Cada guardado crea una versión** con número, usuario, fecha y hora de Perú, y el contenido completo. Se puede **listar** el historial, **ver** una versión en solo lectura y **restaurarla**. Restaurar copia la versión como una versión nueva, sin borrar el historial. |
| Conflicto | Al guardar se envía la versión con la que se abrió la edición. Si en la hoja ya hay una más nueva, el guardado se rechaza con un aviso. |
| Bloqueo | Al pulsar "Editar", el usuario toma el bloqueo de esa carrera en ese ciclo y ese CU. Los demás ven "En edición por <correo>" y solo pueden leer. El bloqueo se libera al guardar o al salir, o **vence tras 30 min sin actividad**. Si hubo actividad, la vista llama a `…Mantener` cada 5 min. **Sin** autoguardado ni copia de recuperación: si el bloqueo vence, lo que no se guardó se pierde. |
| Alpine y estilos | Alpine.js **desde CDN** (`https://cdn.jsdelivr.net/npm/alpinejs@3.17.5/dist/cdn.min.js`, con `defer`). El CSS va escrito a mano dentro de `Index.html`. Se eliminan Tailwind, los iconos y la carpeta `estilos/`. |

### 4.2 CU-001: Registrar plan de ciclo (Coordinador de carrera)

- **Estados del plan:**
  - un plan tiene versiones o **no tiene ninguna** ("Sin plan");
  - no existe el estado Borrador: hay **un solo botón "Guardar"** y todo plan guardado es *Registrado*;
  - el CU-002 trabaja con la versión más reciente del plan.
- **Flujo:**
  1. Elegir el ciclo.
  2. Ver la tabla de carreras (`x-for`) con versión, quién guardó, cuándo y si alguien la está editando.
  3. Pulsar "Editar" en una carrera propia.
  4. **Pegar** el rango o **subir** el CSV.
  5. El servidor lo interpreta y devuelve el plan.
  6. Revisar la previsualización por semestre (`x-for`).
  7. Aplicar las operaciones sobre grupos.
  8. Pulsar "Guardar".
- **Interpretación del contenido** (`planInterpretar`):
  - Busca la fila de cabeceras, que puede no ser la primera porque el Excel real trae títulos encima. Compara los nombres sin mayúsculas, tildes ni espacios sobrantes.
  - **Columnas:** CARRERA, MALLA, SEMESTRE, CODIGO, ASIGNATURA, HT, HP, TOTAL HORAS (acepta también `TH` o `TOTAL DE HORAS`), DPTO y OBSERVACIONES.
  - **Columnas ignoradas:** DOCENTE, TURNO y cualquier otra.
  - **Ojo con el Excel real:** en la pestaña de oferta de ejemplo la columna del total también se llama "HT". La segunda columna HT debe tomarse como TOTAL HORAS.
  - **SEMESTRE y grupo:**
    - puede venir como `4` o como `1-2`; en el segundo caso el semestre es 1 y el grupo es 2;
    - si no hay grupo, es el grupo 1.
  - Las filas con el mismo CODIGO forman **una asignatura** con varios grupos. Las asignaturas se ordenan por semestre y luego por código.
  - Las filas de **otra carrera** se descartan y se informa cuántas fueron.
  - Lo que no se entiende no rechaza la carga: se conserva el texto original y se muestra un aviso en la fila.
- **Operaciones** (se hacen en memoria en el navegador y se guardan con "Guardar"):
  - **Agregar grupo:** a una asignatura, con número correlativo y las mismas horas. **Quitar grupo:** con confirmación.
  - **Desdoble parcial:**
    - divide en N subgrupos solo la práctica (requiere HP > 0) o solo la teoría (requiere HT > 0);
    - el desdoble se puede **quitar**.
  - **Fusión** de 2 o más grupos, que pueden ser de la misma carrera o de **otras carreras** del mismo ciclo. Los candidatos de otras carreras los da `planCandidatosFusion(ciclo)`.
    - Se elige el **grupo principal**: sus horas son las de la sección fusionada y cuentan una sola vez.
    - Si los grupos difieren en nombre, código u horas, se advierte pero **nunca se bloquea**.
    - La fusión se puede **deshacer**.
  - **Fusión con otra carrera:** se guarda **solo en el plan que la crea**. La otra carrera la ve como una marca "FUS – fusionado con <carrera>" que se calcula al leer los planes. No se crea una versión en el otro plan ni hace falta su bloqueo.
- **No se puede** editar celdas a mano, agregar o eliminar asignaturas, ni colapsar o expandir bloques. Para corregir datos se vuelve a pegar el Excel corregido.
- **Reemplazar contenido:** pegar o subir sobre un plan que ya tiene asignaturas pide confirmación y reemplaza todo, fusiones incluidas.

### 4.3 CU-002: Carga docente (Director de departamento)

- La carga es **por carrera**. El Director elige el ciclo y una carrera de su departamento que tenga plan. Ve las secciones del plan vigente (`x-for`) y asigna docentes.
- **Componentes:**
  - cada grupo tiene **teoría (T)** y **práctica (P)**, y cada componente lleva **su propio docente**;
  - con desdoble parcial, el componente desdoblado aparece como N subcomponentes (P1…Pn o T1…Tn), cada uno con su docente;
  - un grupo fusionado se asigna en la carrera del **grupo principal**; en las demás carreras aparece como "fusionado con X", sin poder asignarlo.
- **Carga masiva** (`cargaInterpretar`): lee el formato real **CargaXDepartamento**, como en la hoja "CARGA DIMA 2026-I" del Excel de ejemplo:
  - Las cabeceras son DOCENTE, CARRERA, MALLA, SEMESTRE, CODIGO, ASIGNATURA, HORAS TEÓRICAS, HORAS PRÁCTICAS, TOTAL HORAS y CONDICIÓN. Llevan saltos de línea, así que hay que normalizarlas.
  - **Docente y filas que se saltan:**
    - el docente va en la primera fila de su bloque y las filas siguientes con DOCENTE vacío **heredan** el de arriba;
    - las filas `TOTAL` y las vacías se ignoran.
  - **Selección y emparejamiento:**
    - se toman solo las filas de la **carrera elegida**;
    - se emparejan con el plan por **CODIGO + grupo**, donde el grupo sale del SEMESTRE en formato `1-2`, o es el 1 si no viene.
  - **Componente:** si la fila trae HT y HP, asigna T y P. Si solo trae HT, asigna T. Si solo trae HP, asigna P.
  - **Resultado:** una previsualización con las asignaciones encontradas, las filas que no tienen sección en el plan y los nombres que no están en el catálogo. Al aplicarla se vuelca en la tabla.
- **Búsqueda de docente por nombre** (`cargaBuscarDocentes(ciclo, texto)`):
  - **Coincidencia:** no distingue tildes ni mayúsculas, exige todas las palabras y como mínimo 2 letras.
  - **Resultados:** como máximo 30, pintados con `x-for`. Cada uno muestra el nombre, el departamento, las horas totales del ciclo en todas las carreras y las carreras donde dicta.
- **Reglas al guardar** (`cargaGuardar`). Las horas de un docente son la suma de sus componentes en **todas** las carreras del ciclo: la carga vigente de cada carrera, con la carrera que se está guardando en su versión nueva.

  | Código | Regla | Efecto |
  |---|---|---|
  | A07 | Más de 40 h lectivas semanales | **Impide guardar** |
  | A08 | TC en otra universidad (`TC_OTRA_UNIV` = Sí) y más de 16 h | Advertencia |
  | A09 | Docente ordinario (`CONDICION` = Ordinario) con más de 24 h | Advertencia |
  | A10 | Tiempo parcial (TP) con menos de 8 h que dicta algún curso no internacional | Advertencia |
  | A11 | Dos cursos distintos en el mismo semestre de una carrera (dos grupos del mismo curso sí se permiten) | Advertencia |
  | A12 | Con `CARGO`: más de 20 h es advertencia; más de 24 h **exige un motivo** para guardar | Advertencia / motivo obligatorio |
  | A13 | Quedan componentes sin docente | Advertencia |
  | A14 | El departamento del docente es distinto del DPTO de la asignatura (préstamo) | Informativa |
  | A15 | Tiempo completo (TC) cuyas horas lectivas más `NO_LECTIVAS` no llegan a 40 h | Advertencia |
  | — | El nombre del docente no está en la pestaña Docentes | Advertencia |

  Las advertencias se muestran en una lista con `x-for`.
- **No se incluye:** derivación a otro departamento, reemplazo de un docente durante el ciclo, "pendiente internacional", la vista con las horas de cada docente ni la plana del departamento.

### 4.4 Lo que se elimina

- **Funciones de la aplicación:**
  - relectura de los Excel desde Drive ("Releer Excel");
  - tablero de avance y cifras de Inicio;
  - descarga de la plantilla;
  - lectura de `.xlsx` y selección de hoja del libro;
  - arrastrar y soltar archivos;
  - rejilla de pegado (se reemplaza por un `<textarea>`);
  - copias de recuperación y autoguardado;
  - estado Borrador;
  - comparación de versiones;
  - derivación, reemplazo de docente y pendiente internacional;
  - el menú y los paneles dentro del Sheet (carpeta `hoja/`).
- **Herramientas y documentación:**
  - el mapa de la GUI (`docs/arquitectura/mapa-gui.html` y `AppScript/pruebas/actualizar-mapa.mjs`);
  - el docx de arquitectura;
  - Tailwind e iconos (`AppScript/estilos/`).

---

## 5. Requisito de Alpine.js (lo pide el profesor)

Copia literal del pedido:

> usar Alpine.js para:
> - navegación entre vistas,
> - reactividad: botones o elementos de loading, se muestran cuando se realiza la llamada al servidor y vuelve al estado anterior/habitual cuando ya se procesó la respuesta.
> - reactividad: poblamiento de datos (de respuestas del servidor) en la vista HTML. Tal poblamiento se debe dar en al menos una funcionalidad de cada CU. Por ejemplo, cuando se realiza una búsqueda por nombre, una sección de la vista es actualizada con los resultados de la búsqueda; se usa el x-for de Alpine para recorrer los resultados y generar las filas de la tabla de resultados.

| Requisito | Cómo se cumple |
|---|---|
| Navegación | **Store y secciones:** `Alpine.store("nav", { vista: "inicio" })` y cada vista en `<section x-show="$store.nav.vista === 'plan'">`. **Botones:** la barra superior y los de Inicio usan `@click="$store.nav.vista = 'carga'"` y `:class` para marcar la vista activa. |
| Botones de carga | **Estado:** cada componente (`Alpine.data("planDeCiclo")`, `Alpine.data("cargaDocente")`) tiene `ocupado: ""`. Al llamar al servidor toma el valor de la acción en curso (`"guardar"`, `"interpretar"`, `"buscar"`…) y vuelve a `""` en el éxito **y** en el error. **Botones:** usan `:disabled="ocupado"` y `x-text="ocupado === 'guardar' ? 'Guardando…' : 'Guardar'"`. |
| `x-for` con datos del servidor | **CU-001:** tabla de carreras (`planInicio`), previsualización del plan (`planInterpretar` / `planAbrir`) e historial de versiones (`planHistorial`). **CU-002:** resultados de la búsqueda por nombre (`cargaBuscarDocentes`), tabla de secciones (`cargaAbrir`) y lista de advertencias (`cargaGuardar`). |

Notas técnicas:

- **Registro de componentes y stores:** con el CDN, Alpine arranca solo. Hay que registrarlos dentro de `document.addEventListener("alpine:init", () => { … })`, y cada vista registra los suyos en su propio `<script>`.
- **Llamadas al servidor:** cada vista tiene su propio envoltorio de `google.script.run` que devuelve una promesa (`planLlamar`, `cargaLlamar`). No lo compartas.
- **Comentarios en el `<script>`:** HtmlService los quita antes de servir la página y se equivoca con `//` dentro de cadenas o plantillas. No escribas URLs con `//` dentro del código JavaScript; en el HTML sí se puede.

---

## 6. Estructura final del código

```
AppScript/
  appsscript.json
  .clasp.json
  .claspignore        ignora pruebas/
  Index.html          carcasa: <head> con Alpine (CDN) y CSS, barra con las vistas,
                      correo y rol del usuario, vista "Acceso denegado",
                      e include de Inicio, PlanDeCiclo y CargaDocente
  Index.js            doGet(), include(), indexUsuario(): dominio + pestaña Usuarios
  Inicio.html         los dos botones (se habilitan según el rol). Sin backend.
  PlanDeCiclo.html    vista del CU-001: marcado + <script> con Alpine.data("planDeCiclo")
  PlanDeCiclo.js      backend del CU-001: todas sus funciones empiezan por "plan"
  CargaDocente.html   vista del CU-002: marcado + <script> con Alpine.data("cargaDocente")
  CargaDocente.js     backend del CU-002: todas sus funciones empiezan por "carga"
  pruebas/
    logica.test.mjs   pruebas de la lógica pura (node --test)
    recorrido.mjs     recorrido de los dos CU en Chrome
```

Reglas:

- **Prefijos:** en Apps Script todos los nombres son globales, así que todo lo del CU-001 empieza por `plan` y todo lo del CU-002 por `carga`. Bloqueo, versionado, lectura de CSV y normalización de texto se **copian** en cada `.js` (por ejemplo `planBloquear` y `cargaBloquear`) en vez de compartirse.
- **Pares de nombres:** una función del navegador llamada `guardar()` llama a `planGuardar()` en el servidor, con el mismo verbo y el prefijo. Así cualquiera encuentra el par sin documentación extra.
- **Cabecera de cada archivo:** un comentario breve que diga qué vista es, qué botones tiene y qué funciones del servidor usa.
- **Respuesta del servidor:** todas las funciones públicas devuelven `{ ok: true, datos }` o `{ ok: false, error: "mensaje para el usuario" }` y no lanzan excepciones hacia el navegador.
- **Escrituras:** cada función que escribe en el Sheet usa `LockService.getScriptLock()`, para que dos guardados simultáneos no se pisen.

Funciones del servidor previstas:

| Archivo | Funciones públicas |
|---|---|
| `Index.js` | `doGet`, `include`, `indexUsuario` |
| `PlanDeCiclo.js` | `planInicio(ciclo)`, `planAbrir(ciclo, carrera)`, `planInterpretar(texto, carrera)`, `planCandidatosFusion(ciclo, carrera)`, `planGuardar(ciclo, carrera, contenido, versionBase)`, `planMantener(ciclo, carrera)`, `planSalir(ciclo, carrera)`, `planHistorial(ciclo, carrera)`, `planVersion(ciclo, carrera, n)`, `planRestaurar(ciclo, carrera, n)` |
| `CargaDocente.js` | `cargaInicio(ciclo)`, `cargaAbrir(ciclo, carrera)`, `cargaInterpretar(texto, ciclo, carrera)`, `cargaBuscarDocentes(ciclo, texto)`, `cargaGuardar(ciclo, carrera, asignaciones, versionBase, motivo)`, `cargaMantener`, `cargaSalir`, `cargaHistorial`, `cargaVersion`, `cargaRestaurar` |

---

## 7. Estructura final del Google Sheet

| Pestaña | Columnas | Origen |
|---|---|---|
| Usuarios | `correo`, `rol` (coordinador / director), `carreras` (siglas separadas por coma), `departamento` | Se conserva la actual |
| Ciclos | `ciclo` (2026-1, 2026-2…) | Nueva |
| Carreras | `sigla`, `nombre`, `departamento` | Nueva, con las 8 carreras. Ver la tabla de siglas más abajo. |
| Docentes | `DOCENTE` (apellidos y nombres), `DEPARTAMENTO` (DIMA / DAHUC / DACJ / DACTE), `CONDICION`, `DEDICACION` (TC / TP), `CARGO`, `TC_OTRA_UNIV` (Sí / No), `NO_LECTIVAS` (horas) | Se migra desde "Docentes - General": DOCENTE = APELLIDO PAT + APELLIDO MAT + NOMBRES (sin espacios sobrantes); DEPARTAMENTO pasa del nombre largo a la sigla. `CARGO`, `TC_OTRA_UNIV` y `NO_LECTIVAS` quedan vacías para que el equipo las complete. |
| Planes | `ciclo`, `carrera`, `version`, `usuario`, `fecha`, `contenido` (JSON) | Nueva. Cada fila es una versión y la vigente es la de número más alto. |
| Cargas | `ciclo`, `carrera`, `version`, `usuario`, `fecha`, `motivo`, `contenido` (JSON) | Nueva. Igual que Planes, para la carga docente. |
| Bloqueos | `cu` (plan / carga), `ciclo`, `carrera`, `correo`, `vence` | Nueva |

Siglas de las carreras:

| Sigla | Carrera |
|---|---|
| ADM | Administración de Negocios Internacionales |
| DER | Derecho |
| ING | Ingeniería de Software |
| ICO | Ingeniería Comercial |
| COM | Ciencias de la Comunicación |
| PSI | Psicología |
| ARQ | Arquitectura |
| IND | Ingeniería Industrial |

Se eliminan, **después de la copia de respaldo y la confirmación de Jorge**:
- Inicio;
- las 8 pestañas "Oferta - …" y las 4 "Carga - …";
- Docentes - General y Docentes - Hoja4 (después de migrar los docentes);
- Versiones, Fuentes, VersionesCarga y Recuperacion;
- las Planes, Cargas y Bloqueos actuales, que se reemplazan por las nuevas.

Los planes y las cargas se vuelven a ingresar desde la aplicación, pegando o subiendo CSV. Los Excel de ejemplo siguen en `docs/archivos/`.

El JSON de cada versión tiene que caber en una celda: el límite es de 50.000 caracteres. El plan más grande (Derecho) ocupa unos 12.000.

**Supuesto pendiente de confirmar:** el departamento al que pertenece cada carrera (quién hace su carga docente). Según el CU-002 actual:
- **DIMA:** ING, IND, ARQ e ICO;
- **DACTE:** ADM;
- **DACJ:** DER;
- **DAHUC:** COM y PSI.

Confírmalo con Jorge al llenar la pestaña Carreras.

---

## 8. Fases de ejecución

Cada fase termina con un commit (sin firma de IA) en la rama `simplificacion`.

### Fase 0. Preparación
1. `git pull`, `git tag antes-de-simplificar main`, `git push origin antes-de-simplificar`.
2. `git switch -c simplificacion`.
3. Comprueba que `clasp` funciona desde `AppScript/` (`clasp status`).

### Fase 1. Google Sheet
1. Haz una copia de respaldo del libro en Drive.
2. Crea las pestañas nuevas de la sección 7 con sus cabeceras en la fila 1, inmovilizada.
3. Migra Usuarios (sin cambios) y Docentes (con la transformación de la sección 7). Llena Carreras y Ciclos.
4. Con la confirmación de Jorge, borra las pestañas viejas.

### Fase 2. Carcasa, Inicio y acceso
1. Escribe `Index.js` con `doGet` (sirve `Index.html` con `HtmlService.createTemplateFromFile`), `include(nombre)` e `indexUsuario()`.
2. Escribe `Index.html` con:
   - Alpine desde CDN y el CSS;
   - `Alpine.store("nav")` y `Alpine.store("usuario")`;
   - la barra de navegación;
   - la vista "Acceso denegado".
3. Escribe `Inicio.html` con los dos botones. El de la vista que el usuario no puede editar abre esa vista en solo lectura.
4. Haz `clasp push` y comprueba en `/dev` que se navega entre las tres vistas y que una cuenta sin rol ve "Acceso denegado".

### Fase 3. CU-001
1. Escribe `PlanDeCiclo.js` con lo de la sección 4.2: interpretación, operaciones de grupos, versionado y bloqueo con prefijo `plan`.
2. Escribe `PlanDeCiclo.html`:
   - selector de ciclo y tabla de carreras;
   - pantalla de edición con `<textarea>` y `<input type="file" accept=".csv">`, leído con `file.text()` y enviado a `planInterpretar`;
   - previsualización por semestre;
   - botones de grupo y diálogo de fusión;
   - "Guardar", "Salir" e historial.
3. Pruébalo con el rango copiado de `docs/archivos/SISCargaLectiva-Ejemplo-CargaXCarrera.xlsx` y con ese mismo rango guardado como CSV.

### Fase 4. CU-002
1. Escribe `CargaDocente.js` con lo de la sección 4.3: componentes T/P, interpretación de CargaXDepartamento, búsqueda, reglas A07–A15, versionado y bloqueo con prefijo `carga`.
2. Escribe `CargaDocente.html`:
   - selector de ciclo y de carrera;
   - tabla de secciones con un docente para T y otro para P (sugerencias con `<datalist>` del catálogo);
   - carga masiva con previsualización;
   - búsqueda por nombre;
   - advertencias, motivo para A12, "Guardar", "Salir" e historial.
3. Pruébalo con la hoja "CARGA DIMA 2026-I" de `docs/archivos/SISCargaLectiva-Ejemplo-CargaXDepartamento.xlsx`, sobre un plan de ING guardado en la fase 3.

### Fase 5. Borrar lo que sobra
1. Borra estas carpetas de `AppScript/`: `base/`, `cu001/`, `cu002/`, `hoja/`, `inicio/` y `estilos/`.
2. Borra también, dentro de `AppScript/`:
   - todo `pruebas/` salvo lo nuevo;
   - `jsconfig.json`, `package.json` y `package-lock.json`.
3. Borra `docs/arquitectura/`.
4. Revisa `appsscript.json`. Quita el scope `script.container.ui` si ya no hay menú en el Sheet, y `drive` si ya no se lee Drive.
5. Haz `clasp push --force`. Comprueba en script.google.com que en el proyecto solo quedan los archivos de la sección 6.

### Fase 6. Pruebas
1. `pruebas/logica.test.mjs`: carga los `.js` en un contexto `vm` de node, con un falso de `SpreadsheetApp` donde haga falta, y cubre:
   - la lectura de texto pegado y de CSV con `;` y con `,`;
   - la cabecera con títulos encima y la segunda "HT" tomada como total;
   - el formato `1-2` → semestre 1, grupo 2;
   - las filas de otra carrera descartadas;
   - agregar y quitar grupo, el desdoble y la fusión con deshacer;
   - la herencia del docente y las filas TOTAL en CargaXDepartamento;
   - las reglas A07–A15;
   - el rechazo por versión más nueva y el bloqueo vencido.
2. `pruebas/recorrido.mjs`: abre `/dev` en Chrome con una sesión iniciada y recorre:
   1. Inicio → Registrar plan de ciclo;
   2. pegar, fusionar y guardar;
   3. ver el historial;
   4. Carga docente → pegar y guardar;
   5. buscar un docente.

   En cada llamada al servidor comprueba que el botón muestra el estado de carga y que luego vuelve a su estado normal.
3. Ejecuta `node --test AppScript/pruebas/` hasta que todas pasen.

### Fase 7. Documentos
1. Actualiza los dos docx de `docs/CU/` a la nueva realidad. Si usas Claude Code, hazlo con la skill `casos-de-uso-siscargalectiva` del repositorio.
   - **Quita los flujos alternativos** de lo eliminado (sección 4.4) y renumera los FA.
   - **Ajusta el flujo básico:**
     - Inicio con dos botones;
     - un solo "Guardar";
     - `<textarea>` en vez de rejilla;
     - CSV en vez de xlsx.
   - **Revisa el glosario.**
   - Respeta los cambios que Jorge haya hecho en los docx.
2. Actualiza `docs/requerimientos/requirements.md`:
   - marca lo eliminado como fuera de alcance;
   - añade las decisiones de este documento con la fecha.
3. Reescribe `README.md`:
   - qué hace cada uno de los 8 archivos;
   - cómo se empareja una vista con su backend;
   - dónde está cada uso de Alpine;
   - cómo ejecutar las pruebas y `clasp push`.

### Fase 8. Entrega
1. Abre un PR de `simplificacion` a `main`, **sin firma de IA** en la descripción. Fusiónalo cuando Jorge lo apruebe.
2. Ejecuta `clasp push --force` desde `main`.
3. Para actualizar la URL pública, ejecuta `clasp deploy -i AKfycbw7tEwKcnD54HU4To7xEiKA0FHBecpk3e_MAgdoFc81_55fWWG-NcsfmPSAq0BpkKZB -d "Versión simplificada"`, solo si Jorge lo pide.

---

## 9. Criterios de aceptación

- [ ] En `AppScript/` solo quedan los archivos de la sección 6. El código de la aplicación ronda las 2.000 líneas.
- [ ] Ninguna función ni variable se usa entre `PlanDeCiclo.*` y `CargaDocente.*`.
- [ ] Inicio muestra los dos botones y la barra navega entre vistas con Alpine (`$store.nav`).
- [ ] Una cuenta fuera de `@ulasalle.edu.pe` o que no está en Usuarios ve "Acceso denegado".
- [ ] El Coordinador solo edita el plan de sus carreras. El Director solo edita la carga de las carreras de su departamento. Lo demás se ve en solo lectura.
- [ ] En ambos CU se puede pegar desde Excel o Sheets y subir un `.csv`.
- [ ] Cada guardado crea una versión, y el historial permite ver y restaurar cualquier versión.
- [ ] Mientras alguien edita una carrera, otra cuenta la ve "En edición por …" y no puede editarla. El bloqueo vence a los 30 min sin actividad.
- [ ] El CU-001 permite agregar y quitar grupos, hacer desdobles parciales y fusionar grupos de la misma carrera o de otras (y deshacerlo).
- [ ] El CU-002 asigna teoría y práctica por separado, lee CargaXDepartamento, aplica A07–A15 (A07 bloquea el guardado y A12 con más de 24 h pide un motivo) y busca docentes por nombre.
- [ ] Todo botón que llama al servidor muestra el estado de carga y vuelve a su estado normal al terminar, incluso si hay error.
- [ ] Cada CU tiene al menos una tabla poblada con `x-for` a partir de la respuesta del servidor.
- [ ] `node --test AppScript/pruebas/` pasa y el recorrido en Chrome termina sin errores en la consola.
- [ ] Los docx de CU-001 y CU-002, `requirements.md` y el README describen el sistema nuevo.
- [ ] Ningún commit ni PR menciona a Claude ni a otra IA.
