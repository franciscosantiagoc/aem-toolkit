# AEM Toolkit

Extensión de VS Code para acelerar el día a día en proyectos AEM (arquetipo Maven: `core` / `ui.apps` / `ui.content` / `ui.config` / `ui.frontend` opcional / `dispatcher` / `all`).

Ver **FEATURES.md** (en esta misma carpeta) para la especificación completa, el roadmap por bloques y el detalle de cada funcionalidad planeada. Ver **CHANGELOG.md** para el índice de changelogs — el detalle línea por línea de cada versión vive en un archivo por versión mayor (`CHANGELOG-1.0.0.md`, `CHANGELOG-2.0.0.md`, …) para que ninguno crezca sin límite.

## Cómo se versiona esta extensión

- **1.0.0** es la primera versión estable. A partir de ella, las mejoras y nuevas funcionalidades se van agregando como versiones **1.x.x**.
- Cuando un conjunto de cambios 1.x.x quede confirmado como estable, se pasa a una nueva versión mayor (**2.0.0**), **sin eliminar ni reescribir** la descripción de 1.0.0 de este README — queda como referencia permanente de lo que esa versión ofrecía.
- Esta sección se amplía con una entrada nueva por cada versión mayor estable (1.0.0, 2.0.0, …), detallando qué hace y en qué se diferencia de la anterior. Para el detalle granular de cada 1.x.x intermedio (mientras se va validando hacia la próxima versión mayor), ver `CHANGELOG-1.0.0.md` (o el archivo de la serie mayor correspondiente — `CHANGELOG-3.0.0.md` para la 3.x.x en curso).

## Versión 3.0.0 (estable) — Bloque 17: Crear componente

Tercera versión mayor estable. Sobre la base de la 2.0.0 (sincronización + editor visual de diálogos), suma todo lo construido a lo largo de la serie **2.1.0 → 2.1.12** (ver `CHANGELOG-2.0.0.md` para el detalle versión por versión): el asistente **"AEM: Crear componente..."** completo.

### Crear componente (Bloque 17 — primera iteración; modelo Sling queda pendiente)

- **"Crear nuevo..." → "Componente"**, clic derecho sobre cualquier carpeta dentro de `ui.apps`: formulario Webview con nombre (validado en vivo contra la convención del proyecto y la ruta resultante), título, grupo de componentes con autocompletado, switch de versionado, switches de estilos/JS con selector de preprocesador (autodetecta el dominante del proyecto, o pide elegir si están mezclados), switch "Añadir al módulo frontend" (si el proyecto tiene `ui.frontend`), y una sección de opciones avanzadas (`_cq_editConfig.xml` de refresco automático, `_cq_design_dialog`, `_cq_template`, placeholder de autoría, apertura automática de estilos/HTML/diálogo al crear).
- **Esquema de versionado "proxy"** (patrón estándar de Adobe): `components/<nombre>` es un proxy sin versión (`sling:resourceSuperType` apuntando a la versión vigente); la implementación real vive en `components/<nombre>/v1`, `v2`... — el proxy se reescribe para apuntar a la versión nueva cada vez que se agrega una.
- **Clic derecho directamente sobre un componente ya existente** resuelve sin pasar por el formulario: si no está versionado, ofrece convertirlo en variante (mueve su contenido a `v1`, lo convierte en proxy y duplica `v1` en `v2`); si ya está versionado, ofrece crear directamente la siguiente versión (duplicando la más alta existente y reescribiendo solo el `sling:resourceSuperType` del proxy).
- **Clientlib consciente de `ui.frontend`**: con frontend activo, los estilos/JS se generan en `ui.frontend/src/main/webpack/components/<nombre>` (o en las 2 carpetas independientes que el usuario elija por separado) y la extensión intenta registrarlos sola en el entrypoint de webpack; sin frontend, se crea una clientlib clásica en `ui.apps` (`clientlibs/clientlib-components/<nombre>`, con CSS y JS en su propia subcarpeta), embebida inline en el HTL con el patrón `clientlib.html` de AEM Core Components — compartida entre todas las versiones de un mismo componente, y nunca sobrescrita si ya existía contenido personalizado ahí.
- **Carpeta de estilos/JS totalmente personalizable**: campo de texto + explorador de carpetas **embebido dentro del propio panel** (no el selector nativo del sistema operativo), confinado a la carpeta raíz del proyecto actual. Con `ui.frontend` y estilos+JS ambos activos, un switch adicional permite editar la ruta de estilos y la de JS de forma independiente (por defecto ambas reflejan la misma carpeta base).
- Todo el XML generado (`.content.xml`, `_cq_dialog`, `_cq_editConfig.xml`, `_cq_design_dialog`, `_cq_template`, clientlib clásica) se escribe ya formateado con el mismo estilo que usa "AEM: Formatear XML".
- El estilo generado arranca con la clase raíz en BEM `.<nombre>-cmp`, ya conectada al elemento raíz del `.html`.
- **Pendiente para una siguiente iteración**: modelo Sling (con/sin modelo) y el componente React/Angular del Bloque 18, que depende de este.

