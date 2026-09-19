# Requerimientos: SISCargaLectiva

**Universidad La Salle (Arequipa)**. Sistema de gestión de la carga lectiva docente.

| Campo | Valor |
|---|---|
| Versión del documento | 1.0 |
| Fecha | 2026-09-19 |
| Fase actual | **Fase 1: CU-001 Registrar Plan de Ciclo** |
| Fuentes | `docs/requerimientos/transcripcion.md` (clase del docente), `docs/requerimientos/flujobasico.md` (1.ª revisión), `docs/requerimientos/flujosalternativos.md` (2.ª revisión), `docs/CU/CUs-Carga lectiva.png` (diagrama de CU), `docs/QA/Checklist.md`, `docs/archivos/*.xlsx` (datos reales) |
| Decisiones del equipo | Resumidas en la sección 10. El detalle P01–P45 está en `preguntas.md` (archivo local, excluido del repositorio por `.gitignore`). |

> **Regla de lectura.** Cada requisito indica su fuente: **[D]** docente (transcripción o revisiones), **[P##]** decisión del equipo registrada en `preguntas.md`, **[X]** hallazgo en los archivos `.xlsx`. Lo que no tiene fuente confirmada figura en la sección 15, *Preguntas abiertas*, y no se implementa hasta resolverse.

---

## 1. Propósito

La universidad asigna hoy la carga lectiva en varios Google Sheets separados: uno por carrera y otro por departamento. Hay que mantenerlos sincronizados a mano, lo que provoca errores de horas, docentes mal asignados y confusión entre versiones ("versión última, última, última"). **[D]**

El sistema debe centralizar la información en **un solo registro**. Los listados por carrera, por departamento y por docente pasan a ser **reportes** generados a partir de ese registro. **[D]**

---

## 2. Contexto del dominio

| Concepto | Descripción |
|---|---|
| **Carrera** | Programa profesional (Ingeniería de Software, Derecho…). Se organiza en torno a los **estudiantes**. La dirige un **Coordinador de carrera**. **[D]** |
| **Departamento académico** | Agrupa a los **docentes**. Lo dirige un **Director de departamento**, que proporciona docentes a todas las carreras que los necesitan. Son cuatro: DIMA, DAHU, DACJ y DACTE. **[D]** |
| **Carga lectiva** | Asignación de docentes para dictar cursos en un ciclo. Se distingue de la carga **no lectiva** (labores administrativas o de coordinación) y de la **investigación**, que están fuera de alcance. **[D]** |
| **Ciclo** | Periodo académico en el que se planifica la carga (p. ej. `2026-2`, `2027-1`). La carga se planifica **ciclo por ciclo**. **[D]** |
| **Semestre** | Nivel dentro del plan de estudios (1.º, 2.º…). El número de semestres **varía por carrera**: Derecho llega a 12 y Psicología, por ser nueva, tiene menos. No se fija un número. **[D]** |
| **Plan de estudios / malla** | Currícula aprobada (2016, 2021, 2022, 2024…). En un mismo ciclo conviven cursos de varias mallas mientras la antigua va saliendo. El sufijo del código indica la malla (`…21`, `…24`). **[D]** |
| **Plan de ciclo** | Cursos y grupos que **cada carrera** apertura en un ciclo. Cada carrera lo registra por separado, en momentos distintos y con usuarios distintos. El conjunto de todas las carreras forma el plan de ciclo de la universidad. **[D]** |
| **Grupo** | Sección de dictado de una asignatura. Puede haber varios grupos, por ejemplo en semestres iniciales a inicio de año o cuando hay muchos desaprobados. **[D]** |
| **Fusión** | Se juntan en un solo grupo estudiantes de distintas mallas o carreras que llevan el "mismo" curso. Es un proceso interno, no normado por la Ley Universitaria. Mandan las horas y los créditos, no el nombre exacto. **[D]** |
| **Desdoble** | División de un grupo. **Total:** todas las horas (en el sistema es *Agregar grupo*, P15). **Parcial:** solo las horas prácticas (típico en laboratorios de Arquitectura e Industrial) o solo las teóricas. **[D][P16]** |
| **Docente internacional / virtual** | Dicta en forma virtual desde fuera de Arequipa. No necesariamente es extranjero. Se marca de forma especial. **[D]** |
| **Tiempo completo / parcial** | TC = 40 h/semana, que deben cubrirse. Menos de 40 h es TP. Aplica a la fase de asignación docente. **[D]** |
| **Curso por jurado** | Curso que salió de la malla y se ofrece por jurado **durante** el ciclo. Es un **caso de uso separado**, fuera de la carga lectiva inicial. **[D]** |

---

## 3. Actores y roles

| Rol | Descripción | Fase 1 |
|---|---|---|
| **Coordinador de carrera** | Define qué cursos y cuántos grupos se abren en su carrera. Especializa a *Responsable del plan de ciclo*. **[D]** | Registra y edita el plan **solo de sus carreras asignadas**. Consulta el de las demás en solo lectura. **[P17][P43]** |
| **Director de departamento** | Asigna docentes al plan registrado. También especializa a *Responsable del plan de ciclo*. **[D][diagrama]** | Registra y edita el plan de **cualquier carrera**. **[P17]** |
| **Administrador** | Administra los ciclos. **[diagrama]** | Sin pantallas propias en fase 1: los datos maestros se cargan por migraciones (seed). **[P29]** |

*Responsable del plan de ciclo* es un **rol abstracto** (generalización del diagrama): no se asigna directamente a los usuarios.

---

## 4. Alcance por fases

| Fase | Caso de uso | Actor | Estado |
|---|---|---|---|
| **1** | **CU-001 Registrar plan de ciclo** (extensiones: agregar grupo, quitar grupo, dividir grupos, fusionar grupos) | Responsable del plan de ciclo | **En curso** |
| 2 | Administrar ciclos | Administrador | Futuro |
| 3 | Asignar docentes a plan de ciclo | Director de departamento | Futuro |
| 4 | Generar reporte de carga lectiva (extensiones: por carrera, por departamento, por docente) | Director de departamento | Futuro |
| 5 | Asignar docentes a cursos por jurado | Por definir | Futuro (el docente anunció que lo agregará) |

**Fuera de alcance:** estudiantes y matrícula; la decisión de abrir o cerrar grupos (la toman las autoridades, el sistema solo la registra); aforo mínimo y alumnos proyectados **[P03]**; horarios; carga no lectiva e investigación; notificaciones por correo en fase 1 **[P30]**; cálculo de créditos en fase 1 **[P26]**.

---

## 5. Requisitos funcionales: fase 1 (CU-001)

### 5.1 Acceso

| ID | Requisito | Fuente |
|---|---|---|
| RF-001 | El usuario se autentica con **Google OAuth 2.0** usando una cuenta del dominio `@ulasalle.edu.pe`. | CU-001 |
| RF-002 | El sistema autoriza según el rol (Coordinador de carrera o Director de departamento) y, para el Coordinador, según sus carreras asignadas. Si el usuario no tiene rol, se deniega el acceso y se destruye la sesión. | CU-001, [P17] |

### 5.2 Tablero de monitoreo general

| ID | Requisito | Fuente |
|---|---|---|
| RF-010 | El usuario elige un **ciclo** (actual, futuro o anterior) en un selector. Los ciclos anteriores se ven con la misma pantalla y el mismo detalle, no mediante la bitácora. | [D] 1.ª revisión |
| RF-011 | Para el ciclo elegido se muestra el **tablero de todas las carreras** con estado del plan (*Sin Iniciar*, *Borrador*, *Registrado*), número de semestres cargados, número de asignaturas, número de grupos, total de horas semanales, versión vigente, última modificación (usuario y fecha) y quién lo está editando. | [D] 1.ª revisión, [P18] |
| RF-012 | El tablero destaca qué carreras **faltan** subir su plan (*Sin Iniciar*). | [D] transcripción |
| RF-013 | El número de semestres es informativo ("la carrera tiene N semestres"). Nunca es un error. | [D] 1.ª revisión |
| RF-014 | Desde el tablero, cualquier responsable abre el detalle de cualquier carrera en **solo lectura**. Solo puede editar las carreras que tiene autorizadas. | [P43] |

### 5.3 Carga masiva

| ID | Requisito | Fuente |
|---|---|---|
| RF-020 | Hay tres formas de carga: **pegar desde Google Sheets** (texto tabulado del portapapeles), **subir `.xlsx`** y **subir `.csv`**. | [P28] |
| RF-021 | El usuario puede **descargar la plantilla oficial** (sección 7). | CU-001 |
| RF-022 | Si el `.xlsx` tiene varias hojas, el sistema las lista y **el usuario elige** cuál importar. | [P27] |
| RF-023 | El sistema **detecta automáticamente** la fila de cabeceras (la primera que contiene todas las obligatorias) e ignora lo que esté encima, como los títulos. | [P34] |
| RF-024 | Cabeceras y valores se **normalizan**: sin distinción de mayúsculas ni tildes, y sin espacios al inicio y al final. Se aceptan sinónimos fijos (sección 7.2). | [P33] |
| RF-025 | Las columnas que no forman parte de la plantilla (DOCENTE, TURNO u otras) **se ignoran** y se informa cuáles se ignoraron. | [P08][P11] |
| RF-026 | Si hay **al menos un error** (sección 8.1), se **rechaza todo el archivo** y se muestra la **lista completa** de errores (fila, columna, valor y motivo). | [P04][P06] |
| RF-027 | Las **advertencias** (sección 8.2) no rechazan el archivo. | [P09][P36][P37] |
| RF-028 | La carga **no crea fusiones ni desdobles parciales**: esos se configuran en el sistema. El texto de OBSERVACIONES se conserva tal cual. | [P10] |
| RF-029 | **Re-importación:** si el plan ya tiene datos, el sistema advierte que se **reemplazará todo** el contenido y que se perderán las fusiones (incluidas las que involucran a otras carreras), los desdobles y los ajustes manuales. El reemplazo requiere confirmación. | [P12] |

### 5.4 Vista previa y edición

| ID | Requisito | Fuente |
|---|---|---|
| RF-030 | La grilla se organiza en **bloques por semestre**, colapsables, con número de asignaturas, grupos y horas por bloque, y con distinción visual por malla. El objetivo es parecerse a la organización actual en Sheets: por carrera, qué semestres hay y cuántos cursos tiene cada uno. | [D] 2.ª revisión |
| RF-031 | Las asignaturas **internacionales o virtuales** llevan un marcador distintivo (sección 8.3). | CU-001, [D] |
| RF-032 | Las **advertencias** se muestran **siempre**, de forma **altamente visible** y **localizada**: en la fila y la celda donde ocurren, más un contador y una lista navegable en el panel de resumen. | [P37] |
| RF-033 | El **panel de resumen** muestra el número de asignaturas y de grupos, el total de HT, HP y TH semanales, las horas de dictado (las horas de un grupo fusionado cuentan una sola vez; los subgrupos de desdoble se suman), el número de asignaturas internacionales o virtuales, de fusiones, de desdobles y de advertencias. | CU-001, [P38] |
| RF-034 | **Edición directa de celdas** con la misma validación que la importación. Un valor inválido se rechaza en el momento. **TH se recalcula** al editar HT o HP. | CU-001, [D] |
| RF-035 | **Agregar asignatura** manualmente, con los campos de la plantilla y sus validaciones. | [D][P32] |
| RF-036 | **Eliminar asignatura** con confirmación, advirtiendo si tiene fusiones, varios grupos o docente asignado (este último dato llega en la fase 3). | [D][P32] |

### 5.5 Gestión de grupos

| ID | Requisito | Fuente |
|---|---|---|
| RF-040 | **Agregar grupo a una asignatura.** Crea un grupo paralelo con número correlativo y las mismas HT y HP. Sustituye al antiguo "desdoble total". | [D][P15][P16] |
| RF-041 | **Agregar grupo a un semestre.** Crea en un solo paso un grupo nuevo para **todas** las asignaturas del semestre (p. ej. 1-1 y 1-2 a inicio de año). | [D][P16] |
| RF-042 | **Eliminar grupo** es una acción **genérica** (sin motivo obligatorio) y lleva confirmación. Advierte si es el **único grupo** de la asignatura, si está **fusionado** o si tiene **docente asignado**. Nunca bloquea. | [D] 2.ª revisión, [P03] |
| RF-043 | **Desdoble parcial de práctica.** La teoría se mantiene común y las HP se dividen en N subgrupos. Requiere HP > 0. | [D][P16] |
| RF-044 | **Desdoble parcial de teoría.** La práctica se mantiene común y las HT se dividen en N subgrupos. Requiere HT > 0. | [D][P16] |
| RF-045 | **Fusionar grupos** de la misma carrera (entre mallas) o de **otras carreras**. Se seleccionan 2 o más grupos. El sistema **sugiere** candidatos (mismo nombre normalizado o mismas horas), pero el usuario puede elegir cualquier grupo. | [D][P13] |
| RF-046 | Si los grupos seleccionados difieren en **nombre, código, HT, HP o TH**, el sistema **advierte y nunca bloquea**. El usuario confirma bajo su responsabilidad. | [D][P14] |
| RF-047 | Al fusionar, el usuario elige el **grupo principal**. Sus HT y HP son las de la sección fusionada y, en los totales consolidados, las horas cuentan **una sola vez**. | [P38][X] |
| RF-048 | Cualquier responsable que pueda editar una de las carreras involucradas puede crear una fusión **sin aprobación** de la otra carrera. Al guardar, la fusión aparece en **ambos planes**, se muestra un **aviso** en el plan de la otra carrera y queda en el historial de ambos. **No requiere** el bloqueo de la otra carrera. | [P13][P39] |
| RF-049 | **Deshacer fusión.** Restituye los grupos originales con sus horas. Lo puede hacer cualquier responsable de una de las carreras involucradas (simetría con RF-048). | CU-001, [P13] |

### 5.6 Estados, guardado y versionado

| ID | Requisito | Fuente |
|---|---|---|
| RF-050 | El plan de cada carrera en cada ciclo tiene los estados **Sin Iniciar → Borrador → Registrado**. También se puede pasar de Sin Iniciar directamente a Registrado. | CU-001 |
| RF-051 | **Guardar borrador** está disponible mientras el plan no está registrado. | CU-001 |
| RF-052 | **Registrar plan** pide confirmación con el resumen consolidado y las advertencias vigentes. Al registrar se habilita la asignación docente (fase 3). | CU-001 |
| RF-053 | Un plan **Registrado sigue siendo editable** con advertencias. Se guarda con **Guardar cambios** (con motivo opcional) y el estado sigue siendo Registrado. | [D] 2.ª revisión, [P01] |
| RF-054 | El estado del ciclo **no** restringe la edición: se pueden editar planes de ciclos futuros, actuales o **anteriores**. | [P02][P41] |
| RF-055 | **Todo guardado genera una versión**: guardar borrador, registrar, guardar cambios, autoguardado y restauración. Cada versión registra número, estado resultante, tipo de guardado, usuario, fecha y hora, motivo y el contenido completo del plan. | [P05][P25][P44] |
| RF-056 | El usuario consulta el **historial de versiones**, ve cualquier versión en solo lectura y la **compara** con la anterior (asignaturas, grupos y fusiones agregados, eliminados o modificados). | [P05] |
| RF-057 | **Restaurar versión.** Copia una versión anterior como **nueva versión**, sin borrar el historial. | [P45] |

### 5.7 Concurrencia

| ID | Requisito | Fuente |
|---|---|---|
| RF-060 | **Bloqueo por carrera.** Solo un usuario edita el plan de una carrera a la vez. Los demás lo ven en solo lectura y con aviso de quién lo está editando. | [P18] |
| RF-061 | El bloqueo se libera al guardar y cerrar, al cancelar o al cerrar sesión, o por **inactividad de 30 minutos** (valor configurable). | [P40] |
| RF-062 | Si el bloqueo expira con cambios sin guardar, se hace un **autoguardado**: como Borrador si el plan no está registrado, o como nueva versión si está Registrado. | [P42] |

### 5.8 Auditoría

| ID | Requisito | Fuente |
|---|---|---|
| RF-070 | Se registra en una bitácora inmutable cada importación, guardado, registro, restauración, fusión y bloqueo, con usuario, fecha y hora, ciclo, carrera, acción y detalle. | [D] 1.ª revisión, [P01] |

---

## 6. Estados del plan de carrera

```mermaid
stateDiagram-v2
    [*] --> Sin_Iniciar
    Sin_Iniciar --> Borrador: Guardar borrador / autoguardado (v1)
    Borrador --> Borrador: Guardar borrador / autoguardado (v+1)
    Sin_Iniciar --> Registrado: Registrar (v1)
    Borrador --> Registrado: Registrar (v+1)
    Registrado --> Registrado: Guardar cambios / autoguardado / restaurar / re-importar (v+1)
```

Un plan **no** vuelve de Registrado a Borrador.

---

## 7. Plantilla oficial de importación

### 7.1 Columnas

| Columna | Obligatoria (celda) | Tipo | Notas |
|---|---|---|---|
| CARRERA | Sí | Sigla | Debe coincidir con la carrera seleccionada (ADM, DER, ING…). |
| MALLA | Sí | Año de 4 dígitos | Manda sobre el sufijo del código. **[P07][P09]** |
| SEMESTRE | Sí | Entero ≥ 1 | Sin máximo fijo. **Ya no** se escribe "1-1" ni "1-2" aquí. |
| CÓDIGO | Sí | Texto | Formato observado: `{n.º carrera}.{semestre}.{orden}.{malla 2 dígitos}`, p. ej. `3.3.1.24`. |
| ASIGNATURA | Sí | Texto | |
| GRUPO | No | Entero ≥ 1 | Si está vacío se asume **1**. **[P07][P35]** |
| HT | Sí | Numérico ≥ 0 | Horas teóricas semanales. |
| HP | Sí | Numérico ≥ 0 | Horas prácticas semanales. |
| TOTAL HORAS | Sí | Numérico ≥ 0 | Debe cumplir `TOTAL HORAS = HT + HP`. |
| DPTO | Sí | DIMA, DAHU, DACJ o DACTE | **Solo códigos oficiales.** "DAHUC" es error. **[P07][P19][P20][P21]** |
| OBSERVACIONES | No | Texto | Detecta internacional o virtual (sección 8.3). |

Todas las **cabeceras** de la tabla son obligatorias en el archivo. Las celdas de GRUPO y OBSERVACIONES pueden ir vacías.

### 7.2 Sinónimos de cabecera aceptados [P33]

Las cabeceras se comparan ya normalizadas (sin mayúsculas, tildes ni espacios extremos).

| Cabecera oficial | Sinónimos aceptados |
|---|---|
| CÓDIGO | CODIGO |
| OBSERVACIONES | OBSERVACIÓN, OBSERVACION |
| TOTAL HORAS | TH |

Una cabecera **repetida** es error. Es el caso del Excel actual, que tiene "HT" dos veces en lugar de "HT" y "TH".

> ⚠️ **Consecuencia:** los Excel reales de `docs/archivos/` **no pasan** la validación tal como están, por tres motivos: "HT" repetido, "DAHUC" en DPTO y "1-1"/"1-2" en SEMESTRE, que además Excel convierte en fechas (`45658`). Hay que migrarlos a la plantilla oficial.

---

## 8. Reglas de validación

### 8.1 Errores: rechazan todo el archivo [P04]

| ID | Regla |
|---|---|
| E01 | Formato no admitido: solo se aceptan texto pegado, `.xlsx` y `.csv`. |
| E02 | No existe una fila con todas las cabeceras obligatorias. |
| E03 | Cabecera repetida, evaluada después de normalizar y aplicar sinónimos. |
| E04 | No hay filas de datos debajo de las cabeceras. Las filas completamente vacías se ignoran. |
| E05 | Celda obligatoria vacía (sección 7.1). |
| E06 | CARRERA distinta de la carrera seleccionada. |
| E07 | HT, HP o TOTAL HORAS no numéricos o negativos. |
| E08 | `TOTAL HORAS ≠ HT + HP`. |
| E09 | DPTO fuera de {DIMA, DAHU, DACJ, DACTE}. |
| E10 | SEMESTRE no es un entero ≥ 1. |
| E11 | MALLA no es un año de 4 dígitos. |
| E12 | GRUPO informado que no es un entero ≥ 1. |

### 8.2 Advertencias: no rechazan; se muestran siempre, visibles y localizadas [P37]

| ID | Regla |
|---|---|
| A01 | MALLA no coincide con el sufijo del CÓDIGO. **[P09]** |
| A02 | CÓDIGO + GRUPO repetido. **[P37]** |
| A03 | Mismo CÓDIGO con distinta ASIGNATURA, HT o HP (caso `9.2.5.24` en Psicología). **[P36][P37]** |
| A04 | Columnas ignoradas (aviso informativo). **[P11]** |
| A05 | Diferencias entre los grupos de una fusión: nombre, código, HT, HP o TH. **[P14]** |
| A06 | Eliminación de un grupo o asignatura que es el único grupo, que está fusionado o que tiene docente asignado. **[D][P03]** |

### 8.3 Clasificación

- **Internacional/virtual:** OBSERVACIONES contiene "INTERNACIONAL" o "VIRTUAL" (normalizado). Valores reales: `INTERNACIONAL/VIRTUAL`, `INTERNACIONAL COLOMBIA- VIRTUAL`, `INTERNACIONAL MÉXICO - VIRTUAL`. El marcador se puede editar en la grilla.
- **Malla:** se toma de la columna MALLA. El sufijo del código solo sirve para la advertencia A01.

---

## 9. Requisitos no funcionales

| ID | Requisito | Fuente |
|---|---|---|
| RNF-01 | Autenticación con Google OAuth 2.0 restringida al dominio `@ulasalle.edu.pe`. | CU-001 |
| RNF-02 | La autorización por rol y por carrera se valida en el **backend**, no solo en la interfaz. | Seguridad |
| RNF-03 | Las reglas de validación (sección 8) se aplican en el backend, que es la fuente de verdad. El frontend puede prevalidar. | Consistencia |
| RNF-04 | Cada guardado (versión, bitácora y liberación del bloqueo) es una **transacción atómica**. | [D] 1.ª revisión |
| RNF-05 | Las advertencias son altamente visibles y están localizadas en fila y celda. | [P37] |
| RNF-06 | La carga masiva minimiza el uso de formularios uno por uno. La preocupación del docente era la cantidad de clics. | [D] |
| RNF-07 | Interfaz en español. Fechas en zona `America/Lima`. | Contexto |
| RNF-08 | El tiempo de expiración del bloqueo es configurable (30 min por defecto). | [P40] |
| RNF-09 | Stack: backend **Spring Boot + Java 21 + Maven**, **PostgreSQL**, migraciones **Flyway**, **Docker Compose**. Frontend **por decidir**. | [P22–P24] |
| RNF-10 | Los datos maestros (carreras, departamentos, ciclos, usuarios y roles) se cargan con **migraciones Flyway** (seed). | [P29] |

---

## 10. Resumen de decisiones del equipo

Los códigos P## remiten a `preguntas.md` (archivo local).

| Tema | Decisión |
|---|---|
| Registrado | Editable con advertencias; todo guardado versiona; restaurar crea una nueva versión (P01, P05, P25, P44, P45). |
| Ciclo | Siempre editable, incluidos los ciclos anteriores (P02, P41). |
| Alumnos y aforo | Fuera de alcance (P03). |
| Errores de importación | Se rechaza todo el archivo con la lista completa de errores (P04, P06). |
| Plantilla | Agrega MALLA, GRUPO y DPTO; DOCENTE, TURNO y otras columnas se ignoran (P07, P08, P11). |
| Parser | Normaliza, acepta sinónimos, detecta la fila de cabeceras, pide elegir la hoja; GRUPO vacío es 1 (P27, P33–P35). |
| DPTO | Obligatorio y solo con códigos oficiales; Humanidades es **DAHU** (P19–P21). |
| Duplicados y malla | Advertencias altamente visibles (P09, P36, P37). |
| Grupos | Agregar a una asignatura o a un semestre; eliminar genérico; desdoble parcial de práctica o de teoría (P15, P16). |
| Fusión | Cualquier carrera, sin aprobación, nunca se bloquea, se elige grupo principal, no requiere el bloqueo ajeno (P13, P14, P38, P39). |
| Re-importar | Reemplaza todo con confirmación (P12). |
| Concurrencia | Bloqueo por carrera, 30 min configurable, autoguardado al expirar (P18, P40, P42). |
| Roles | Coordinador edita sus carreras; Director edita todas; todos consultan todas (P17, P43). |
| Formatos | Pegar, `.xlsx` y `.csv` (P28). |
| Fuera de fase 1 | Créditos y correo (P26, P30). |
| Stack | Java 21, Maven, Spring Boot, PostgreSQL, Flyway; frontend por decidir (P22–P24). |

---

## 11. Requisitos de fases futuras (referencia)

### 11.1 Administrar ciclos (Administrador)
- Crear ciclos (p. ej. `2027-1`) y actualizar sus datos. **[D]**

### 11.2 Asignar docentes a plan de ciclo (Director de departamento)
- Asignar docentes a los grupos cuyo DPTO sea el del director. **[D]**
- Permitir cambiar el DPTO de un curso por excepción. Ejemplo: un docente TC de DAHU completa su carga dictando Matemática Básica. **[D]**
- Varios docentes por grupo: titular y **jefe de práctica**. En el Excel aparece como `A // B` o con el prefijo `JP -`. **[X]**
- Datos del docente **[X]**: DNI, apellido paterno, apellido materno, nombres, condición (Ordinario/Contratado), categoría (Auxiliar, Asociado, Principal, Auxiliar/Internacional, Jefe de práctica), departamento, dedicación (TC/TP), "nuevo".
- Condición en la carga: internacional (con país), virtual, invitado, conferencista, por concurso. **[X]**
- Un docente **TC debe cubrir 40 h/semana**. **[D]**
- Al editar el plan (fase 1), se advierte si el grupo ya tiene docente (A06). **[D]**

### 11.3 Generar reporte de carga lectiva
- **Por carrera:** cursos de la carrera y quién los dicta. **[D]**
- **Por departamento:** por docente, sus cursos, las horas y el total; horas por semana por carrera; total de profesores, internacionales, locales, por concurso, conferencistas y jefes de práctica. **[D][X]**
- **Por docente.** **[D]**
- En los totales, las horas de un grupo fusionado cuentan **una vez**. En el Excel actual, el grupo no principal aparece con 0 h. **[X]**
- Deben incluir los cursos por jurado cuando exista ese CU. **[D]**

### 11.4 Cursos por jurado
- Es un CU separado que ocurre **durante** el ciclo. Asigna docentes a cursos por jurado y estos aparecen en los reportes. **[D]**

---

## 12. Datos maestros observados [X]

### Carreras (prefijo del código → sigla)

| N.º | Sigla | Carrera |
|---:|---|---|
| 1 | ADM | Administración de Negocios Internacionales |
| 2 | DER | Derecho |
| 3 | ING | Ingeniería de Software |
| 7 | ICO | Ingeniería Comercial |
| 8 | COM | Ciencias de la Comunicación |
| 9 | PSI | Psicología |
| 16 | ARQ | Arquitectura |
| 17 | IND | Ingeniería Industrial |

### Departamentos

| Sigla | Nombre |
|---|---|
| DIMA | Departamento Académico de Ingeniería y Matemáticas |
| DAHU | Departamento Académico de Humanidades (en el Excel: "Humanidades y Com.", sigla DAHUC) |
| DACJ | Departamento Académico de Ciencias Jurídicas |
| DACTE | Departamento Académico de Ciencias y Tecnologías Empresariales |

Mallas vistas: 2016, 2021, 2022 y 2024. Turnos vistos: Mañana, Tarde y Noche (no forman parte de la plantilla).

---

## 13. Hallazgos en los archivos de ejemplo [X]

| Archivo | Hallazgo | Impacto |
|---|---|---|
| CargaXCarrera | Una hoja por carrera. Título en la fila 1 y cabeceras en la fila 3. | RF-022, RF-023 |
| CargaXCarrera | La columna H se llama "HT" pero es el total (TH). | E03, sección 7.2 |
| CargaXCarrera | SEMESTRE `1-1`/`1-2` convertido por Excel en fechas (`45658`, `45689`, `46023`, `46054`). | Columna GRUPO (P07) |
| CargaXCarrera | Desdoble de práctica escrito como `3 - 1` (HT3 HP2) y `3 - 2` (HT0 HP2). | Desdoble en el sistema (P10) |
| CargaXCarrera | ICO: MALLA 2022 con códigos `…24`. | A01 |
| CargaXCarrera | PSI: código `9.2.5.24` repetido en dos asignaturas distintas. | A03 |
| CargaXCarrera | Fusiones anotadas como texto libre en OBSERVACIONES (`FUSIÓN ADM-4/ICO-4/COM-4`, `Fusión con ADM 3`…). | RF-028 |
| CargaXCarrera | Fusiones con reparto HT/HP distinto (Epistemología ICO 2/2 y COM 4/0; Derechos Humanos). | P14, RF-047 |
| CargaXCarrera | Mismo curso fusionado con DPTO distinto según la carrera (Liderazgo y Trabajo en Equipo: DAHUC y DACTE). | Posible inconsistencia a revisar en la fase 3 |
| CargaXCarrera | Valores con espacios al final (`DER `, `ING `) y fórmulas `=SUM(F:G)` en TH. | RF-024; el parser lee el valor calculado |
| CargaXCarrera | Otras OBSERVACIONES: `ELECTIVO`, `cambio`, `Liz Bernedo como Jefe de práctica`. | Se conservan como texto |
| CargaXDepartamento | Una hoja por departamento. Celdas combinadas por docente; subtotales y totales por carrera; conteos de profesores. | Fase 4 |
| CargaDeDocentes | Datos personales y contractuales del docente, horas por carrera y total de lectivas. | Fase 3 |

---

## 14. Trazabilidad de observaciones del docente → CU-001

| # | Observación del docente | CU-001 original | Resolución (CU-001 actualizado) |
|---|---|---|---|
| O1 | Tablero con el avance de **todas** las carreras (lo valoró como diferencial). | Parcial: solo se mencionaba en el paso 7. | Pasos del tablero en el flujo básico, RF-011 a RF-014. |
| O2 | Ver ciclos anteriores con el mismo detalle, no mediante la bitácora. | Atendida (FA-003), pero referenciaba el paso 6. | Selector de ciclo en el flujo básico; referencia corregida. |
| O3 | Probar el pegado desde el portapapeles. | No aplica al CU. | Pendiente: prueba técnica (sección 15). |
| O4 | Carga en momentos distintos y por usuarios distintos. | Parcial: sin concurrencia. | Bloqueo por carrera, autoguardado (RF-060 a RF-062). |
| O5 | Poder corregir errores sin empezar de cero. | Parcial: sin agregar asignatura ni re-importar. | RF-034 a RF-036, RF-029. |
| O6 | Grupos adicionales. | Atendida (FA-004). | Agregar grupo a asignatura o a semestre. |
| O7 | No fijar 10 semestres. | Atendida. | RF-013. |
| O8 | El ciclo `2027-1` es solo un ejemplo. | Atendida. | Se mantiene "por ejemplo". |
| O9 | Los cursos por jurado van en otro CU. | Atendida. | Fuera de alcance (sección 4). |
| O10 | **Registrado debe ser editable**: avisar, no prohibir. | **No atendida** ("irreversible"). | RF-053, versionado. |
| O11 | **Campo departamento** por curso, con excepciones. | **No atendida** (8 cabeceras sin DPTO). | Columna DPTO obligatoria, editable. |
| O12 | El coordinador ve su carrera; el director ve varias. | Parcial. | RF-002, RF-014, P17. |
| O13 | Carrera sin nada registrado. | Atendida (FA-017). | Además, el tablero muestra *Sin Iniciar*. |
| O14 | Prototipo de pantallas (HTML o AppSheet). | No aplica al CU. | Pendiente: entregable. |
| O15 | Vista por carrera y semestre con cantidad de cursos, como en Sheets. | Parcial. | RF-030. |
| O16 | **Fusión:** no exigir nombre idéntico; advertir en vez de bloquear. | **No atendida** (FA-006, FA-025, FA-026 rígidos). | RF-045 a RF-049. |
| O17 | Desdoble flexible para práctica **o teoría**. | Parcial (solo práctica). | RF-043 y RF-044. |
| O18 | **Eliminar grupo genérico**, no solo por aforo mínimo. | **No atendida** (FA-005, FA-020). | RF-042; aforo fuera de alcance. |
| O19 | AppSheet tiene limitaciones con `.xlsx`. | No aplica al CU. | Se tiene en cuenta al decidir el frontend. |

**Observaciones del Checklist corregidas en CU-001:** la referencia a pasos en FA-003 y FA-016 a FA-018; la lógica duplicada entre FA-003 y FA-012 y entre las cancelaciones; la descripción del actor Director, que incluía asignar docentes (tarea de otro CU); la inconsistencia entre "Director" y "Director de departamento"; el término ambiguo "rango admitido"; la falta de las secciones *Postcondiciones* y *Requisitos especiales*; y un paso de actor que faltaba en la autenticación.

---

## 15. Preguntas abiertas (para el docente o para el equipo)

| # | Pregunta | Para |
|---|---|---|
| Q1 | ¿Cuál es la fórmula oficial de **créditos** a partir de HT y HP? | Docente |
| Q2 | Los Excel usan **DAHUC** ("Humanidades y Com."). ¿La sigla y el nombre oficiales son DAHU? El equipo eligió DAHU (P19). | Docente |
| Q3 | ¿Las horas pueden tener **decimales**? | Docente |
| Q4 | ¿Cuál es el **máximo de subgrupos** en un desdoble parcial? Por ahora es un parámetro configurable. | Docente |
| Q5 | ¿El **Administrador** también puede registrar o editar planes? | Docente |
| Q6 | ¿El plan de ciclo de la **universidad** tiene un estado propio (p. ej. "consolidado") o solo es la suma de las carreras? | Docente |
| Q7 | ¿Un ciclo podrá **cerrarse** en el futuro CU *Administrar ciclos*? Hoy todo es siempre editable (P02). | Docente |
| Q8 | Si se elimina el **grupo principal** de una fusión de tres o más grupos, ¿se disuelve la fusión o se elige otro principal? | Equipo |
| Q9 | ¿Se usará en **celular**? El docente valoró que el Sheet se puede editar desde el móvil. | Docente |
| Q10 | ¿Hay **metas de rendimiento** (tiempo máximo de importación o de respuesta)? | Equipo |
| Q11 | `.csv`: ¿qué delimitador (`,` o `;`) y qué codificación (UTF-8, Windows-1252)? | Equipo |
| Q12 | ¿Se valida que el segmento de semestre del código coincida con SEMESTRE? | Equipo |
| Q13 | **Prueba técnica:** verificar que pegar desde Google Sheets entrega texto tabulado (TSV) en el navegador objetivo. | Equipo |
| Q14 | ¿Qué **frontend** se usará? Si es AppSheet, ver la advertencia sobre `.xlsx`. ¿La lectura del archivo se hace en el frontend o en el backend? | Equipo |
