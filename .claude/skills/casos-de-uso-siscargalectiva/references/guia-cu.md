# Guía de redacción de casos de uso — SISCargaLectiva

Esta guía destila `docs/QA/Checklist.md` y el formato de `docs/CU/CU-001-Registrar-Plan-de-Ciclo.md` (v3.0), que es el CU de referencia del proyecto: pásalo a re-leer si tienes dudas de cómo se ve un ejemplo completo y ya aprobado por el equipo.

## Esqueleto de un documento CU

Todo CU nuevo tiene estas secciones, en este orden. Ninguna queda vacía — si de verdad no aplica, escribe "Ninguno" o "No aplica" explícitamente (criterio "Contenido de secciones" del checklist).

```markdown
# CU-0XX: <Verbo en infinitivo + objeto>

**Universidad La Salle**
**Sistema:** SISCargaLectiva
**Caso de Uso:** CU-0XX, <Nombre>
**Versión del documento:** X.Y (AAAA-MM-DD). <qué cambió respecto de la versión anterior y por qué>
**Año:** <año>
**Clasificación:** Confidencial

## 1. Datos generales del caso de uso

### 1.1 Breve descripción del caso de uso
### 1.2 Actores del caso de uso
### 1.3 Precondiciones
### 1.4 Glosario de términos

# 2. Flujo de eventos

## 2.1 Flujo básico
## 2.2 Flujos alternativos

## 3. Reglas de negocio y validaciones
(si aplica: 3.1 generales, 3.2 de error, 3.3 de advertencia — como en CU-001)

## 4. Requisitos especiales

## 5. Estados (si el CU maneja una máquina de estados) / u otra sección de modelo si aplica

## 6. Resumen funcional
```

No todas las secciones numeradas de CU-001 (como "5. Estados") aplican a cualquier CU — inclúyelas solo si el CU tiene ese concepto (una máquina de estados, reglas de error, etc.). Lo que nunca se omite son las secciones 1, 2, 4 y 6, y la 3 si el CU tiene alguna validación.

**No hay sección de Postcondiciones** (decisión de preguntas.md P78, a partir de un ejemplo del docente que tampoco la tiene). Lo que antes iba ahí — qué queda guardado, qué bitácora se escribe, qué se habilita — se documenta como los últimos pasos del flujo básico en vez de repetirlo aparte. Si un CU tiene un efecto final que **ningún paso del flujo básico deja explícito**, ese es el momento de agregar el paso que falta, no de resucitar la sección.

## Sección por sección

### 1.1 Breve descripción
Un párrafo de qué hace el actor y una lista de las capacidades principales (verbos: consulta, carga, revisa, edita, guarda...). Es el resumen que alguien lee para saber si este es el CU que busca — no repitas aquí los pasos del flujo.

### 1.2 Actores
Tabla `Actor | Descripción`. Si hay un actor abstracto que agrupa a otros (como "Responsable del Plan de Ciclo" agrupa a Coordinador y Director), dilo explícitamente: "en los flujos, 'X' designa a cualquiera de los actores siguientes". Usa siempre el mismo nombre de actor en toda la tabla, el glosario y los pasos — la inconsistencia terminológica es justo lo que el checklist penaliza.

### 1.3 Precondiciones
Lista numerada. Cada precondición debe ser algo de lo que el flujo básico **depende** de verdad (si la quitas, el CU no puede empezar) — no una aspiración genérica. No hay una sección aparte de Postcondiciones (ver nota arriba): lo que en otros formatos iría ahí — qué queda guardado, qué bitácora se escribió, qué pantalla ve el usuario — debe quedar explícito en los últimos pasos del flujo básico.

### 1.4 Glosario
Tabla `Término | Descripción`, en orden alfabético. Incluye toda sigla (DAHU, HT, HP, TH...), todo término de dominio que no sea de conocimiento común, y toda acción con nombre propio que uses en los pasos ("Agregar grupo", "Grupo principal"). Si usas un término tres o más veces en los flujos y no está aquí, falta en el glosario — esto es exactamente lo que revisa `scripts/lint_cu.py`.

