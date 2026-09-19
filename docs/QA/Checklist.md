# Checklist

| Dimensión | Criterio | Descripción | Cumple | Comentario |
|---|---|---|---|---|
| Fondo | Descripción modular | La descripción solamente abarca las acciones específicas del caso de uso, sin expandirse a otras acciones que escapan del alcance de dicho caso de uso. |  |  |
| Fondo | No duplicidad de lógica | La lógica descrita es única para el flujo en el que se está detallando. Las funcionalidades comunes se refieren a flujos alternativos o casos de uso incluidos/extendidos. |  |  |
| Fondo | Nivel de detalle de pasos de flujo | Dentro del caso de uso se maneja el “¿Qué pasa dentro del sistema?”, no contemplando el “¿por qué?” o el “¿cómo?” pasa. Siendo una descripción completa y detallada pero no abarcando más del propio alcance del caso de uso. |  |  |
| Fondo | Flujo completo y lógico | Cada flujo describe correctamente la interacción actor-sistema desde el inicio hasta el resultado, siguiendo una secuencia lógica. |  |  |
| Fondo | Atomicidad del flujo principal | Dentro del flujo principal se maneja solamente un flujo, aún contemplando alternativas que no obstruyan el entendimiento adecuado del mismo. |  |  |
| Fondo | Flujos alternativos identificados | Se describen flujos alternativos relevantes para manejar errores, excepciones o caminos opcionales (e.g., “Asientos no disponibles”, “Pago rechazado”). |  |  |
| Fondo | Requisitos especiales | Se listan requisitos no funcionales relevantes para el caso de uso (e.g., “El tiempo de respuesta debe ser <2 segundos”, “Cumplir con PCI DSS para pagos”), en caso de haberlos. |  |  |
| Fondo | Vinculación directa con documento de visión | El documento de caso de uso debe ser compatible con el documento de visión, en relación al alcance contemplado dentro del documento. |  |  |
| Forma | Estructura formal | El documento está redactado con títulos, subtítulos y párrafos según la plantilla. |  |  |
| Forma | Título claramente identificado | El caso de uso tiene un nombre claro y conciso, comenzando con un verbo en infinitivo (e.g., “Comprar Entradas”). |  |  |
| Forma | Lenguaje claro y preciso | Se utiliza expresiones claramente definidas, evitando terminología ambigua como “aproximadamente”, “posiblemente”, “si es necesario”, “etc”. |  |  |
| Forma | Verbos en presente | Todas las acciones del sistema y del actor se describen en voz activa y en tiempo presente (e.g., “El sistema muestra...”, “El cliente introduce...”). |  |  |
| Forma | Glosario de términos adecuado | Se maneja un glosario de términos adecuado para tomar los acrónimos, simplificaciones y otros términos que puedan no ser de conocimiento común. |  |  |
| Forma | Consistencia terminológica | Los nombres de actores, sistemas, entidades (e.g., “Cliente”, “Entrada”, “Sala”) son consistentes en todo el documento. |  |  |
| Forma | Un paso, una acción | Cada paso en el flujo de eventos describe una única acción o interacción. No se agrupan múltiples acciones del actor o del sistema en un solo paso. |  |  |
| Forma | Redacción profesional | El documento está redactado sin observaciones en puntuación, ortografía y gramática. |  |  |
| Forma | Alineación de párrafos | Los párrafos del documento se encuentran alineados en forma justificada (izquierda y derecha). |  |  |
| Forma | Fuente del texto | El documento hace uso de la fuente de texto de la plantilla, sin presentar variaciones que afecten la uniformidad. |  |  |
| Forma | Contenido de secciones | Toda sección del documento debe tener contenido, es factible colocar “Ninguno” o “No aplica” de darse el caso. Si la sección presenta subsecciones, las subsecciones son las que deben tener contenido. |  |  |
| Forma | Actor(es) correctamente definido(s) | Se lista(n) correctamente el(los) actor(es) principal(es) que interactúan con el sistema. |  |  |
| Forma | Precondiciones definidas y pertinentes | Se listan todas las condiciones que deben ser verdaderas para que el caso de uso comience, es decir el caso de uso tiene una dependencia con las precondiciones descritas dentro del documento. (e.g., “El cliente ha iniciado sesión”, “La cartelera está publicada”). |  |  |