### Comandos

- **AEM: Crear componente...** (submenú "Crear nuevo..." dentro de "AEM Toolkit", clic derecho sobre cualquier carpeta de `ui.apps`) (Bloque 17)

### Configuración adicional (`aemToolkit.*`) sobre la de v2.0.0

- `componentsCreateCssJsByDefault` — genera CSS/JS sin preguntar cada vez al crear un componente.
- `componentsUtilsPath`, `defaultLocales`, `namespace` — ya configurables, preparados para los próximos bloques (i18n, tags, CF Model...) que todavía no están implementados.

## Versión 2.0.0 (estable) — Bloque 2: Sincronización + Bloque 19/20: Editor visual de diálogos

Segunda versión mayor estable. Sobre la base de la 1.0.0 (detección de proyecto + Compilar), suma todo lo construido a lo largo de la serie **1.1.0 → 1.8.1** (ver `CHANGELOG-1.0.0.md` para el detalle versión por versión): subir cambios sin compilar, detección automática del JDK del proyecto, y el editor visual de diálogos con su propio submenú de acceso rápido.

### Subir cambios de front sin compilar (Bloque 2)

- **"AEM: Subir a Author"** / **"AEM: Subir a Publish"**, sobre un archivo o carpeta dentro de `jcr_root` — un archivo sube solo ese archivo, una carpeta sube todo su contenido de forma recursiva.
- Sincroniza directo contra la **API POST de Sling** (sin Maven ni webpack de por medio). Requiere que el nodo padre ya exista en el servidor — pensado para actualizar algo ya instalado, no para crear estructura nueva desde cero.
- **Fix real de fondo**: subir un `.content.xml` ahora lo interpreta localmente nodo por nodo (con sus propiedades y tipos — `{Boolean}`, `{Long}`, arreglos, mixins...) y lo reconstruye como una serie de POSTs normales de Sling, en vez de depender del "Import Operation" (`:contentType=xml`) que no entiende el formato Document View real de FileVault y devolvía HTTP 200 sin aplicar nada. Los diálogos de edición (`_cq_dialog`) se reemplazan por completo (los campos que borres del archivo también se borran en AEM); cualquier otro `.content.xml` solo crea/actualiza, nunca borra.
- Barra de progreso cancelable con un canal de salida ("AEM Toolkit — Sync") que registra el resultado (✔/✘) de cada archivo.
- **"AEM: Configurar credenciales de sincronización..."**: host/puerto de Author y Publish son configuración normal; la contraseña se guarda en VS Code Secret Storage, nunca en `settings.json`.

### Detección automática del JDK requerido por el proyecto

