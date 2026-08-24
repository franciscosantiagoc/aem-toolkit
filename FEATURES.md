# AEM Toolkit — Especificación funcional y roadmap

> Extensión de VS Code para acelerar el desarrollo en proyectos AEM (arquetipo Maven estándar: `core` / `ui.apps` / `ui.content` / `ui.config` / `ui.frontend` opcional / `dispatcher` / `all`). Este archivo es la fuente de verdad de todo lo que se va a construir, para que ninguna idea se pierda entre bloques. Se actualiza en cada bloque: lo hecho se marca `[x]`, lo pendiente queda `[ ]`.
>
> Proyectos de referencia analizados: **gatesconnect-aem**, **gnp-solvimas**, **Repsol-Lubricantes** (y `repsol-portugal`/`gnp-dispatcher`/`gates-aem-dispatcher` como dispatchers hermanos). Todos comparten el arquetipo Maven de Adobe: módulos `all/core/ui.apps/ui.apps.structure/ui.config/ui.content/it.tests/ui.tests`, con `ui.frontend` presente solo en algunos (ej. gatesconnect-aem y gnp-solvimas sí lo tienen; Repsol-Lubricantes no) — la extensión debe **detectar** esto en vez de asumirlo.

## 0. Arquitectura de la extensión

Se sigue el mismo patrón que ya usas en `angular-schematics-free` (mismo repo `extensiones-visual-studio`, rama `feature/aem-toolkit`):

- TypeScript + `vscode` API, compilado con `tsc`, empaquetado con `@vscode/vsce` (`npm run package` → `.vsix`).
- Icono propio en la **barra de actividad** (izquierda, junto a Explorador/Extensiones) con un `viewsContainers.activitybar`, y una vista de árbol (`TreeDataProvider`) que expone todos los comandos organizados por categoría — igual que el árbol "Generadores" de Angular Schematics Free.
- Un comando por funcionalidad (para Command Palette y `keybindings`), agrupados también en menús contextuales (`explorer/context`, `editor/context`) con clausulas `when` para que solo aparezcan donde tienen sentido (ej. "Nuevo componente" solo sobre carpetas dentro de `ui.apps/.../components`).
- `config.ts` centraliza toda la configuración (`aemToolkit.*` en `settings.json`), igual que `angularSchematicsFree.*`.
- **Buscador/filtro en todas las listas de selección**: cualquier `QuickPick` con más de ~6 opciones (componentes existentes, plantillas, campos de diálogo, perfiles Maven, idiomas, tags…) usa `vscode.window.showQuickPick` con `matchOnDescription`/`matchOnDetail` activados y una `placeHolder` que invite a escribir para filtrar. Para selecciones más ricas (formularios de content fragment, tags, diálogos) se usa un **Webview** con un `<input>` de filtro en vivo sobre listas largas (tipos de campo, componentes del proyecto, idiomas).

## 1. Roadmap por bloques (ordenado por complejidad, de menor a mayor)

Cada bloque se construye, se prueba en un proyecto real (gatesconnect-aem / gnp-solvimas / Repsol-Lubricantes) y se comitea antes de pasar al siguiente. El orden es por **complejidad de implementación**, no por prioridad de uso — dos bloques marcados como "elegido para empezar" se adelantan porque son la base de todo lo demás.

