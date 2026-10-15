// @ts-check
/* Tipos del sistema, solo para la documentación y la comprobación con tsc (npm run tipos).
   Este archivo no tiene código: en Apps Script no hace nada. */

/* ============================================================
   Identidad
   ============================================================ */

/**
 * Sigla de una carrera (Dominio.CARRERAS).
 * @typedef {"ING"|"IND"|"ADM"|"DER"|"ARQ"|"PSI"|"COM"|"ICO"|string} Sigla
 */

/**
 * Sigla de un departamento académico (Dominio.DPTOS).
 * @typedef {"DIMA"|"DAHUC"|"DACJ"|"DACTE"} Dpto
 */

/**
 * Documento que se bloquea o se recupera: «plan:ADM» o «carga:DIMA» (Dominio.REF).
 * @typedef {string} Ref
 */

/**
 * Cuenta que hace la llamada, con su rol (Acceso.js). Si no puede entrar, solo trae
 * «denegado» y «codigo» (y el correo, si se conoce).
 * @typedef {Object} Usuario
 * @property {string} [correo]
 * @property {"coordinador"|"director"} [rol]
 * @property {Sigla[]} [carreras] Carreras cuyo plan puede editar.
 * @property {Sigla[]} [coordina]
 * @property {Dpto|""} [departamento] Departamento del director.
 * @property {boolean} [pordefecto] No figura en Usuarios: entró con SIS_ROL_POR_DEFECTO.
 * @property {string} [denegado] Por qué no puede entrar.
 * @property {string} [codigo] Código del contrato de respuestas si se le deniega.
 */

/**
 * Configuración leída de las propiedades del script (Config.js).
 * @typedef {Object} Configuracion
 * @property {string} carpetaId
 * @property {string} bdId
 * @property {string} dominio
 * @property {number} minutosBloqueo
 * @property {number} maxSubgrupos
 * @property {string[]} ciclos
 * @property {string} cicloXlsx
 * @property {number} minutosRevisionXlsx
 * @property {string} rolPorDefecto
 */

/* ============================================================
   Plan de ciclo (CU-001)
   ============================================================ */

/**
 * Grupo de otra carrera con el que está fusionado un grupo.
 * @typedef {Object} MiembroFusion
 * @property {Sigla} carrera
 * @property {string} grupoId
 * @property {string} [codigo]
 * @property {string} [nombre]
 * @property {string|number} [n]
 * @property {boolean} [principal] Es el grupo principal de la sección.
 */

/**
 * Grupo de una asignatura. Las horas se guardan tal como se escribieron.
 * @typedef {Object} Grupo
 * @property {string} id
 * @property {string|number} n
 * @property {string|number} ht
 * @property {string|number} hp
 * @property {string|null} desdoble «PRA×2», «TEO×3»…
 * @property {string|null} fusion Marca de la fusión («F…»).
 * @property {boolean} [fusionPrincipal]
 * @property {MiembroFusion[]} [fusionCon]
 * @property {Object} [previas] Horas y datos antes de fusionar, para deshacer.
 */

/**
 * Asignatura de un plan.
 * @typedef {Object} Asignatura
 * @property {string|number} sem
 * @property {string} malla
 * @property {string} codigo
 * @property {string} nombre
 * @property {string} dpto
 * @property {string} obs
 * @property {Grupo[]} grupos
 */

/**
 * Totales de un plan (Dominio.totales).
 * @typedef {Object<string, *>} Totales
 */

/**
 * Fila de un índice (Planes o Cargas) o de cualquier tabla leída con leerTabla_: los
 * campos de TABLAS_ como texto y _fila, su número de fila.
 * @typedef {Object<string, *> & {_fila: number}} FilaTabla
 */

/**
 * Fila del tablero de un ciclo.
 * @typedef {Object} FilaTablero
 * @property {Sigla} sig
 * @property {string} nombre
 * @property {string} estado
 * @property {number} version
 * @property {Totales|null} totales
 * @property {Bloqueo|null} bloqueo
 * @property {Asignatura[]} contenido
 */

/**
 * Datos de una versión, sin su contenido.
 * @typedef {Object} MetaVersion
 * @property {number} n
 * @property {string} [estado]
 * @property {string} tipo
 * @property {string} usuario
 * @property {string} fecha
 * @property {string} motivo
 * @property {number} [_fila]
 */

/**
 * Lo que el navegador sabe de un bloqueo.
 * @typedef {Object} Bloqueo
 * @property {string} correo
 * @property {string} desde
 * @property {string} expira
 */

/* ============================================================
   Carga docente (CU-002)
   ============================================================ */