### 2.1 Flujo básico
En los documentos Word de `docs/CU/` es una tabla con el número y la acción del **ACTOR** y el número y la acción del **SISTEMA**, numerada desde 1 en orden de lectura (fila por fila, primero el actor). Tres reglas de formato que pidió el equipo el 2026-11-05 (`requirements.md`, sección 10, "Tablas de flujo de los CU"):

- La respuesta del sistema va **en la misma fila** que la acción del actor que la provoca, nunca en una fila nueva con la celda del actor vacía. Los pasos del sistema que siguen van en filas propias.
- El último paso, numerado dentro de la tabla, es "Fin del caso de uso.".
- Las citas (botones, pantallas, mensajes del sistema) van entre comillas dobles: "Guardar", "Acceso denegado". No se usan las comillas «». Una cita dentro de otra va entre comillas simples: "Semestre no reconocido: '<texto>'".

Antes era una tabla `Paso | Responsable | Acción` en Markdown; los ejemplos de abajo conservan ese formato, pero las reglas de redacción son las mismas. Reglas no negociables (vienen directo del checklist "Forma"):

- **Un paso = una acción.** "El sistema valida y muestra el resultado" son dos pasos, no uno.
- **Voz activa, tiempo presente.** "El sistema muestra...", "El actor selecciona...". Nunca "se mostrará", "fue mostrado", "debería mostrar".
- El flujo básico cubre **un solo camino**, el más común y completo, de principio a fin. Las variantes van a flujos alternativos, no como "si..." dentro de un paso del básico.
- Si hay un mensaje textual exacto que el sistema muestra (una confirmación, un error), inclúyelo como cita en bloque justo debajo de la tabla, como el "Mensaje de formalización" de CU-001.

#### Sin "y"/"o" dentro de un paso (preguntas.md P77–P81)

Esta regla sale de un CU de ejemplo que el docente calificó como bien hecho ("Vender Entradas"), y **aplica solo a los pasos del flujo de eventos** (2.1 y 2.2) — el glosario, las precondiciones, las reglas de negocio y los requisitos especiales siguen usando "y"/"o" con normalidad, porque ahí no rige "un paso, una acción".

Dentro de un paso, dos cosas cuentan como violación real:

1. **Unir dos acciones distintas.** "Accede a la URL y presiona Iniciar sesión" son dos verbos, dos interacciones — sepáralos en dos pasos, cada uno con su propio número, y corre todo lo que sigue.
2. **Enumerar en línea, con "y"/"o", algo que el sistema muestra en pantalla.** En vez de "Muestra las opciones A, B y C", usa una de estas dos formas — la que corresponda decide cómo sigue la frase, no una preferencia estética:
   - **El paso introduce la lista con dos puntos** (la lista completa ES lo que se muestra, no hay nada más en la frase): conviértela en una lista con **guiones**, un ítem por línea, cada uno termina en punto. Dentro de una tabla Markdown, usa `<br>` para las líneas dentro de la celda:
     ```markdown
     | 20 | Sistema | Muestra las opciones:<br>- **Pegar desde Google Sheets**.<br>- **Subir archivo (.xlsx o .csv)**.<br>- **Descargar plantilla oficial**. |
     ```
   - **El paso nombra un elemento ya identificado** (un modal, una vista, un artefacto con su propio nombre) **y el resto es solo el detalle de sus campos**, sin dos puntos: ponlo entre **paréntesis**, separado por comas, sin "y" antes del último:
     ```markdown
     | 40 | Sistema | Muestra un modal de confirmación (resumen consolidado, advertencias vigentes). |
     ```
   La diferencia no es "¿el actor va a elegir uno de estos después?" — en el ejemplo del docente hay listas de opciones seleccionables que igual van entre paréntesis (los Tipos de Comprobante). Lo que decide es la estructura de la frase: si la lista ES el contenido completo de lo que se muestra (con dos puntos), va en guiones; si es un detalle adicional sobre algo que ya tiene nombre propio, va entre paréntesis.

No toda aparición de "y"/"o" en un paso es una violación. Estas son excepciones válidas, tal como quedaron en CU-001 v3.0 — no las "corrijas":

