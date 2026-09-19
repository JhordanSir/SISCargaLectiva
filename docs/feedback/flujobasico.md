### **Transcripción**

**[00:00 - 01:07] Precondiciones y glosario**
* **Expositor (Estudiante):**  
  «...del sector del departamento.  
  Tenemos entre las precondiciones que el usuario haya iniciado sesión con sus credenciales institucionales y cuente con el rol de responsable del plan de ciclo (coordinador de carrera o director), para una determinada carrera o en el rol de administrador del sistema con permisos activos para gestionar la oferta académica.  
  Después tenemos el ciclo académico objetivo, por ejemplo el 2027-1, ha sido aperturado previamente en el sistema por el administrador encontrándose en estado "En Planificación" y dentro del plazo establecido en el calendario institucional.  
  Después, el plan de ciclo para la carrera y el periodo seleccionado se encuentra en estado "Sin Iniciar" o "Borrador", garantizando que la oferta no haya sido cerrada previamente ni congelada para edición.  
  Después, el usuario dispone de la información de la oferta académica estructurada en la plantilla oficial de materias, o la lista para su copia masiva desde Google Sheets con los ocho campos obligatorios.  
  Tenemos el glosario...»

---

**[01:07 - 06:38] Flujo Básico**
* **Expositor (Estudiante):**  
  «Y tenemos el flujo básico:  
  * Primero, el responsable del plan de ciclo accede a la pantalla principal del sistema tras autenticarse con sus credenciales institucionales.  
  * De ahí, el sistema verifica que el usuario en sesión cuente con el rol de responsable del plan de ciclo (coordinador de carrera o directivo/administrador del sistema) y posee permisos activos.  
  * Después, el sistema despliega el menú principal con las opciones autorizadas para el rol del usuario.  
  * Después, el responsable del plan de ciclo selecciona la opción "Gestión de Planes de Ciclo" en el menú de navegación.  
  * El sistema consulta la base de datos de los periodos académicos habilitados en estado "En Planificación" dentro del calendario institucional.  
  * Después, el sistema despliega la pantalla de registro de planes de ciclo, presentando los selectores de ciclo y carrera, el tablero de monitoreo general de carga universitaria con el estado de avance de subida por carreras (cuáles han completado y cuáles están pendientes) y la zona de carga masiva deshabilitada.  
  * Después, el responsable del plan de ciclo selecciona el ciclo académico objetivo (por ejemplo, el 2027-1) en el selector desplegable.  
  * Después, el sistema consulta las carreras profesionales que el usuario tiene autorizadas a su cargo.  
  * El sistema carga en la lista desplegable las carreras autorizadas.  
  * Después, el responsable del plan de ciclo selecciona su carrera profesional (por ejemplo, Ingeniería de Software) en la lista desplegable.  
  * Después, el sistema habilita la zona de carga masiva de la oferta académica en la interfaz.  
  * El sistema presenta la pestaña preferente que puede ser pegar desde Google Sheets o la opción de subir un archivo Excel (XLSX o CSV) y el enlace para descargar la plantilla oficial para poner los datos.  
  * El responsable del plan de ciclo selecciona la pestaña "Pegar desde Google Sheets".  
  * El sistema despliega un área de texto matricial e instrucciones para copiar el rango de celdas con `Ctrl + C` y pegarlo con `Ctrl + V`.  
  * El responsable copia el rango de celdas del documento Google Sheets y pega los datos dentro del área de texto matricial.  
  * El sistema recibe el paquete de datos tabulados pegados en el lector; analiza la estructura delimitadora del texto, tabulaciones y saltos de línea del contenido recibido.  
  * Después, reconstruye en memoria la matriz de filas y columnas correspondientes.  
  * El sistema verifica la presencia exacta de las ocho cabeceras obligatorias del formato: carrera, semestre, código, asignatura, horas teóricas, horas prácticas, el total de horas (que es una suma entre ambas) y las observaciones.  
  * El sistema comprueba que el valor de la columna "Carrera" en todas las filas coincida exactamente con la carrera profesional seleccionada en el paso 7.  
  * Verifica la ausencia de celdas vacías en los campos mandatorios del plan (semestre, código de asignatura, horas teóricas, horas prácticas y total de horas).  
  * Valida la consistencia aritmética de cada fila mediante la igualdad del ciclo (que el total de horas sea efectivamente horas teóricas más horas prácticas).  
  * Deduce automáticamente el año de la malla curricular a partir del sufijo numérico de los códigos de cada asignatura (por ejemplo, 21 para 2021, 24 para 2024, 27 para 2027).  
  * Examina el contenido de la columna de observaciones; identifica la presencia de etiquetas especiales (si es curso por jurado, internacional o virtual). Clasifica los cursos según su condición especial.  
  * Aplica un marcador gráfico distintivo en las filas identificadas para la tabla de vista previa.  
  * Clasifica y agrupa jerárquicamente la información por semestre curricular (del 1 al 10) y por malla curricular y periodo.  
  * Renderiza la grilla de vista previa en bloques semestrales colapsables.  
  * Calcula los totales consolidados de asignaturas, horas teóricas, horas prácticas, total de horas lectivas semanales, grupos proyectados y la deducción automática de créditos a partir del balance horario.  
  * Despliega el panel de resumen global en la cabecera de la vista previa.  
  * Habilita las acciones de conformación y la edición granular directa sobre la vista previa.  
  * El responsable revisa la estructura consolidada en la vista previa y presiona el botón principal "Registrar Plan".  
  * El sistema despliega una ventana modal de confirmación con el resumen consolidado donde muestra carrera, semestre, código, asignatura, horas teóricas, prácticas, total de horas y observaciones.  
  * El sistema presenta el mensaje modal: "¿Desea formalizar el plan del ciclo de la carrera [tal] para el periodo [tal]? Al confirmar, el estado cambiará a 'Registrado', se bloqueará la edición de la oferta y se habilitará la asignación de docentes para los departamentos académicos (Ingeniería, Humanidades, Derecho, etc.)".  
  * El responsable presiona el botón "Confirmar y Registrar" en la ventana modal.  
  * El sistema almacena en la base de datos institucional todos los cursos, grupos, mallas y horas bajo una única transacción atómica.  
  * Registra el evento en la bitácora institucional de auditoría (usuario, carrera, ciclo, fecha, hora, IP y total de asignaturas).  
  * Actualiza el estado de la carrera en el tablero de monitoreo general al 100%.  
  * Envía notificaciones automáticas por correo electrónico a los directores de departamentos académicos involucrados.  
  * Despliega un mensaje flotante de éxito confirmando el registro formal y redirige a la pantalla principal. Fin del flujo básico.»

