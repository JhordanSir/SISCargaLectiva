---
name: casos-de-uso-siscargalectiva
description: Redacta casos de uso (CU) nuevos y audita los existentes del proyecto SISCargaLectiva (Universidad La Salle) contra docs/QA/Checklist.md, con el mismo nivel de detalle y formato de docs/CU/CU-001-Registrar-Plan-de-Ciclo.md. Úsala siempre que el usuario pida crear, redactar, escribir, actualizar, ampliar, revisar o auditar un CU-0XX, un flujo alternativo (FA-0XX), una regla de negocio (RN/E##/A##) o cualquier documento de docs/CU/ — incluso si no dice "caso de uso" de forma explícita (p. ej. "agrega el flujo de cancelación de matrícula", "documenta qué pasa si el docente rechaza la fusión", "revisa este CU antes de exponerlo al profesor"). Antes de escribir una sola línea, sigue la regla de CLAUDE.md del proyecto: si el flujo descrito tiene huecos o contradice requirements.md o preguntas.md, pregunta de forma exhaustiva con AskUserQuestion — nunca asume.
---

# Casos de uso de SISCargaLectiva

Esta skill tiene dos modos. Decide cuál aplica según lo que pida el usuario:

- **Crear**: escribir un CU nuevo, o ampliar uno existente con un flujo alternativo, una regla de negocio o una sección que falta.
- **Auditar**: revisar un CU ya escrito contra `docs/QA/Checklist.md` y reportar (o corregir) los incumplimientos.

Ambos modos comparten la misma base: la plantilla y las reglas de redacción de `references/guia-cu.md`. Léelo antes de escribir o auditar — contiene el esqueleto completo sección por sección, el checklist reproducido con la razón de cada criterio, y los errores típicos que el equipo ya cometió una vez (para no repetirlos).

## Por qué esto importa más que en un proyecto de código cualquiera

Este documento no es una nota interna: es lo que el docente lee y califica, y lo que define qué construye el equipo de backend. Un CU con un paso ambiguo ("si es necesario...") o una sección vacía no es un detalle de estilo — es un requisito que el equipo va a malinterpretar o que el docente va a rechazar en la siguiente revisión. Por eso el checklist no es opcional y por eso el principio de "no suponer" (abajo) es el paso más importante de esta skill, no un trámite.

## Principio rector: no supongas, pregunta

CLAUDE.md establece la regla del proyecto, y esta skill la hereda sin excepción:

1. **Antes de escribir**, contrasta lo que te piden contra las fuentes de verdad, en este orden de prioridad:
   1. `docs/feedback/*.md` (`transcripcion.md`, `flujobasico.md`, `flujosalternativos.md`) — la voz del docente, tal cual la dijo.
   2. `preguntas.md` (raíz del repo, archivo local) — decisiones ya tomadas por el equipo, numeradas P01, P02...
   3. `docs/requerimientos/requirements.md` — el consolidado; cada requisito cita su fuente (`[D]`, `[P##]`, `[X]`).
   4. `docs/CU/*.md` y `docs/CU/CUs-Carga lectiva.png` — los CU ya redactados y el diagrama de todos los CU del sistema.
2. **Si algo no está resuelto ahí** — un paso falta, dos fuentes se contradicen, o la respuesta del usuario en este chat choca con una decisión previa (P##) o con una observación del docente — **detente y pregunta**. Usa `AskUserQuestion`, agrupando las preguntas por tema en una sola tanda en vez de una por una. No seas ambiguo tú mismo al preguntar: si hay una opción implícita en lo que ya dijo el docente, ofrécela como opción, pero deja claro que contradice lo anterior.
3. **Registra cada pregunta y su respuesta en `preguntas.md`**, continuando la numeración P## (lee el archivo primero para saber en qué número vas) y citando la respuesta del usuario tal cual la escribió, no una paráfrasis.
4. **Refleja la decisión en `docs/requerimientos/requirements.md`**: una fila nueva o editada en la sección 10 (*Resumen de decisiones del equipo*) y, si aplica, el requisito afectado en la sección correspondiente (RF, RN, E##, A##...), citando el `[P##]`.
5. **Lo que quede sin resolver** — porque solo el docente puede responderlo, no el equipo — va a la sección 15 de `requirements.md` (*Preguntas abiertas*) como una fila `Q#` nueva, y el CU no incorpora esa parte del flujo hasta que se resuelva. No inventes un comportamiento "razonable" para rellenar el hueco: eso es exactamente lo que la regla prohíbe.

Esto aplica tanto si estás creando un CU desde cero como si estás auditando uno: si al auditar encuentras que un paso no tiene respaldo en ninguna fuente (no solo que está mal redactado, sino que **no se sabe** qué debería pasar), no lo arregles por tu cuenta — repórtalo como pregunta abierta.

## Modo Crear

1. Pide (o busca en la conversación) la descripción del flujo: qué hace el actor, qué responde el sistema, en qué casos se desvía. Si el usuario solo da un resumen ("agrega que se pueda cancelar el registro"), pregúntale los pasos concretos en vez de inventarlos — un flujo alternativo mal inventado reprueba el checklist igual que uno mal escrito.
2. Aplica el principio rector: contrasta contra las fuentes de verdad y pregunta lo que falte, **antes** de redactar texto final. Está bien escribir un borrador mental o mostrar opciones dentro de la pregunta, pero no publiques un paso que no tenga de dónde salir.
3. Determina el identificador:
   - Un CU nuevo va en `docs/CU/CU-0XX-Nombre-En-Pascal-Case.md`, con el siguiente número libre (revisa `docs/CU/` y el diagrama `docs/CU/CUs-Carga lectiva.png` para no repetir uno ya reservado).
   - Un flujo alternativo nuevo dentro de un CU existente es el siguiente `FA-0XX` libre **en ese documento** (los FA no se renumeran entre documentos).
   - Una regla de negocio nueva sigue la serie que le corresponde: `RN-##` (reglas generales), `E##` (errores que rechazan todo el archivo, solo si aplica a una carga masiva), `A##` (advertencias que no bloquean).
4. Redacta siguiendo el esqueleto de `references/guia-cu.md` — no reinventes la estructura de secciones, y no omitas ninguna aunque parezca no aplicar (usa "Ninguno" o "No aplica", nunca la dejes vacía).
5. Antes de dar el documento por terminado, corre el linter y revisa a mano los criterios que el script no puede verificar (ver "Verificación final" más abajo).
6. Si el CU tocado tiene una tabla de trazabilidad hacia tests (como el prototipo en `frontend-prototipo/README.md`), avisa al usuario que probablemente haga falta actualizarla — no la edites sin que te lo pida, porque no sabes en qué fase del prototipo está.

## Modo Auditar

1. Lee el CU completo y `docs/QA/Checklist.md` (por si cambió desde la última vez).
2. Corre `scripts/lint_cu.py <archivo>` para los criterios verificables mecánicamente (ver abajo). Trata sus resultados como una primera pasada, no como el veredicto final — falsos positivos existen (p. ej. una palabra prohibida que aparece dentro de una cita textual del docente).
3. Repasa a mano, por cada fila del checklist, los criterios de juicio (los de "Fondo" y algunos de "Forma") que el script no puede evaluar: modularidad, no duplicidad de lógica, nivel de detalle correcto, flujo lógico completo, redacción profesional. `references/guia-cu.md` explica qué mirar en cada uno.
4. Repórtalo como una tabla `Cumple | Comentario` por criterio (igual que la estructura del propio `Checklist.md`), o si el usuario pidió que corrijas directamente el documento, hazlo y deja un resumen de qué cambiaste y por qué.
5. Si un incumplimiento viene de un hueco de información (no de redacción) — por ejemplo, un flujo alternativo que el checklist exige pero que nadie ha definido — no lo inventes para "pasar" el checklist: repórtalo como pregunta pendiente, igual que en el modo Crear.

## Verificación final (ambos modos)

Antes de entregar el documento, corre (desde la raíz del repo):

```bash
python .claude/skills/casos-de-uso-siscargalectiva/scripts/lint_cu.py <ruta-del-CU.md>
```

Este script detecta, de forma determinística, lo que un humano revisaría grep-eando el documento: términos ambiguos prohibidos, secciones de la plantilla vacías o ausentes, identificadores (`FA-0XX`, `RN-##`, `E##`, `A##`) duplicados, referencias a "paso N del flujo básico/FA-0XX" que apuntan a un paso que no existe, y cada "y"/"o" suelto dentro de un paso del flujo de eventos como candidato a revisar (no como fallo — la mayoría son válidos; `references/guia-cu.md` explica cuáles). No reemplaza tu lectura — no puede juzgar si un paso mezcla dos acciones, si la voz es realmente activa, o si la lógica está duplicada entre flujos; eso queda para tu revisión siguiendo `references/guia-cu.md`.

Si el script marca algo, decide si es un error real o un falso positivo (explica cuál en tu respuesta) antes de corregir.