- **Un solo verbo con dos objetos**, sin que eso implique dos acciones: "Reconstruye la matriz de filas y columnas", "Actualiza las advertencias y el Panel de Resumen Global".
- **Una condición de dos valores dentro de una sola verificación**: "el rol de Coordinador de carrera o de Director de departamento", "HT o HP", "igual o mayor al Monto total".
- **Un término compuesto fijo**, que nombra un solo concepto: "Fecha y Hora", "HT y HP", "la fila y la celda donde ocurre" (esta última se repite así en todo el proyecto — no la partas).
- **Una etiqueta de interfaz citada tal cual**, aunque contenga "y": el botón se llama **Confirmar y Registrar**; el paso cita el nombre del botón, no describe dos acciones.
- **Los puntos de entrada de un mismo flujo alternativo**: "el paso 4 o 5 del flujo básico", "el Responsable presiona Cancelar todo o Expandir todo" — es un solo FA que se dispara desde cualquiera de esos caminos; no hay que triplicarlo.

`scripts/lint_cu.py` señala cada "y"/"o" suelto dentro de un paso como **candidato a revisar**, no como fallo — no distingue automáticamente una excepción válida de una violación real. Revisa cada uno con esta lista en la mano.

### 2.2 Flujos alternativos
Cada uno es un encabezado `FA-0XX: <Nombre descriptivo>` seguido de su propia tabla ACTOR | SISTEMA, con las mismas reglas que el flujo básico (la respuesta del sistema en la misma fila que la acción del actor). El primer paso siempre ancla el punto de desvío: "En el paso N del flujo básico/FA-0YY, el sistema/actor...". El último paso, numerado **dentro de la tabla**, dice a dónde continúa: "El flujo regresa al paso N del flujo básico.", "El flujo continúa en el paso N del flujo alternativo FA-0YY." o "Fin del caso de uso.". Si la última fila tiene solo la acción del actor, ese paso va en la columna SISTEMA de esa misma fila. No se escribe un párrafo "Continuidad: …" debajo de la tabla.

Antes de escribir un FA nuevo, pregúntate: **¿esta lógica ya existe en otro FA?** Si dos flujos alternativos hacen lo mismo (p. ej. dos formas distintas de llegar al mismo mensaje de error), factoriza uno y haz que el otro lo referencie ("El flujo continúa en el paso 2 del FA-0YY"), como CU-001 hace entre FA-008 y FA-009. Duplicar la lógica es justo el criterio "No duplicidad de lógica" del checklist, y además es lo primero que se desincroniza cuando el docente cambia de opinión.

Numera los FA en el orden en que aparecen en el documento, pero agrúpalos temáticamente (todos los de carga masiva juntos, todos los de una misma pantalla juntos) — así es más fácil de auditar y es como está CU-001.

### 3. Reglas de negocio y validaciones
Solo si el CU tiene reglas que no caben en un paso de flujo. Tres tablas posibles, todas `ID | Regla`:
- **RN-##**: reglas generales de comportamiento (quién puede qué, qué pasa siempre).
- **E##**: errores que **rechazan la totalidad** de una carga o una operación — úsalo solo si el CU tiene ese patrón de todo-o-nada.
- **A##**: advertencias que el sistema muestra pero que **nunca bloquean** la acción del usuario.

No mezcles error y advertencia en la misma tabla ni le des ID de error a algo que en realidad solo advierte — esa distinción es una regla de dominio del proyecto (ver CLAUDE.md: "advertir, no prohibir"), no un detalle de estilo.

### 4. Requisitos especiales
Tabla `ID | Requisito` con los no funcionales relevantes al CU (seguridad, transaccionalidad, tiempo de respuesta, idioma). Si de verdad no hay ninguno más allá de lo genérico del sistema, dilo explícitamente en vez de omitir la sección.

### 6. Resumen funcional
Una lista corta (5-10 ítems) de qué cubre el CU, para alguien que solo quiere el resumen ejecutivo. Cierra con el conteo de flujos alternativos, como hace CU-001.

## El checklist, explicado

`docs/QA/Checklist.md` tiene dos dimensiones. Esto es lo que cada criterio de "Fondo" (los que un script no puede verificar) realmente te está pidiendo que revises:

| Criterio | Qué preguntarte al revisar |
|---|---|
| Descripción modular | ¿Algún paso hace algo que en realidad es responsabilidad de *otro* CU (p. ej. asignar un docente dentro de CU-001, que es tarea de "Asignar docentes")? Sácalo. |
| No duplicidad de lógica | ¿Dos FA describen el mismo comportamiento con palabras distintas? Factoriza. |
| Nivel de detalle de pasos | ¿Un paso explica *por qué* el sistema hace algo, o *cómo* internamente, en vez de *qué* pasa? Recórtalo al qué. |
| Flujo completo y lógico | Léelo de corrido como si fueras el actor: ¿cada paso es la consecuencia natural del anterior? ¿falta un paso intermedio? |
| Atomicidad del flujo principal | ¿El básico se desvía a mitad de camino para cubrir un caso raro? Eso es un FA, no una rama dentro del básico. |
| Flujos alternativos identificados | ¿Falta el FA de un error obvio (dato inválido, permiso denegado, recurso no encontrado) que sí está cubierto en las fuentes de verdad? |
| Requisitos especiales | ¿Hay un no funcional mencionado por el docente (tiempo de respuesta, seguridad) que no quedó en la sección 4? |
| Vinculación con el documento de visión | ¿Algo del CU se sale del alcance que define `requirements.md` (sección de alcance por fases / fuera de alcance)? |

Los criterios de "Forma" son en su mayoría verificables por `scripts/lint_cu.py` (términos ambiguos, secciones vacías, un-paso-una-acción de forma aproximada) o por lectura directa (ortografía, alineación, fuente — esto último no aplica al Markdown del repo, es herencia de cuando el checklist se pensó para Word).

### Términos prohibidos por ambiguos
"etc.", "aproximadamente", "posiblemente", "si es necesario", "rango admitido" sin dar el valor, "y otros", "entre otros". Si necesitas expresar una lista abierta, dilo explícitamente ("el sistema ignora las columnas que no pertenecen a la plantilla oficial, por ejemplo DOCENTE o TURNO") en vez de dejarla ambigua.

## Numeración e identificadores

- `CU-0XX`: tres dígitos, consecutivo entre todos los CU del sistema (ver `docs/CU/CUs-Carga lectiva.png` para los que ya están planeados aunque no escritos).
- `FA-0XX`: tres dígitos, consecutivo **dentro del documento**, sin reiniciar por sección temática.
- `RN-##`, `E##`, `A##`: dos dígitos, consecutivos dentro de su propia tabla, sin reutilizar un número si se elimina una regla (para no romper referencias históricas en `preguntas.md` o en commits pasados).

## Errores típicos ya cometidos en este proyecto (no los repitas)

Estos vienen del historial de versiones al pie de CU-001, es decir, son errores reales que el equipo cometió y corrigió:

- Referencias a pasos que no existían en el FA citado (verifica siempre que "paso N del flujo básico/FA-0YY" exista de verdad — `scripts/lint_cu.py` lo detecta).
- Lógica duplicada entre dos FA, y entre dos flujos de cancelación distintos.
- La descripción de un actor incluía una tarea que pertenece a otro CU.
- Nombres de actor inconsistentes ("Director" en un lugar, "Director de departamento" en otro).
- El término ambiguo "rango admitido" sin especificar el rango.
- Faltaba la sección *Requisitos especiales* por completo (no vacía: ausente).
- Un paso de actor faltante en la autenticación (el flujo saltaba de "el sistema redirige a Google" a "el sistema valida el correo" sin el paso donde el actor de hecho se autentica).
- Pasos que unían dos acciones con "y"/"o", o que enumeraban en línea lo que el sistema muestra en pantalla, en vez de usar guiones o paréntesis (corregido en la v3.0; ver la sección de arriba).

**Nota sobre Postcondiciones:** la v2.0 de CU-001 había *agregado* esa sección porque su ausencia en la v1 se consideró un defecto. La v3.0 la retiró de nuevo, esta vez a propósito (P78): no porque volver a omitirla esté bien por descuido, sino porque el equipo decidió que su contenido debe vivir en los pasos finales del flujo básico en vez de duplicarse aparte. Si en algún CU nuevo un efecto final relevante **no** queda explícito en ningún paso, el error real es que falta ese paso — no que falte la sección.
