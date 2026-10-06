# Pulso · motor de publicación

Publica solo, gratis, las piezas que Pulso aprueba. Corre en GitHub Actions cada 20 minutos.

**Cómo funciona**
1. El piloto automático de Pulso (cada mañana) escribe en `cola/` las publicaciones listas de los próximos días.
2. `scripts/render.mjs` dibuja cada pieza con la identidad de su marca y, cuando hace falta, la convierte en video vertical de 9 segundos.
3. `scripts/publicar.mjs` sube cada pieza a su hora a las redes activadas en `config/redes.json` y anota el resultado en `estado/`.
4. `scripts/sitio.mjs` actualiza una página pública por marca en `docs/` (GitHub Pages), lista para insertar en Google Sites.
5. El piloto lee `estado/` y marca cada publicación como publicada en Pulso, con sus enlaces.

## Conexión, una sola vez

Todo se guarda en **Settings → Secrets and variables → Actions → New repository secret**. Cada secreto lleva al final el nombre de la marca: `_BNY`, `_KOTIZO`, `_VARELIA`. Después de conectar una red, cambia a `true` esa red en `config/redes.json`.

### 1. GitHub Pages (para Google Sites)
Settings → Pages → Source: *Deploy from a branch* → `main` / `/docs`. Cada marca queda en `https://<tu-usuario>.github.io/pulso-publicador/<marca>/`.
En Google Sites: **Insertar → Insertar → Por URL**, pega la dirección de la marca y publica el sitio. Se actualiza sola.

### 2. Facebook e Instagram (app gratuita de Meta)
1. Entra a developers.facebook.com → **Mis apps → Crear app** → tipo *Empresa*.
2. Agrega los productos **Facebook Login para empresas** e **Instagram** (API con inicio de sesión de Facebook).
3. Abre **Herramientas → Explorador de la API Graph**, elige tu app y pide los permisos `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
4. Genera el token de usuario, cámbialo por uno de larga duración en **Herramientas → Depurador de tokens → Extender**, y con ese token consulta `me/accounts`: cada página trae su `id` y su `access_token` (este no caduca).
5. Para Instagram consulta `<id-de-la-página>?fields=instagram_business_account`.
6. Guarda por marca: `FB_PAGE_ID_BNY`, `FB_TOKEN_BNY`, `IG_USER_ID_BNY` (y lo mismo con `_KOTIZO`, `_VARELIA`).

Para tus propias páginas no necesitas revisión de Meta: basta con que tu cuenta sea administradora de la app.

### 3. Threads
En la misma app agrega el producto **Threads**, autoriza tu cuenta con `threads_basic` y `threads_content_publish`, y guarda `THREADS_USER_ID_BNY` y `THREADS_TOKEN_BNY`. El token dura 60 días: Pulso te avisa para renovarlo.

### 4. LinkedIn (perfil personal)
1. linkedin.com/developers → **Create app** (puede ligarse a la página de BNY Eventos).
2. En **Products** agrega *Share on LinkedIn* y *Sign In with LinkedIn using OpenID Connect*.
3. Con **OAuth 2.0 tools** genera un token con `openid profile w_member_social`.
4. Consulta `https://api.linkedin.com/v2/userinfo`: el campo `sub` es tu id. Guarda `LINKEDIN_AUTHOR_BNY` = `urn:li:person:<sub>` y `LINKEDIN_TOKEN_BNY`. Dura 60 días.
Publicar como página de empresa requiere que LinkedIn apruebe la *Community Management API*.

### 5. YouTube Shorts
1. console.cloud.google.com → proyecto nuevo → habilita **YouTube Data API v3**.
2. **Pantalla de consentimiento OAuth** (externa, agrega tu correo como usuario de prueba) y **Credenciales → ID de cliente OAuth** (aplicación web, URI de redirección `https://developers.google.com/oauthplayground`).
3. En developers.google.com/oauthplayground (engrane → *Use your own OAuth credentials*) autoriza `https://www.googleapis.com/auth/youtube.upload` y canjea el código por un *refresh token*.
4. Guarda `YT_CLIENT_ID`, `YT_CLIENT_SECRET` y `YT_REFRESH_TOKEN_BNY`.
Google deja en privado los videos que sube un proyecto sin auditar hasta aprobar su auditoría gratuita. Mientras tanto quedan en tu canal listos para hacerlos públicos.

### 6. TikTok
1. developers.tiktok.com → crea una app, agrega **Login Kit** y **Content Posting API** (subida a bandeja).
2. Autoriza tu cuenta con `video.upload` y guarda `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` y `TIKTOK_REFRESH_TOKEN_BNY`.
Cada video llega a tu bandeja de TikTok como borrador: abres la app y tocas Publicar. La publicación directa pública requiere la auditoría de TikTok.

### 7. WhatsApp
WhatsApp no permite publicar estados ni canales de forma automática. Pulso deja cada día la imagen vertical lista para subirla desde la app.

## Probar sin publicar
**Actions → Publicar → Run workflow**. Para simular sin tocar las redes, agrega la variable `PULSO_PRUEBA=1`.
