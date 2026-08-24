# AEM Toolkit

Extensión de VS Code para acelerar el día a día en proyectos AEM (arquetipo Maven: `core` / `ui.apps` / `ui.content` / `ui.config` / `ui.frontend` opcional / `dispatcher` / `all`).

Ver **FEATURES.md** (en la raíz de esta carpeta) para la especificación completa, el roadmap por bloques (ordenado por complejidad) y el detalle de cada funcionalidad.

## Estado actual — Bloque 1

- Detección automática del/los proyecto(s) AEM abiertos (módulos Maven, perfiles, si tiene `ui.frontend`, namespace bajo `/apps`).
- Vista propia en la barra de actividad (icono a la izquierda, junto a Explorador/Extensiones).
- **AEM: Compilar proyecto...** — asistente por pasos: ámbito (todo / solo front / solo back / módulos específicos), perfil de instalación Maven, saltar tests, argumentos extra, y opción de guardar la combinación como perfil favorito.
- **AEM: Repetir última compilación** y **AEM: Compilar con perfil guardado...**.
- **AEM: Mostrar información del proyecto detectado**.

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