| # | Bloque | Complejidad | Estado |
|---|--------|:---:|---|
| 1 | Cimientos: detección de proyecto (multi-módulo, ¿tiene `ui.frontend`?) + vista en barra de actividad + **Compilar proyecto** (front/back/ambos, perfiles, skip tests) | Baja–Media | 🚧 en construcción |
| 2 | **Subir cambios de front sin compilar** (HTML/clientlibs/XML directo al JCR) | Baja–Media | ⏳ pendiente |
| 3 | Crear **tags** (formulario + instrucciones de uso) | Baja | ⏳ |
| 4 | Crear **data-sly-template** en `components/utils` | Baja | ⏳ |
| 5 | Crear **Content Fragment Model** (formulario de atributos + instrucciones de uso) | Media | ⏳ |
| 6 | **Formatear HTL** (indentación automática por apertura/cierre de etiqueta) | Media | ⏳ |
| 7 | Ir a definición: abrir modelo desde `data-sly-use.model` | Baja–Media | ⏳ |
| 8 | Modularizar HTML: seleccionar texto → `data-sly-template` o archivo aparte + `data-sly-include` | Media | ⏳ |
| 9 | Reusar componente existente vía `data-sly-resource` (con id único anti-colisión) | Media | ⏳ |
| 10 | Crear **template de página** (nueva o basada en existente, propiedades por defecto o extendidas) | Media | ⏳ |
| 11 | Crear **Experience Fragment** (componente nuevo o existente) | Media | ⏳ |
| 12 | Editar template de página (agregar componentes, cambiar HTML, clases distintivas) | Media–Alta | ⏳ |
| 13 | Crear **modelo Sling** (normal o consumiendo servicio, con clases/interfaces) | Media–Alta | ⏳ |
| 14 | Crear **servlet** (GET/POST/PUT/DELETE/PATCH) | Media–Alta | ⏳ |
| 15 | Seleccionar texto → convertir a **i18n** (multi-idioma, modal, sustitución, edición posterior) | Media–Alta | ⏳ |
| 16 | Renombrar componente (archivos + modelo + react/angular) | Media–Alta | ⏳ |
| 17 | Crear **componente** completo (versionado, modelo, react opcional, css/js según `ui.frontend`) | Alta | ⏳ |
| 18 | Generar **componente React/Angular** desde un componente ya creado (ajusta modelo, hashmap/mapper estilo `Cart.java`) | Alta | ⏳ |
| 19 | **Diálogos**: formulario dinámico de campos (multifield, pathfield, switch, select, richtext…), visibilidad condicional, extensión de css/js, sincronización con el modelo | Muy alta | ⏳ |
| 20 | Editar diálogos existentes + selección múltiple de componentes para unificar propiedades en tabs/multifield | Muy alta | ⏳ |
| 21 | Diagnósticos en vivo de HTL (etiquetas sin cerrar, errores de sintaxis tipo "Error Lens") | Alta | ⏳ |
| 22 | (Opcional, si es viable) Editar qué contenido se cachea/excluye (dispatcher) | Baja–Media | ⏳ |

## 2. Convenciones detectadas en los proyectos de referencia

- **Maven multi-módulo**: `pom.xml` raíz declara `<modules>` — típicamente `all, core, ui.frontend?, ui.apps, ui.apps.structure, ui.config, ui.content, it.tests, ui.tests`. `ui.frontend` es opcional (Repsol-Lubricantes no lo tiene → sus componentes usan clientlibs "clásicos" con CSS/JS directos en `ui.apps`, sin webpack).
- **Perfiles Maven estándar** encontrados en el pom raíz: `autoInstallBundle` (solo el bundle OSGi, rápido), `autoInstallPackage` (paquete de contenido completo), `autoInstallPackagePublish`, y compilación simple sin perfil (`mvn clean install`, sin desplegar a ninguna instancia).
- **`ui.frontend/package.json`** típico trae scripts `dev`, `prod`, `start` (webpack-dev-server), `watch` (`npm-run-all --parallel start chokidar aemsyncro`), `sync`/`aemsyncro` (vía `aemsync`) y a veces un script `push` que llama a una CLI de vault (`vlt`/`filevault-content-package-maven-plugin` o similar) contra una ruta de clientlib concreta. **Compilar "solo front"** = correr estos scripts npm dentro de `ui.frontend` sin pasar por el reactor Maven completo; **"solo back"** = `mvn clean install -pl '!ui.frontend'` (o `-pl core,ui.apps,...`) para no disparar el build de webpack.
- **Componentes** viven en `ui.apps/src/main/content/jcr_root/apps/<namespace>/components/<nombre>[/v1|v2]/<nombre>`, con `_cq_dialog`, `_cq_design_dialog` y a veces `_cq_template`/`new` (versión inicial "in construction"). El versionado (`v1`, `v2`…) es una convención propia del proyecto, no del arquetipo — la extensión debe **preguntar** si se versiona o no.
- **Modelos Sling** en `core/src/main/java/com/<empresa>/<proyecto>/core/models/<nombre>[/v1]/`, con subcarpetas por versión igual que el componente. `Cart.java` (gatesconnect-aem) es el ejemplo de modelo que expone datos a un componente React vía un `HashMap`/mapper para hidratar el estado inicial del bundle JS — patrón a replicar en el bloque 18.
- **`components/utils`** (ej. `gatesconnect-aem/ui.apps/.../apps/gatesconnect/components/utils`) es donde viven los `data-sly-template` compartidos entre componentes.
- **i18n**: diccionarios como nodos `sling:MessageEntry` bajo `i18n/<idioma>` en `ui.content` (o `ui.apps`), una entrada por `sling:key`/`sling:message`.