---

**[08:10 - 11:23] Consulta del docente: Tablero general y consulta de ciclos anteriores**
* **Profesor / Revisor:**  
  «Me parece que también, al igual que los otros grupos, ¿está apareciendo por carrera?»
* **Expositor (Estudiante):**  
  «Sí, en este caso está apareciendo... claro, el estado por carrera.»
* **Profesor / Revisor:**  
  «Pero el plan de ciclo tendría que ser para todos.»
* **Expositor (Estudiante):**  
  «Claro, o sea, el que ingresaba era el director de departamento e iba a mostrar lo que está dentro de sus cursos asignados.»
* **Compañero (Estudiante 2):**  
  «De hecho, está en el paso 6, que se muestra el tablero general de carga universitaria. Ese tablero considera todas las carreras, el progreso de todas las carreras. Adicionalmente de que el usuario esté cargando la tabla, ahí va a estar viendo cómo van los otros planes de ciclo.»
* **Profesor / Revisor:**  
  «Ya, entonces ahí vemos lo de todos, la carga de cada carrera.  
  Ahora, ¿y cómo se maneja el hecho de que tengamos más de un plan? Por ejemplo, ahorita estamos pensando en el plan del 2027-1, pero se supone que también debería poder ver lo que está en el 2026-2.»
* **Compañero (Estudiante 2):**  
  «Eso se puede hacer a través de la bitácora. Al nosotros hacer un log, un usuario tendría que observar esa bitácora. Eso sería más que todo un flujo alternativo, dado que es una condición extra. En ese caso tendría que revisar la bitácora para ver los antecedentes.»