- **⚙️** en la barra de acciones rápidas del panel de Compilar: detectar el JDK de nuevo, configurar carpetas de búsqueda, configurar el JDK a mano, o abrir la configuración completa.
- Lee la versión de Java que el proyecto requiere (`maven.compiler.release`/`target`/`source` o `java.version`) y, si no coincide con la del sistema, busca automáticamente una instalación que sí coincida en `aemToolkit.jdkSearchFolders` (hasta 2 carpetas "contenedoras" de varios JDKs) — sin preguntar nada si la encuentra. Si no puede resolverlo solo, avisa con un banner en el panel y pregunta antes de compilar si de todas formas quieres continuar.
- `aemToolkit.javaHome` fija el JDK a mano para las Tasks de Maven de este proyecto (configuración de workspace, no toca nada global del sistema).

### Editor visual de diálogos (Bloque 19/20 — MVP)

- **"AEM: Editar diálogo..."** (clic derecho sobre `_cq_dialog` o su `.content.xml` en el Explorador) abre un panel dedicado con el diálogo como árbol visual editable: agregar, editar, reordenar y eliminar pestañas, agrupadores (fieldset) y campos.
- **Catálogo de 20 tipos de campo** (labels en inglés — Textfield, Pathfield, Select, Checkbox, Switch, Multifield, Date picker, File upload, Tags, Heading, etc.), con editor dedicado por tipo (valor por defecto, opciones, ruta raíz, tipo de fecha, MIME types...). Cualquier campo de un tipo fuera del catálogo se conserva tal cual al guardar (no se destruye por no tener editor propio).
- **Pestañas verdaderamente opcionales**: un diálogo sin pestañas se edita con sus campos planos directo en la raíz — nunca se envuelve forzosamente en una pestaña "General" sintética. Un botón dedicado las agrega cuando hace falta (moviendo los campos existentes a la primera automáticamente), sin poder anidar una segunda estructura de pestañas dentro de otra. Con más de una pestaña, cada campo se puede mover a otra con un clic (o eligiendo cuál, si hay más de dos).
- **Multicampo (multifield)**: la propiedad real vive en su campo interno repetido (nunca en el contenedor — un bug de duplicado ahí fue la causa real del aviso de "valor repetido" al usarlo en AEM, corregido de fondo), y tanto crearlo como editar su campo interno (tipo, etiqueta, nombre de propiedad) queda cubierto.
- **XML generado con formato propio**: abertura de etiqueta + primer atributo en la primera línea, atributos adicionales uno por línea indentados un nivel más, cierre de etiqueta siempre en su propia línea alineado con su abertura — nunca autocierre, incluso en nodos sin hijos.
- **"AEM: Diálogo"** (nuevo acceso rápido, clic derecho **dentro del código** de un diálogo ya abierto): selector con los 5 tipos más usados — Textfield, Pathfield, Checkbox, Select, Multifield — más "Edición avanzada" para abrir el panel completo. Resuelve solo en qué pestaña insertar (pregunta solo si hay más de una) y ofrece subir el cambio a Author/Publish al toque.
- **📋 "Copiar cómo usarlo"**, ícono en la fila de cada campo (a la izquierda de ✏️ Editar): copia al portapapeles la expresión HTL típica para leer esa propiedad (`${properties.nombre}`) con un comentario del tipo de dato esperado (String, Number, Boolean, Calendar, String[]...) — el tooltip muestra el texto exacto antes de copiarlo.
- **Guardar**: escribe el `.content.xml` en disco y pregunta si se quiere subir el cambio ahora a Author/Publish. El estado de guardado se ve en rojo si falló, verde si salió bien.

### "AEM: Formatear XML" — de propósito general

- Aplica el mismo formato de indentación del editor de diálogos a **cualquier** `.xml` de Document View del proyecto (no solo diálogos): clic derecho sobre uno o varios `.xml` dentro de `jcr_root`. No reescribe el archivo si ya estaba formateado igual.
- Detecta y preserva las namespaces reales del archivo original (más allá de las 4 estándar `jcr`/`sling`/`cq`/`nt`) para no perder namespaces propias (ej. `granite`) al reformatear.

### Menús contextuales agrupados

Todos los comandos anteriores quedan bajo un único submenú desplegable **"AEM Toolkit"** (con el ícono de la barra de actividad) tanto en el Explorador como dentro del código — en vez de aparecer como entradas sueltas mezcladas con el resto del menú contextual de VS Code.