## 3. Detalle de las funcionalidades y decisiones de UX

### 3.1 Compilar proyecto (Bloque 1)
Panel Webview (no una cadena de QuickPicks), al estilo de una configuración de ejecución de IntelliJ: un **select de Modo** arriba y, debajo, los **perfiles Maven como checkboxes** (se pueden marcar varios a la vez, ej. `autoInstallBundle` + `autoInstallPackage` juntos — algo que un único QuickPick no permitía bien).

Modos disponibles:
1. **Completa**: front + back + tests (de back, y de front si el proyecto tiene un script de test en `ui.frontend/package.json`). Corre el reactor Maven completo y, si aplica, los tests de front después.
2. **Solo Front**: corre `aemToolkit.frontBuildCommand` (por defecto `npm run dev`, sin Maven). Si hay script de test de front, se puede saltar con un checkbox.
3. **Solo Back**: al elegir este modo se **desmarcan todos los checkboxes y se marcan automáticamente `autoInstallBundle` y `autoInstallPackage`** (los que existan en el proyecto). Corre con tests incluidos por defecto; el usuario puede desmarcar "Saltar tests de Back" para incluirlos, o marcarlo para saltarlos.
4. **Test-coverage Frontend**: solo aparece habilitado si `ui.frontend/package.json` tiene un script de coverage (ej. uno que corra con `--coverage`). Lo corre y muestra el reporte (ver abajo).
5. **Test-coverage Backend**: usa `git status --porcelain` para detectar si hubo cambios en el back desde el último commit guardado. Si los hay, compila todo el back + tests; si no, solo re-corre los tests (para no perder tiempo recompilando). Si el proyecto no tiene `jacoco-maven-plugin` configurado, se ofrece agregarlo automáticamente como un perfil `coverage` en el pom raíz (heredado por todos los módulos, igual que `autoInstallBundle`/`Package`). Al terminar, se muestra un panel con el **% de coverage de líneas por clase**, con buscador por nombre y un filtro "mostrar coverage menor a X%" para ubicar rápido los modelos con poca cobertura. Los tests no se pueden saltar en este modo (son necesarios para calcular coverage).
6. El usuario puede **guardar el estado actual del panel como un modo personalizado con nombre** (perfiles marcados, skip tests de front/back, destino Author/Publish, argumentos extra) — aparece después en el mismo select, bajo "Modos personalizados", y se puede eliminar con el ícono 🗑.

Para los modos que instalan en una instancia (Completa/Solo Back), se muestra además el **destino Author (puerto `4502`) / Publish (puerto `4503`) / No aplica**, con host/puerto precargados con esos estándares (ver perfil hermano `<perfil>Publish`, igual que antes). La detección de perfiles lee tanto el `pom.xml` raíz como los `pom.xml` de los submódulos de primer nivel (ej. `fedDev`, definido dentro de `ui.frontend/pom.xml` en gatesconnect-aem), para que ningún perfil "escondido" en un submódulo se quede fuera de la lista.

La ejecución corre como una **VS Code Task** (no un simple `sendText` a una terminal) — el usuario sigue viendo el output real en un panel de terminal, pero esto permite encadenar pasos (ej. build → tests) y saber si terminó bien antes de continuar (ej. antes de leer el reporte de coverage).

### 3.2 Subir cambios de front sin compilar (Bloque 2)
Sincroniza HTML/clientlibs/XML directo al repositorio (vía `aemsync`/`vlt`/paquete filevault, detectando cuál está disponible en el proyecto) sin pasar por Maven ni webpack. Debe respetar la ruta JCR real (`ui.apps/src/main/content/jcr_root/...`).