* **Expositor (Estudiante):**  
  «Por la bitácora de auditoría se tiene el registro de anteriores.»
* **Profesor / Revisor:**  
  «A través de la bitácora, ¿pero no podríamos ver el detalle así como lo ven los otros? Si han armado todo para el nuevo plan de ciclo, ¿no podría ser que de esa misma forma podamos ver lo anterior?»
* **Expositor / Compañero:**  
  «Sí se podría... se selecciona en el selector y que pueda seleccionar los ciclos anteriores y que dé la misma información. Eso sería mejor.»
* **Profesor / Revisor:**  
  «Ya, está bien.»

---

**[11:23 - 15:10] Discusión técnica: Control para pegar desde Google Sheets vs. Portapapeles**
* **Profesor / Revisor:**  
  «Ese control que tienen ahí donde dicen que van a leer las filas y columnas, ¿qué control es? Me suena bien, me parece recontra práctico...»
* **Expositor (Estudiante):**  
  «¿El de verificar las celdas vacías?»
* **Profesor / Revisor:**  
  «No, más arriba. Cuando pegan... "Pegar desde Google Sheets". ¿Cómo lo van a hacer?»
* **Expositor (Estudiante):**  
  «En esa parte dice que analiza la estructura delimitada por tabulación y saltos de línea del contenido recibido. Reconstruye en memoria la matriz de filas. Básicamente Google Sheets tiene una estructura que divide entre comas o tabulaciones. Se lee la estructura y se reconstruye.»
* **Profesor / Revisor:**  
  «¿Pero a la hora de sacarlo del portapapeles te lo va a dar así?»
* **Compañero (Estudiante 2):**  
  «Lo que se hace es que se despliega una pantallita que va a ser la zona de carga, que se va a ver prácticamente como Google Sheets. Nada más que él abre su archivo, hace `Ctrl + C` y `Ctrl + V`, como si pegara en un Excel.»
* **Profesor / Revisor:**  
  «¿Qué control es ese?»
* **Expositor (Estudiante):**  
  «Es del propio Sheets. Hay proyectos que utilizan bastante esa lectura.»
* **Profesor / Revisor:**  
  «Pero en Microsoft no creo que utilicen algún control de Microsoft en esa página. Yo entiendo que en una página de Microsoft sí puedes hacer eso, pero acá no.»
* **Compañero (Estudiante 2):**  
  «En el Excel cuando seleccionas unas celdas y pones `Ctrl + C`, al pegarlo en Word se te pega en una tabla directamente. Y al pegarlo en un documento de texto plano, te pone las columnas con una tabulación. Con eso se puede diferenciar.»
* **Profesor / Revisor:**  
  «Sería bueno que hagan una prueba con respecto a eso para ver si realmente va a salir o no.»
* **Compañero (Estudiante 2):**  
  «O si no, implementar una tablita y al momento de pegarlo que identifique la tabla. Tenemos esa opción y también está la de subirlo directamente como archivo (Excel o CSV).»
* **Profesor / Revisor:**  
  «Ya, está bien. La diferencia que tienen ustedes sobre todo respecto a lo que han presentado los compañeros anteriores es el tablero donde se va a ver el resultado de todas las carreras, lo cual es importante.»

---

**[15:10 - 18:36] Cargas asíncronas, concurrencia y manejo de errores**
* **Profesor / Revisor:**  
  «Sobre eso: esto no se va a hacer probablemente en un solo momento. Consideren que puede ser que entre un coordinador en un momento y tiene, por ejemplo, Psicología. Pero el mismo día no necesariamente lo va a llenar Software. Cada carrera lo puede hacer un día distinto; de repente tienen de plazo toda la semana.  
  Ahora, cuando ellos entren, siempre deben ir alimentando el mismo plan de ciclo, ¿no? Consideren que no va a ser en bloque todo en el mismo momento, va a ser en diferentes momentos y por diferentes usuarios.»
