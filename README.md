# TuneX Discord Bot 🎵

Bot de Discord que se une a tu canal de voz y reproduce canciones almacenadas en Firebase (Firestore + Storage) mediante comandos slash.

---

## Índice

1. [Requisitos previos](#1-requisitos-previos)
2. [Crear y configurar el bot en Discord](#2-crear-y-configurar-el-bot-en-discord)
3. [Crear y configurar el proyecto de Firebase](#3-crear-y-configurar-el-proyecto-de-firebase)
4. [Estructura de datos esperada en Firestore](#4-estructura-de-datos-esperada-en-firestore)
5. [Configurar el repositorio / variables de entorno](#5-configurar-el-repositorio--variables-de-entorno)
6. [Registrar los comandos slash en Discord](#6-registrar-los-comandos-slash-en-discord)
7. [Ejecutar con Docker (recomendado)](#7-ejecutar-con-docker-recomendado)
8. [Ejecutar sin Docker (desarrollo local)](#8-ejecutar-sin-docker-desarrollo-local)
9. [Comandos disponibles](#9-comandos-disponibles)
10. [Solución de problemas](#10-solución-de-problemas)

---

## 1. Requisitos previos

| Herramienta | Versión mínima | Instalación |
|---|---|---|
| Node.js | 18 | https://nodejs.org |
| npm | 9 | incluido con Node.js |
| Docker + Docker Compose | cualquiera | https://docs.docker.com/get-docker/ |
| ffmpeg | cualquiera | solo necesario **fuera** de Docker |
| Cuenta de Discord | — | https://discord.com |
| Cuenta de Google/Firebase | — | https://console.firebase.google.com |

---

## 2. Crear y configurar el bot en Discord

### 2.1 Crear la aplicación

1. Ve a **https://discord.com/developers/applications**.
2. Pulsa **New Application** → ponle un nombre (por ejemplo `TuneX`) → **Create**.
3. En la barra lateral, ve a **Bot** → **Add Bot** → confirma.
4. Activa los tres **Privileged Gateway Intents**:
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`
   - `PRESENCE INTENT`  
   *(Los necesitará si en el futuro añades funciones avanzadas; son inofensivos ahora.)*
5. Pulsa **Reset Token** → copia el token y guárdalo en un lugar seguro.  
   ⚠️ **Nunca compartas ni subas al repositorio este token.**

### 2.2 Obtener los IDs necesarios

En la barra lateral ve a **General Information**:

- **Application ID** → esto es tu `DISCORD_CLIENT_ID`.

Para obtener el **Guild ID** (ID de tu servidor):

1. Abre Discord → **Ajustes de usuario → Apariencia → Modo desarrollador: ON**.
2. Haz clic derecho sobre el icono de tu servidor → **Copiar ID**.

### 2.3 Invitar el bot a tu servidor

1. En el portal, ve a **OAuth2 → URL Generator**.
2. En **Scopes** marca: `bot` y `applications.commands`.
3. En **Bot Permissions** marca:
   - `Connect`
   - `Speak`
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
4. Copia la URL generada, pégala en el navegador e invita al bot al servidor.

---

## 3. Crear y configurar el proyecto de Firebase

### 3.1 Crear el proyecto

1. Ve a **https://console.firebase.google.com**.
2. Pulsa **Añadir proyecto** → nombre del proyecto → sigue los pasos (puedes desactivar Google Analytics si no lo necesitas).

### 3.2 Activar Firestore

1. En el panel lateral, ve a **Firestore Database** → **Crear base de datos**.
2. Selecciona el modo **Producción** (lo bloquearemos con reglas).
3. Elige la región más cercana a tu servidor (por ejemplo `europe-west`).

Reglas de seguridad sugeridas (permiten solo escritura desde backend con clave de servicio):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /songs/{songId} {
      allow read: if false;   // solo el SDK Admin puede leer
      allow write: if false;
    }
  }
}
```

> El bot usa el **Admin SDK** con una cuenta de servicio, por lo que las reglas anteriores no le afectan — puede leer y escribir sin restricciones.

### 3.3 Activar Firebase Storage

1. En el panel lateral, ve a **Storage** → **Empezar**.
2. Acepta las reglas por defecto y elige la misma región que Firestore.
3. Copia el nombre del bucket (formato `tu-proyecto.appspot.com` o `tu-proyecto.firebasestorage.app`).  
   Este valor lo usarás como `FIREBASE_STORAGE_BUCKET`.

Reglas de Storage (solo el Admin SDK puede acceder):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3.4 Generar la clave de cuenta de servicio

1. En Firebase Console → **Configuración del proyecto** (icono ⚙️) → **Cuentas de servicio**.
2. Asegúrate de que está seleccionado **Firebase Admin SDK → Node.js**.
3. Pulsa **Generar nueva clave privada** → descarga el archivo JSON.
4. Renómbralo a `serviceAccountKey.json` y colócalo en la **raíz del repositorio**.  
   ⚠️ Este archivo ya está en el `.gitignore` — **nunca lo subas a git**.

---

## 4. Estructura de datos esperada en Firestore

El bot busca canciones en la colección `songs` (configurable con `FIREBASE_SONGS_COLLECTION`).

Cada documento debe tener estos campos:

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `title` | string | ✅ | Nombre de la canción (por defecto, campo de búsqueda principal) |
| `titleLower` | string | — | Campo legado opcional |
| `artist` | string | — | Nombre del artista |
| `artistLower` | string | — | `artist` en minúsculas — para búsqueda por artista |
| `album` | string | — | Álbum |
| `duration` | string | — | Duración legible, p.ej. `"3:45"` |
| `audioUrl` | string | ✅ (*) | URL directa al archivo de audio (pública o firmada) |
| `storagePath` | string | ✅ (*) | Ruta en Firebase Storage si no hay `audioUrl` |
| `coverUrl` | string | — | URL de la portada |
| `genre` | string | — | Género musical |

> (*) Se necesita **uno** de los dos: `audioUrl` o `storagePath`.

**Ejemplo de documento:**

```json
{
  "title": "Bohemian Rhapsody",
  "titleLower": "bohemian rhapsody",
  "artist": "Queen",
  "artistLower": "queen",
  "album": "A Night at the Opera",
  "duration": "5:55",
  "storagePath": "songs/bohemian_rhapsody.mp3",
  "coverUrl": "https://storage.googleapis.com/...",
  "genre": "Rock"
}
```

### Adaptar el bot a tu app existente

Si tu app ya guarda canciones con nombres de campo distintos, el bot ya soporta múltiples nombres comunes:

- Título: `title`, `songName`, `name`, `nombre`
- Artista: `artistName`, `artist`

También puedes personalizar estos campos por variables de entorno:

- `FIREBASE_SONG_TITLE_FIELDS=title,songName,name,nombre`
- `FIREBASE_SONG_ARTIST_FIELDS=artistName,artist`

Si necesitas más ajustes, edita `src/services/firebase.js`:

- Función `searchSongs`: adapta los campos de búsqueda.
- Función `getSongUrl`: añade los nombres de campo donde se guarda la URL.

---

## 5. Configurar el repositorio / variables de entorno

1. Clona el repositorio:

```bash
git clone https://github.com/Ivanmg91/TuneX-Discord-Bot.git
cd TuneX-Discord-Bot
```

2. Copia el archivo de ejemplo y rellénalo:

```bash
cp .env.example .env
```

3. Abre `.env` con tu editor favorito y rellena los valores:

```env
# Token del bot (Discord Developer Portal → Bot → Token)
DISCORD_TOKEN=MTI3...

# Client ID (Discord Developer Portal → General Information → Application ID)
DISCORD_CLIENT_ID=1234567890123456789

# Guild ID del servidor donde quieres los comandos (opcional, para pruebas rápidas)
DISCORD_GUILD_ID=9876543210987654321

# Ruta al JSON de cuenta de servicio (dentro del contenedor = /app/serviceAccountKey.json)
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json

# Bucket de Storage
FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com

# Nombre de la colección de Firestore (por defecto: songs)
FIREBASE_SONGS_COLLECTION=songs
```

4. Coloca `serviceAccountKey.json` en la raíz del repositorio.

---

## 6. Registrar los comandos slash en Discord

Este paso **solo se hace una vez** (y cada vez que añadas o cambies comandos).

### Con Docker

```bash
docker compose run --rm bot node src/deploy-commands.js
```

### Sin Docker

```bash
npm install
node src/deploy-commands.js
```

Salida esperada:

```
[Deploy] Registrando 7 comando(s)…
[Deploy] Modo: Guild (xxxx) — activo de inmediato
[Deploy] ✅ 7 comando(s) registrado(s) correctamente.
```

> Si no has definido `DISCORD_GUILD_ID`, los comandos se registran **globalmente** y pueden tardar hasta 1 hora en aparecer en Discord.

---

## 7. Ejecutar con Docker (recomendado)

Docker incluye Node.js, ffmpeg y todas las dependencias nativas. Cualquiera puede arrancar el bot con dos comandos.

### Primera vez

```bash
# 1. Asegúrate de tener .env y serviceAccountKey.json en la raíz
# 2. Construir la imagen
docker compose build

# 3. Registrar comandos (solo la primera vez)
docker compose run --rm bot node src/deploy-commands.js

# 4. Arrancar el bot en segundo plano
docker compose up -d
```

### Operaciones comunes

```bash
# Ver logs en tiempo real
docker compose logs -f bot

# Parar el bot
docker compose down

# Reiniciar tras cambios en el código
docker compose up -d --build

# Ver estado del contenedor
docker compose ps
```

### Compartir con otros usuarios

Cualquier persona con Docker instalado puede ejecutar el bot:

1. Clonar el repositorio.
2. Crear su `.env` con sus credenciales.
3. Colocar `serviceAccountKey.json`.
4. Ejecutar `docker compose up -d`.

No necesitan instalar Node.js ni ffmpeg — Docker lo gestiona todo.

---

## 8. Ejecutar sin Docker (desarrollo local)

### Requisitos

- Node.js 18+
- ffmpeg instalado en el sistema y disponible en el `PATH`:
  - **macOS**: `brew install ffmpeg`
  - **Ubuntu/Debian**: `sudo apt install ffmpeg`
  - **Windows**: descarga desde https://ffmpeg.org/download.html y añade al PATH

### Pasos

```bash
# Instalar dependencias
npm install

# Registrar comandos
node src/deploy-commands.js

# Arrancar el bot
npm start
```

---

## 9. Comandos disponibles

| Comando | Descripción |
|---|---|
| `/play <cancion>` | Busca la canción en Firebase y la reproduce (o la añade a la cola) |
| `/skip` | Salta la canción actual |
| `/stop` | Detiene la reproducción, vacía la cola y desconecta el bot |
| `/pause` | Pausa o reanuda la canción actual |
| `/queue` | Muestra las canciones en cola |
| `/nowplaying` | Muestra información detallada de la canción actual |
| `/loop` | Activa o desactiva el loop de la canción actual |

---

## 10. Solución de problemas

### El bot no se conecta al canal de voz

- Verifica que el bot tiene los permisos `Connect` y `Speak` en el canal.
- Asegúrate de que estás dentro de un canal de voz al ejecutar `/play`.

### `Error: No audio URL found for this song`

- El documento en Firestore no tiene ni `audioUrl` ni `storagePath`.
- Revisa la sección [Estructura de datos](#4-estructura-de-datos-esperada-en-firestore).

### La búsqueda no encuentra canciones

- Verifica que tus documentos tengan alguno de los campos configurados en `FIREBASE_SONG_TITLE_FIELDS` (por defecto: `title,songName,name,nombre`).
- Si tus campos usan otro nombre, configúralo en `.env`.
- Si renombraste canciones recientemente, el bot ahora prueba búsqueda por el texto exacto y en minúsculas en campos normales (ej. `title`) y usa solo minúsculas en campos `*Lower` (ej. `titleLower`), para mejorar compatibilidad con datos nuevos y heredados.

### `Error: spawn ffmpeg ENOENT`

- ffmpeg no está en el PATH del sistema.
  - **Con Docker**: este error no debería ocurrir (ffmpeg está en la imagen).
  - **Sin Docker**: instala ffmpeg y añádelo al PATH.

### Los comandos slash no aparecen en Discord

- Ejecuta de nuevo `deploy-commands.js`.
- Si usas registro global (sin `DISCORD_GUILD_ID`), espera hasta 1 hora.
- Asegúrate de que el bot tiene el scope `applications.commands` en la URL de invitación.

### `Error: FIREBASE_SERVICE_ACCOUNT_PATH` no encontrado

- Comprueba que `serviceAccountKey.json` está en la raíz del proyecto.
- Con Docker, verifica que el volumen en `docker-compose.yml` apunta al archivo correcto.

### Sonido cortado o con artefactos

- Asegúrate de que el archivo de audio en Firebase Storage tiene un bitrate adecuado (128 kbps o superior recomendado).
- Los formatos soportados son todos los que ffmpeg puede decodificar: MP3, AAC, FLAC, OGG, WAV, etc.

---

## Licencia

MIT