### Comandos

- **AEM: Compilar proyecto...** / **AEM: Repetir última compilación** / **AEM: Mostrar información del proyecto detectado** / **AEM: Actualizar detección de proyecto** (Bloque 1, v1.0.0)
- **AEM: Subir a Author** / **AEM: Subir a Publish** / **AEM: Configurar credenciales de sincronización...** (Bloque 2)
- **AEM: Editar diálogo...** (Explorador) / **AEM: Diálogo** (acceso rápido, dentro del código) (Bloque 19/20)
- **AEM: Formatear XML**

### Configuración adicional (`aemToolkit.*`) sobre la de v1.0.0

- `javaHome`, `jdkSearchFolders` — JDK del proyecto.
- `sync.authorHost`/`authorPort`/`publishHost`/`publishPort`/`username` — destinos de sincronización (la contraseña vive en Secret Storage, no aquí).
- `maxDialogTabs` — tope de pestañas al armar un diálogo.
- `componentsCreateCssJsByDefault`, `defaultLocales`, `namespace`, `componentsUtilsPath` — ya configurables, preparados para los próximos bloques (creación de componentes/clientlibs/i18n, ver `FEATURES.md`) que todavía no están implementados.

## Versión 1.0.0 (estable) — Bloque 1: Cimientos + Compilar

Primera versión estable. Cubre por completo el **Bloque 1** del roadmap (`FEATURES.md`): detección de proyecto y todo el ciclo de compilación, con un panel al estilo IntelliJ.

### Detección de proyecto

- Detecta automáticamente el/los proyecto(s) AEM abiertos en el workspace (busca `pom.xml` con `<modules>`): namespace, módulos, si tiene `ui.frontend`, si tiene `mvnw`, y si tiene `jacoco-maven-plugin` configurado.
- Lee los perfiles Maven tanto del `pom.xml` raíz como de los `pom.xml` de los submódulos de primer nivel (ej. el perfil `fedDev`, definido dentro de `ui.frontend/pom.xml` en algunos proyectos de referencia).
- Si hay más de un proyecto AEM abierto a la vez, deja elegir cuál con un selector con buscador.

### Panel "Compilar", anclado en la barra lateral

- Vista propia en la barra de actividad (ícono a la izquierda, junto a Explorador/Extensiones), con dos secciones: "Acciones" (árbol de comandos) y "Compilar" (el panel).
- El panel de compilar vive **dentro de la barra lateral**, no como pestaña de editor — se abre y enfoca con el comando **AEM: Compilar proyecto...**.

#### Modos de compilación

Un select de "Modo" arriba y los perfiles Maven como checkboxes debajo (se pueden marcar varios a la vez, ej. `autoInstallBundle` + `autoInstallPackage` juntos):

1. **Completa** — front + back + tests (de back, y de front si el proyecto tiene script de test). Es el modo que carga por defecto al abrir el panel.
2. **Solo Front** — corre `aemToolkit.frontBuildCommand` (por defecto `npm run dev`, sin minificar, para que sea fácil de debuggear). Opción de saltar tests de front si el proyecto tiene script de test.
3. **Solo Back** — con tests incluidos por defecto (opción de saltarlos con `-DskipTests`).
4. **Test-coverage Frontend** — solo disponible si el proyecto tiene un script de coverage en `ui.frontend/package.json`; lo corre y muestra el reporte.
5. **Test-coverage Backend** — usa `git status` para saber si hubo cambios en el back desde el último commit: si los hay, compila todo el back y corre tests; si no, solo re-corre los tests. Si falta `jacoco-maven-plugin`, ofrece agregarlo automáticamente (perfil `coverage` en el pom raíz). Al terminar, muestra un panel con el % de coverage por clase, con buscador y filtro por porcentaje.
6. Se puede **guardar el estado del panel como un modo personalizado con nombre** (perfiles, skip tests, destino, argumentos extra) y reutilizarlo después desde el mismo select, o eliminarlo con el ícono 🗑.