* **Compañero (Estudiante 2):**  
  «Claro, por eso siempre marcamos que está "En Planificación". Al momento de ver la tabla general, la idea es que solo una persona lo modifique a la vez por carrera.»
* **Profesor / Revisor:**  
  «¿Y si se equivoca? ¿Cómo solucionan en caso de que se equivoque? Ya lo subió y se equivocó. Porque a veces puede poner: "Ah, voy a tener dos grupos", y después dicen "no, va a ser uno". O pone un grupo y luego dicen "van a ser dos".»
* **Compañero (Estudiante 2):**  
  «Sería un flujo alternativo en el que se puede volver a subirlo o que lo corrija en la misma grilla del sistema.»
* **Profesor / Revisor:**  
  «Claro, deberían tener un flujo alternativo. Porque tal como lo estoy imaginando no veo muchos puntos de edición, veo puntos donde ustedes van a ingresar, pero no me queda claro cómo lo van a editar. El punto es que el usuario se va a equivocar, entonces tienen que darle una salida y que no tenga que hacer todo de cero.  
  Lo de los grupos también debería ser algo que en el flujo alternativo consideren para grupos adicionales o...»
* **Expositor (Estudiante):**  
  «Sí, en caso de agregar un grupo, se agrega otro grupo y va subiendo (grupo 1, grupo 2, grupo 3). También en caso de que se quiera eliminar un grupo, si hay un mínimo de estudiantes requerido...»

---

**[18:36 - 19:58] Observación: Cantidad de semestres por carrera**
* **Profesor / Revisor:**  
  «Algo más que vi en su narrativa, temas de forma: en una parte del flujo mencionaban "los 10 semestres", pero eso no necesariamente se va a dar. Por ejemplo, ahorita en Psicología no podemos tener los 10 semestres porque recién es una carrera nueva, recién están en tercero o cuarto semestre. No podemos exigir que sean 10.»
* **Expositor (Estudiante):**  
  «En ese caso clasifica según lo que tiene, si no hay más no lo coloca.»
* **Profesor / Revisor:**  
  «Pero en el tablero no debe ser un error; debe decir "en tal carrera hay tantos semestres".»
* **Profesor / Revisor 2 / Interviniente:**  
  «Ahora, tampoco pueden ser 10 necesariamente: Derecho tiene 12.»
* **Compañero / Expositor:**  
  «Por eso es mejor no poner el número, que sea de acuerdo a la cantidad de semestres que vamos descargando, no ponerle un número fijo.»

---

**[19:58 - 20:46] Observación: Ciclo académico referencial**
* **Profesor / Revisor:**  
  «Igual, al inicio del documento en alguna parte mencionaron el "2027-1", pero esto no solo debe funcionar para el 2027-1, debe funcionar para el 2027-2, 2028...»
* **Expositor (Estudiante):**  
  «Ah, es un ejemplo. En la precondición pusimos "por ejemplo 2027-1".»
* **Profesor / Revisor:**  
  «Ah, ya, dice "por ejemplo", está bien.»

---

**[20:46 - 21:40] Observación: Cursos por jurado y cierre**
* **Profesor / Revisor:**  
  «Ah, colocaron en una parte cursos por jurado. Pero la parte de cursos por jurado no se va a trabajar desde acá; eso es separado.  
  De hecho, normalmente pasa que toda la carga lectiva al momento que arranca el semestre se tiene, y ya en las primeras semanas de dictado recién aparecen los cursos por jurado. Son tiempos distintos y no es parte de la carga lectiva inicial; la carga lectiva es algo que se da previo, antes de que inicien las clases, y los cursos por jurado se dan durante el desarrollo del ciclo. Es todo un proceso después.»
* **Expositor (Estudiante):**  
  «Entonces sería en otro apartado.»
* **Profesor / Revisor:**  
  «Sí, va a ser otro caso de uso.»
* **Expositor (Estudiante):**  
  «Ya, okay.»
* **Estudiantes / Profesor:**  
  «Muchas gracias. Hasta luego.»