### 3.3 Crear componente (Bloque 17)
- Pregunta: ¿versionado o no? ¿con modelo Sling o sin modelo (solo HTL estático)? Si detecta React en `ui.frontend` (por `package.json`/`webpack.config`), pregunta si se quiere generar también el componente React y ajusta el modelo para exponer sus props (ver 3.8).
- Archivos por defecto: `.html`, `_cq_dialog/.content.xml`, `.content.xml` del componente. Si existe módulo `ui.frontend`: el JS/CSS/SASS/LESS (a elección del usuario) va ahí, en la carpeta del componente dentro de `src/main/webpack` o donde el proyecto los tenga. Si **no** existe `ui.frontend`: se crea una `clientlib` propia del componente con su `css.txt`/`js.txt` y archivos `.css`/`.js`.
- Antes de crear, se puede **configurar** (checkbox recordado en settings) si por defecto se generan los archivos CSS/JS o se pregunta cada vez.

### 3.4 Experience Fragment (Bloque 11)
Pregunta si usar un componente ya existente (selector con buscador sobre todos los componentes del proyecto) o crear uno nuevo para el XF.

### 3.5 Template de página (Bloque 10)
Detecta plantillas existentes en `components/page*` (prefijo `page`: `page`, `pagePrivate`, `pagePublic`…) y ofrece reutilizar una o crear nueva. Pregunta si las propiedades de página son las por defecto o se extienden.

### 3.6 Content Fragment Model (Bloque 5)
Abre un **formulario Webview** para definir atributos (nombre, tipo de dato, requerido, valores permitidos…) con botón "+ agregar atributo" y buscador de tipos. Al terminar, genera el CF Model y muestra un panel de instrucciones con snippets HTL (`data-sly-use`) y Java (`ContentFragment` API) listos para copiar.

### 3.7 Tags (Bloque 3)
Formulario Webview similar (id, título por idioma, tag padre) + panel de instrucciones de uso desde HTL (`cq:tags`) y backend (`ResourceResolver#adaptTo(TagManager.class)`).

### 3.8 Modelo Sling / servlet que consume servicio (Bloque 13)
Genera `Model.java` + interfaz si aplica, y si el usuario indica que consume un servicio, genera también la interfaz + implementación `@Component(service=...)` del servicio y el `@Reference` en el modelo, siguiendo el patrón de gatesconnect-aem/gnp-solvimas/Repsol-Lubricantes (paquetes `services`, anotaciones `@Model`, `@ValueMapValue`/`@ChildResource`, `@PostConstruct`).

### 3.9 Servlet (Bloque 14)
Pregunta método(s) HTTP (`GET/POST/PUT/DELETE/PATCH`, multi-select) y explica brevemente el uso típico de cada uno antes de generar (`@SlingServletPaths`/`@Component` con `sling.servlet.methods`).

### 3.10 Diálogos de componente — el corazón de la extensión (Bloque 19)
Webview de formulario dinámico:
- Lista de campos ya soportados por Granite UI con buscador: textfield, textarea, richtext, numberfield, pathfield (con ruta raíz por defecto y filtro de extensiones de archivo permitidas), select, radiogroup, checkbox, switch, multifield, colorfield, datepicker, image upload, etc.
- Por cada campo: nombre técnico, label, descripción/hint, y propiedades específicas del tipo (ej. pathfield → rootPath + filtro; select/radio → opciones con value/label).
- **Visibilidad condicional**: cualquier campo puede declarar "mostrar solo si `<otroCampo>` = `<valor>`" (compatible con select, radiogroup y switch/checkbox como booleano) — se implementa igual que Core Components: `granite:data` con `cq-dialog-showhide-target` sobre el campo controlador, y una clase `cq-dialog-showhide-target-value-<valor>` en cada campo dependiente, más el `clientlib` `cq-dialog-show-hide.js` que ya trae Granite (no requiere JS propio salvo casos avanzados).
- Extensión de CSS/JS del diálogo: si el usuario quiere personalizar apariencia/comportamiento del diálogo (no del componente en sí), se pregunta qué quiere tocar y se genera/edita un `clientlib` de categoría `cq.authoring.dialog`.
- Si el componente ya tiene modelo Sling, las propiedades nuevas del diálogo se agregan automáticamente al modelo (`@ValueMapValue` + getter), sin pisar lo que ya existía.