Al elegir un modo (o al cargar el panel con el modo por defecto "Completa"), **los perfiles marcados, los checks de saltar tests y los argumentos extra se resetean a los valores por defecto de ese modo** — nunca queda algo "pegado" de un modo elegido antes. Los modos personalizados guardados sí siguen cargando exactamente lo que se guardó en su momento.

#### Destino Author / Publish

Para los modos que instalan en una instancia, se puede elegir destino **Author** (puerto `4502`) / **Publish** (puerto `4503`) / **No aplica**, con host/puerto precargados con esos estándares. Si existe un perfil hermano `<perfil>Publish` (convención vista en los proyectos de referencia, ej. `autoInstallPackage` → `autoInstallPackagePublish`), se usa automáticamente; si no existe, se sobrescriben `-Daem.host`/`-Daem.port` como mejor esfuerzo.

#### Acciones rápidas (estilo ventana "Maven" de IntelliJ)

Fila de íconos arriba del select de Modo, para operaciones puntuales de Maven que usan los perfiles marcados en ese momento en "Perfiles Maven" (no dependen del Modo elegido):

- ▶ **Compilar** — reactor completo (incluye `ui.frontend`), con tests.
- ⚡ **Compilar sin tests** — reactor completo, saltando los tests tanto de back como de front.
- 📥 **Descargar dependencias** (`mvn dependency:resolve`).
- 🗂️ **Generar sources y actualizar carpetas** (`mvn generate-sources`).
- 🧹 **Limpiar** (`mvn clean`).
- 🌳 **Ver árbol de dependencias** (`mvn dependency:tree`).
- 🔍 **Analizar dependencias** — declaradas sin usar / usadas sin declarar (`mvn dependency:analyze`).

Descargar dependencias, generar sources, limpiar, árbol y análisis de dependencias excluyen `ui.frontend` del reactor (`-pl !ui.frontend -am`, igual que "Solo Back"); ▶ y ⚡ sí lo incluyen a propósito.

#### Detener una compilación en curso

Mientras hay una Task corriendo (lanzada desde cualquier botón del panel, o desde el "▶ Compilar" del wizard de Modo), el ícono ▶ se convierte en un **recuadro rojo ⏹** que la detiene al pulsarlo (`TaskExecution.terminate()`), y el resto de los botones se deshabilitan mientras tanto para no lanzar dos compilaciones en paralelo sobre el mismo reactor. Al terminar — bien, con error, o detenida manualmente — todo vuelve a su estado normal, y si fue detenida a mano se avisa explícitamente ("⏹ ... detenida por el usuario.") en vez de mostrarlo como un error con código `undefined`.

### Ejecución

Todo corre como **VS Code Tasks** (no `sendText` a una terminal) — se sigue viendo el output real en un panel de terminal, pero permite encadenar pasos (ej. build → tests) y conocer el código de salida real antes de continuar (ej. antes de leer un reporte de coverage).

### Comandos

- **AEM: Compilar proyecto...**
- **AEM: Repetir última compilación**
- **AEM: Mostrar información del proyecto detectado**
- **AEM: Actualizar detección de proyecto**

### Configuración (`aemToolkit.*`)

- `mavenExecutable` — `auto` / `mvn` / `mvnw`.
- `frontBuildCommand` — comando para "Solo Front" (por defecto `npm run dev`, sin minificar).
- `compilePresets` — modos personalizados guardados (se administran desde el propio panel).
- `componentsCreateCssJsByDefault`, `maxDialogTabs`, `defaultLocales`, `namespace`, `componentsUtilsPath` — ya configurables, preparados para los próximos bloques (creación de componentes/diálogos/i18n) que todavía no están implementados.

## Desarrollo

```bash
npm install
npm run compile   # o: npm run watch
```

Luego F5 en VS Code (`Run Extension`) para abrir una ventana de prueba con la extensión cargada, apuntando a una carpeta que contenga uno de los proyectos AEM de referencia.

Empaquetar (`.vsix`):

```bash
npm run package
```
