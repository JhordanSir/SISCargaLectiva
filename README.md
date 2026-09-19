# SISCargaLectiva

Sistema web para planificar la **carga lectiva** de la Universidad La Salle (Arequipa): qué cursos y grupos abre cada carrera en un ciclo y qué docentes los dictan.

Hoy este proceso se lleva en varios Google Sheets separados, uno por carrera y otro por departamento, que hay que mantener sincronizados a mano. SISCargaLectiva los reemplaza por **un solo registro**. Los listados por carrera, por departamento y por docente pasan a ser reportes generados desde ese registro.

## Estado del proyecto

🚧 **Fase 1, en análisis y diseño.** Todavía no hay código: las carpetas `backend/` y `frontend/` están vacías.

| Fase | Caso de uso | Estado |
|---|---|---|
| 1 | **CU-001 Registrar plan de ciclo** | Especificado |
| 2 | Administrar ciclos | Pendiente |
| 3 | Asignar docentes a plan de ciclo | Pendiente |
| 4 | Generar reporte de carga lectiva (por carrera, departamento y docente) | Pendiente |
| 5 | Asignar docentes a cursos por jurado | Pendiente |

## ¿Qué hace la fase 1?

El **Coordinador de carrera** (en sus carreras) o el **Director de departamento** (en cualquier carrera) registra el plan de ciclo de una carrera:

- Carga masiva de la oferta: se pega desde Google Sheets o se sube un `.xlsx` o `.csv` con la plantilla oficial.
- Validación: cualquier error rechaza el archivo completo y se listan todos los errores; las advertencias se señalan en la celda donde ocurren.
- Grilla por semestre para editar celdas, asignaturas y grupos, agregar grupos, hacer desdobles parciales (de práctica o de teoría) y fusionar grupos entre mallas y entre carreras.
- Estados Sin Iniciar → Borrador → Registrado. Un plan Registrado sigue siendo editable y **cada guardado genera una versión**, que se puede comparar y restaurar.
- Tablero con el avance de todas las carreras del ciclo.
- Bloqueo de edición por carrera, con expiración y autoguardado.

El detalle está en [requirements.md](requirements.md) y en [CU-001](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md).

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Java 21, Spring Boot, Maven |
| Base de datos | PostgreSQL, migraciones con Flyway |
| Autenticación | Google OAuth 2.0 (dominio `@ulasalle.edu.pe`) |
| Infraestructura local | Docker Compose (`compose.yml`) |
| Frontend | **Por decidir** (candidatos: SPA con framework JS o Google Apps Script) |

## Estructura del repositorio

```
.
├── backend/                 # API Spring Boot (por crear)
├── frontend/                # Interfaz web (por crear)
├── docs/
│   ├── CU/                  # Casos de uso y diagrama de CU
│   ├── QA/Checklist.md      # Checklist de calidad para casos de uso
│   ├── archivos/            # Excel reales de ejemplo (carga por carrera, departamento y docentes)
│   └── requerimientos/      # Transcripciones de la clase y de las revisiones del docente
├── requirements.md          # Requerimientos consolidados
├── compose.yml              # Servicios locales (por completar)
└── .env.example             # Variables de entorno de ejemplo (por completar)
```

## Puesta en marcha

Aún no aplica: no hay código ejecutable. Esta sección se completará cuando se cree el backend (Spring Boot + PostgreSQL con Docker Compose).

Hay que copiar `.env.example` a `.env` y completar los valores. `.env` no se versiona.

## Documentación

- [requirements.md](requirements.md): requisitos funcionales y no funcionales, reglas de validación, plantilla de importación, hallazgos en los Excel, trazabilidad de las observaciones del docente y preguntas abiertas.
- [docs/CU/CU-001-Registrar-Plan-de-Ciclo.md](docs/CU/CU-001-Registrar-Plan-de-Ciclo.md): caso de uso de la fase 1.
- [docs/QA/Checklist.md](docs/QA/Checklist.md): criterios que debe cumplir cada caso de uso.