### 3.11 Editar diálogos + selección múltiple para tabs (Bloque 20)
Sugerencia de flujo:
1. Click derecho sobre **uno o varios** componentes (VS Code permite selección múltiple nativa en el Explorer con Ctrl/Cmd+click o Shift+click; el `menu` `explorer/context` recibe todos los URIs seleccionados si el comando se registra sin filtro de `explorerResourceIsFolder` estricto) → "AEM Toolkit: Agregar propiedades…".
2. Si es **un solo componente**: se abre el mismo formulario de 3.10 mostrando primero las propiedades ya existentes (leídas del `_cq_dialog/.content.xml`) en modo lectura/edición, con un botón "+ agregar más" al final.
3. Si son **varios componentes seleccionados**: antes del formulario se pregunta la estrategia de unificación:
   - **Pestañas (tabs)**: cada componente pasa a ser una pestaña dentro de un diálogo combinado (útil para un "componente contenedor" que agrupa variantes).
   - **Multifield**: las propiedades comunes se agrupan como un único campo repetible.
   - **Cancelar / tratar cada uno por separado**.
4. Al crear un diálogo desde cero (3.10) también se pregunta si se quieren pestañas, cuántas (máximo configurable, por defecto 10 vía `aemToolkit.maxDialogTabs`), y qué propiedades van en cada una — esto se resuelve con un Webview de **dos paneles**: izquierda = lista de pestañas (agregar/quitar/reordenar por drag), derecha = campos de la pestaña seleccionada (agregar/quitar/reordenar), en vez de formularios secuenciales separados, para que el usuario vea la estructura completa mientras arma el diálogo.

### 3.12 `data-sly-template` en `utils` (Bloque 4)
Formulario simple: nombre de la plantilla + lista de atributos que recibe (`data-sly-template.nombre="${@ attr1, attr2}"`). Se crea en `components/utils` del proyecto (ruta detectada, ej. `apps/gatesconnect/components/utils`).

### 3.13 Modularizar HTML (Bloque 8)
Al seleccionar texto en un `.html`, comando contextual con dos opciones: "Extraer a `data-sly-template`" (reemplaza la selección por `data-sly-call` y crea/agrega la plantilla en `utils` o en el mismo archivo) o "Extraer a archivo aparte" (crea `<nombre>.html` en la misma carpeta y reemplaza la selección por `<sly data-sly-include="<nombre>.html" />`, igual que `orderHistoryList.html` en gatesconnect-aem).

### 3.14 Reusar componente vía `data-sly-resource` (Bloque 9)
Sobre una línea vacía del HTL, `QuickPick` con buscador de todos los `resourceType` existentes en el proyecto. El **id** que el usuario escribe (ej. `btn`) se resuelve automáticamente a algo único: se escanea el archivo (y opcionalmente el resto del proyecto) por otros `data-sly-resource="<id>..."`/`data-sly-list` y se agrega un sufijo incremental (`btn-1`, `btn-2`…) — importante para ciclos `data-sly-list`, donde además se sugiere concatenar el índice de iteración (`btn-${itemList.index}`) en vez de un número fijo, para que no colisione entre iteraciones.

### 3.15 i18n desde texto seleccionado (Bloque 15)
Al seleccionar texto en HTL: pedir el nombre de la key i18n, luego un modal Webview con un campo de texto **por cada idioma detectado** en el proyecto (carpetas `i18n/<idioma>`), prellenando todos con el texto original seleccionado (el usuario solo edita los que quiera traducir). Se crea la entrada en cada diccionario y se reemplaza el texto original por `${'<key>' @ i18n}` (o `data-sly-text` según contexto). Si el cursor ya está sobre una key i18n existente, el mismo comando abre el modal en modo edición con los valores actuales por idioma.

