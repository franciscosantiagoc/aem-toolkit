# Proceso de instalación y desarrollo — aem-toolkit

Este repositorio contiene la extensión de VS Code `aem-toolkit`, con su
código fuente en `src/`. Este archivo documenta el proceso de instalación,
compilación y desarrollo.

## 1. Requisitos previos (una sola vez por máquina)

- **Node.js LTS** (18 o superior) y npm. Verifica con:
  ```bash
  node -v
  npm -v
  ```
- **VS Code** (obvio, pero requerido para instalar/probar la extensión).
- No hace falta instalar `vsce` de forma global: el proyecto lo trae como
  dependencia de desarrollo y se invoca con `npx`.

## 2. Instalar la extensión ya empaquetada (`.vsix`)

Esta es la vía rápida cuando ya existe el archivo `.vsix` en la raíz del
repo (por ejemplo `aem-toolkit-0.1.0.vsix`):

1. Abre VS Code.
2. `Ctrl+Shift+P` → escribe **"Extensions: Install from VSIX..."** → Enter.
3. Selecciona el archivo `.vsix`.
4. Recarga la ventana si VS Code lo solicita.
5. Verifica que quedó instalada en el panel de Extensiones (busca el nombre,
   debería aparecer bajo "Installed").

Alternativa por línea de comandos (con `code` en el PATH):

```bash
code --install-extension ruta/a/aem-toolkit-x.y.z.vsix
```

## 3. Compilar y empaquetar desde el código fuente

En la raíz del repo:

```bash
npm install          # instala dependencias (typescript, @types/vscode, @vscode/vsce, etc.)
npm run compile      # compila TypeScript -> out/  (usa "npm run watch" para recompilar en vivo)
npm run package      # genera el .vsix con @vscode/vsce
```

El `.vsix` resultante se instala como se describe en el paso 2.

## 4. Probar la extensión sin empaquetar (modo desarrollo)

1. Abre este repositorio como workspace en VS Code.
2. Presiona **F5** (usa la configuración incluida en `.vscode/launch.json`).
3. Se abre una segunda ventana de VS Code ("Extension Development Host") con
   la extensión ya activa — pruébala ahí antes de empaquetar.

## 5. Estructura del proyecto

```
(raíz del repo)
├── INSTALL.md                     ← este archivo
├── package.json
├── tsconfig.json
├── README.md                      ← qué hace, comandos, configuración
├── CHANGELOG.md
├── LICENSE
├── src/
└── .vscode/launch.json
```

## 6. Versionamiento con git

Ramas de este repositorio:

- **`main`** — solo la guía de instalación (este archivo), punto de partida.
- **`develop`** — rama activa de desarrollo, nace de `main` y trae todo el
  historial de versiones de la extensión.

Flujo normal de trabajo (sobre `develop`):

```bash
git status                 # ver qué cambió
git add -A
git commit -m "descripción breve del cambio"
```

Si en algún momento quieres subir este repositorio a GitHub/GitLab/Azure
DevOps como respaldo remoto:

```bash
git remote add origin <url-del-repo-remoto>
git push -u origin main
git push -u origin develop
```

(Esto es opcional — el repo funciona perfectamente en local sin remoto.)
