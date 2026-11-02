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
 * Documento que se bloquea o se recupera: «plan:ADM» o «carga:ADM» (Dominio.REF).
 * @typedef {string} Ref
 */

/**
 * Cuenta que hace la llamada, con su rol (Acceso.js). Si no puede entrar, solo trae
 * «denegado» y «codigo» (y el correo, si se conoce).
 * @typedef {Object} Usuario
 * @property {string} [correo]
 * @property {"coordinador"|"director"} [rol]
 * @property {Sigla[]} [carreras] Carreras que coordina (y cuyo plan puede editar).
 * @property {Dpto|""} [departamento] Departamento del director.
 * @property {boolean} [pordefecto] No figura en Usuarios: entró con SIS_ROL_POR_DEFECTO.
 * @property {string} [denegado] Por qué no puede entrar.
 * @property {string} [codigo] Código del contrato de respuestas si se le deniega.
 */

/**
 * Configuración leída de las propiedades del script (Config.js).
 * @typedef {Object} Configuracion
 * @property {string} bdId
 * @property {string} generacion
 * @property {string} dominio
 * @property {number} minutosBloqueo
 * @property {number} maxSubgrupos
 * @property {string[]} ciclos
 * @property {string} cicloHoja
 * @property {number} minutosRevisionHoja
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
 * @property {Dpto} [derivado] Departamento al que se derivó el curso; sin él, lo asigna el de la carrera.
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
 * @property {string} dpto Departamento que asigna el docente: el de la carrera o al que se derivó.
 * @property {boolean} derivada El curso se derivó a otro departamento.
 * @property {string} dptoAsignatura Lo que dice la columna DPTO (solo informativo).
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
 * @property {string} [carrera] Datos de la sección al asignarla, para mostrarla si deja de existir.
 * @property {string} [codigo]
 * @property {string} [asignatura]
 * @property {string|number} [n]
 * @property {string|number} [sem]
 * @property {string} [cargaDe] Carga de la que sale (al calcular las vigentes).
 * @property {boolean} [heredada]
 */

/**
 * Carga docente vigente de una carrera.
 * @typedef {Object} Carga
 * @property {number} version
 * @property {string} usuario
 * @property {string} fecha
 * @property {Asignacion[]} asignaciones
 */

/**
 * Docente del catálogo (pestaña «Docentes - General»).
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
 * Catálogo leído de la pestaña «Docentes - General».
 * @typedef {Object} Catalogo
 * @property {DocenteCatalogo[]} docentes
 * @property {Aviso[]} avisos
 * @property {{tcOtra?: boolean, cargo?: boolean, noLectivas?: boolean}} columnas
 * @property {string} [leidoEn] Cuándo se leyó la pestaña (ISO).
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
 * Respuesta de toda función que llama el navegador (Respuesta.js).
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
 * Qué datos tiene una pestaña de la hoja del sistema (FuenteHoja.js).
 * @typedef {"usuarios"|"carrera"|"departamento"|"docentes"} TipoPestana
 */

/**
 * Las fuentes de la oferta y del catálogo: todas las pestañas de datos menos Usuarios.
 * @typedef {"carrera"|"departamento"|"docentes"} TipoFuente
 */

/**
 * Pestaña de una fuente: su nombre sin el prefijo («Derecho») y sus celdas tal como se ven.
 * @typedef {{nombre: string, filas: string[][]}} PestanaFuente
 */

/**
 * Las pestañas de cada fuente, en el orden de la hoja.
 * @typedef {{carrera: PestanaFuente[], departamento: PestanaFuente[], docentes: PestanaFuente[]}} FuentesHoja
 */

/**
 * Fila del catálogo leída por catalogoDesdeFilas_ (cu002/logica/CatalogoDocentes.js). r: su
 * índice en las filas de la pestaña.
 * @typedef {Object} FilaCatalogo
 * @property {number} r
 * @property {string} dni
 * @property {string} pat
 * @property {string} nom
 * @property {string} nombreCompleto
 * @property {string} condicion
 * @property {string} categoria
 * @property {string} dptoTexto
 * @property {string} dedicTexto
 * @property {"TC"|"TP"|""} dedicacion
 * @property {boolean} dedicClara
 * @property {boolean} tcOtra
 * @property {string} cargo
 * @property {number|null} noLectivas
 * @property {string} lectivas
 */

/* ============================================================
   Hoja del sistema: revisión, migración y limpieza (hoja/)
   ============================================================ */

/**
 * @typedef {"error"|"advertencia"|"observacion"} NivelHoja
 */

/**
 * Advertencia de una celda de una pestaña de datos (hoja/ReglasHoja.js).
 * @typedef {Object} AvisoCelda
 * @property {string} hoja Nombre completo de la pestaña.
 * @property {number} fila Desde 1.
 * @property {number} col Desde 1.
 * @property {NivelHoja} nivel
 * @property {string} codigo
 * @property {string} mensaje
 */

/**
 * Pestaña de datos que se revisa: su nombre completo, sin el prefijo y sus celdas.
 * @typedef {{nombre: string, original: string, valores: string[][]}} PestanaRevisada
 */

/**
 * Lo que muestra el panel de advertencias (hoja/PanelServidor.js).
 * @typedef {Object} DatosPanel
 * @property {string} generado Hora de la revisión.
 * @property {number} total
 * @property {Object<NivelHoja, number>} cuentas
 * @property {Array<{hoja: string, a1: string, nivel: NivelHoja, codigo: string, mensaje: string}>} items
 */

/**
 * Lo que hay en la BD anterior y en esta hoja (hoja/MigracionServidor.js).
 * @typedef {Object} ResumenMigracion
 * @property {string} nombre
 * @property {string} url
 * @property {string[]} carpetas
 * @property {string} ultimaVersion
 * @property {Array<{nombre: string, anterior: (number|null), actual: (number|null)}>} tablas
 */

/**
 * Archivo o carpeta de la carpeta de la app (hoja/LimpiezaServidor.js).
 * @typedef {Object} ArchivoLimpieza
 * @property {string} id
 * @property {string} nombre
 * @property {string} tipo
 * @property {string} propietario
 * @property {boolean} propio Es de la cuenta que limpia.
 * @property {string} modificado
 * @property {string} ruta Carpeta donde está.
 * @property {string} padre Id de esa carpeta.
 * @property {boolean} carpeta
 * @property {boolean} completa Si es carpeta: se listó todo lo que contiene.
 * @property {boolean} conHoja Si es carpeta: contiene la hoja del sistema.
 * @property {string} url
 * @property {string} aviso
 */

/**
 * Las carpetas de la app y lo que contienen, sin la hoja del sistema.
 * @typedef {Object} ListaLimpieza
 * @property {{id: string, nombre: string, url: string}} hoja
 * @property {Array<{id: string, nombre: string, url: string, conHoja: boolean}>} carpetas
 * @property {ArchivoLimpieza[]} archivos
 */