### 3.16 Ir a modelo (Bloque 7)
`DefinitionProvider` de VS Code: al Ctrl/Cmd+click (o "Ir a definición") sobre el valor de `data-sly-use.model="com.foo.Model"`, resuelve la clase Java en `core/src/.../models/` y la abre.

### 3.17 Formatear HTL (Bloque 6)
`DocumentFormattingEditProvider` para `.html` de componentes: al detectar cierre de etiqueta o nueva apertura, aplica salto de línea + indentación (respetando `data-sly-*` como atributos, no como elementos). Mismo mecanismo que el formateador Prettier-based de `angular-schematics-free` (`format.ts`), pero con reglas propias para HTL en vez de Angular templates.

### 3.18 Diagnósticos en vivo (Bloque 21)
`DiagnosticCollection` que revisa el documento en cada cambio (`onDidChangeTextDocument`) buscando etiquetas sin cerrar y errores comunes de sintaxis HTL (`data-sly-*` mal escrito, comillas sin cerrar, `${}` sin cerrar), mostrando el subrayado rojo/amarillo nativo de VS Code (no requiere una extensión de "Error Lens" de terceros — los diagnósticos ya se muestran inline si el usuario tiene Error Lens instalado, y en el editor normal aparecen en el margen y al pasar el mouse).

### 3.19 Editar template de página existente (Bloque 12)
Vista de árbol o Webview para: agregar componentes permitidos a un `policy`/`structure`, editar propiedades de la página, cambiar el HTML base de la plantilla, agregar una clase distintiva al `<body>`/contenedor raíz. Cualquier cambio queda reflejado en los archivos reales, así que aparece automáticamente al compilar/desplegar.

### 3.20 Cache/exclusión de contenido (Bloque 22, opcional)
Si el proyecto trae configuración de dispatcher accesible (ver carpetas `*-dispatcher` junto a `AEM/`), ofrecer editar reglas de cache (`/cache/rules`) o exclusión (`/filter`) desde un formulario simple. Se marca como "si es posible" porque depende de que el dispatcher esté en el mismo workspace.

## 4. Configuración de la extensión (`aemToolkit.*`)

- `aemToolkit.defaultBuildScope`: `all` | `front` | `back` — ámbito por defecto al compilar.
- `aemToolkit.defaultInstallProfile`: perfil Maven usado si no se especifica otro.
- `aemToolkit.defaultSkipTests`: boolean.
- `aemToolkit.mavenExecutable`: `mvn` | `./mvnw` (autodetectado si existe `mvnw`, pero editable).
- `aemToolkit.savedBuildProfiles`: perfiles de compilación guardados por el usuario.
- `aemToolkit.componentsCreateCssJsByDefault`: boolean — si al crear componente se generan CSS/JS sin preguntar.
- `aemToolkit.maxDialogTabs`: número máximo de pestañas al crear un diálogo (default `10`).
- `aemToolkit.defaultLocales`: idiomas por defecto a ofrecer en el modal de i18n (autodetectados de `i18n/*` si no se define).
- `aemToolkit.componentsUtilsPath` / `aemToolkit.i18nPath` / `aemToolkit.namespace`: overrides de rutas si la convención del proyecto no coincide con la detectada automáticamente.

## 5. Características adicionales sugeridas (no pedidas explícitamente, para valorar)

- Snippets HTL/Sling Models (`data-sly-use`, `data-sly-list`, anotaciones `@Model` comunes) vía `contributes.snippets`.
- Comando "¿Quién usa este componente?" — busca en todo el proyecto referencias a un `resourceType` dado.
- Explorador de i18n en tabla (todas las keys × todos los idiomas en una vista, editable inline) en vez de ir modal por modal.
- Clonar componente existente con nuevo nombre (duplicar + renombrar en un paso).
- Validación de `_cq_dialog/.content.xml` contra errores comunes de estructura Granite (nodos mal anidados) antes de desplegar.
- Panel de salud del proyecto: versión de AEM/uber-jar detectada, dependencias desactualizadas en `ui.frontend`, perfiles Maven disponibles.
- Integración opcional con Dispatcher (ver 3.20) para previsualizar qué reglas de cache aplican a una página abierta.

---
*Última actualización: Bloque 1 en construcción (cimientos + Compilar proyecto).*