/**
 * Parte de una sección que se asigna por separado: T, P, T1…, P1… o C (sin horas).
 * @typedef {Object} Componente
 * @property {string} c
 * @property {"T"|"P"|"C"} tipo
 * @property {string} nombre
 * @property {number} horas
 */

/**
 * Sección que pide docente: un grupo o una fusión entera (Dominio.unidadesDelCiclo).
 * @typedef {Object} Seccion
 * @property {string} id Id del grupo principal.
 * @property {string|null} fusion
 * @property {Sigla} carrera
 * @property {string} codigo
 * @property {string} nombre
 * @property {string|number} sem
 * @property {string} malla
 * @property {string|number} n
 * @property {string} dpto
 * @property {string} obs
 * @property {boolean} intl
 * @property {number} ht
 * @property {number} hp
 * @property {string|null} desdoble
 * @property {Componente[]} componentes
 * @property {Array<{carrera: Sigla, grupoId: string, codigo: string, nombre: string, sem: (string|number), n: (string|number), registrado: boolean}>} miembros
 */

/**
 * Asignación de un docente a un componente de una sección.
 * @typedef {Object} Asignacion
 * @property {string} [id]
 * @property {string} unidad Id del grupo (sección).
 * @property {string|null} [fusion]
 * @property {string} componente
 * @property {string} docente
 * @property {string} [dni]
 * @property {number|string|null} [horas]
 * @property {string} [condicion]
 * @property {string} [dptoCarga] Departamento cuya carga la trae (al calcular).
 * @property {boolean} [heredada]
 */

/**
 * Carga vigente de un departamento.
 * @typedef {Object} Carga
 * @property {number} version
 * @property {string} usuario
 * @property {string} fecha
 * @property {Asignacion[]} asignaciones
 */

/**
 * Docente del catálogo (CargaDeDocentes.xlsx).
 * @typedef {Object} DocenteCatalogo
 * @property {string} dni
 * @property {string} nombreCompleto
 * @property {string} condicion
 * @property {string} categoria
 * @property {string} dpto
 * @property {"TC"|"TP"|""} dedicacion
 * @property {boolean} tcOtra
 * @property {string} cargo
 * @property {number|null} noLectivas
 */

/**
 * Catálogo leído de CargaDeDocentes.
 * @typedef {Object} Catalogo
 * @property {DocenteCatalogo[]} docentes
 * @property {Aviso[]} avisos
 * @property {{tcOtra?: boolean, cargo?: boolean, noLectivas?: boolean}} columnas
 * @property {string} [leidoEn] Cuándo se leyó el archivo (ISO).
 */

/**
 * Advertencia del balance de un docente (A07…A15).
 * @typedef {Object} Advertencia
 * @property {string} codigo
 * @property {"bloqueo"|"severa"|"alerta"|"info"} nivel
 * @property {string} mensaje
 */

/* ============================================================
   Contrato con el navegador
   ============================================================ */

/**
 * Respuesta de todo endpoint (Respuesta.js).
 * @template T
 * @typedef {{ok: true, datos: T} | {ok: false, codigo: string, mensaje: string, detalle: (Object|null)}} Respuesta
 */

/**
 * Aviso para el navegador (Dominio.aviso). El navegador decide por el tipo.
 * @typedef {Object} Aviso
 * @property {string} tipo Uno de Dominio.TIPOS_AVISO.
 * @property {"info"|"aviso"|"error"} nivel
 * @property {string} texto
 * @property {Object|null} datos
 */

/**
 * Copia de recuperación de lo que se editaba sin guardar.
 * @typedef {Object} Recuperacion
 * @property {string} fecha
 * @property {number} versionBase
 * @property {*} contenido
 */

/**
 * Repositorio con versiones (Versionado.js): REPO_PLAN_ o REPO_CARGA_.
 * @typedef {Object} Repo
 * @property {string} indice Pestaña del índice.
 * @property {string} versiones Pestaña de las versiones.
 * @property {string} clave Campo que identifica el documento en un ciclo.
 * @property {string} cache Prefijo de las claves de caché.
 * @property {string} nombre «del plan», «de la carga».
 */

/**
 * Hoja de un libro .xlsx leída sin convertir: cada celda, el texto que mostraría Excel.
 * @typedef {{nombre: string, filas: string[][]}} HojaXlsx
 */

/**
 * Archivos .xlsx de la carpeta de Drive, uno de cada tipo (el más reciente).
 * @typedef {{carrera: (GoogleAppsScript.Drive.File|null), departamento: (GoogleAppsScript.Drive.File|null), docentes: (GoogleAppsScript.Drive.File|null)}} FuentesXlsx
 */
