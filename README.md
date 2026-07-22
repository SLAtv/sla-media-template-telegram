# SLA Media Agent

Agente open source para generar las placas de invitados de SLA directamente desde Telegram. Recibe una foto, pregunta los datos faltantes y devuelve una pieza PNG lista para publicar.

La implementación es independiente de la web original: comparte el lenguaje visual y el preset de dither, pero no modifica ni depende de su runtime.

## Características

- Flujo conversacional guiado desde Telegram.
- Render server-side en PNG de 1600 × 1600.
- Dither Bayer con la paleta SLA.
- Tipografías Geist convertidas a trazados vectoriales para obtener resultados consistentes en local y serverless.
- Botones para regenerar, cambiar datos o abrir el editor web manual.
- Sin dependencia obligatoria de una API de inteligencia artificial.

## Flujo

1. El usuario envía una foto al bot.
2. El bot pregunta los datos faltantes, uno por vez.
3. Cuando el formulario está completo, genera una placa PNG en 1600×1600.
4. El bot devuelve la imagen y ofrece regenerar, cambiar datos o editar manualmente.

El campo de redes/partners se completa por defecto con `@slatv_ @ceiboargentina`.

## Requisitos

- Node.js 22 o posterior.
- Un bot creado con [BotFather](https://t.me/BotFather).
- Una URL HTTPS pública para recibir el webhook de Telegram.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run build
npm test
npm run dev
```

Variables disponibles:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto del servidor local. |
| `TELEGRAM_BOT_TOKEN` | Token privado entregado por BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto usado para validar los webhooks. |
| `PUBLIC_AGENT_URL` | URL pública del agente. |
| `ORIGINAL_WEB_URL` | URL HTTPS del editor web manual. |
| `DATABASE_PATH` | Ruta de la base SQLite. |

Para conectar Telegram en desarrollo se necesita una URL HTTPS pública (por ejemplo un túnel) y ejecutar:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://TU_URL/webhook/telegram","secret_token":"TU_SECRET"}'
```

## Producción

Puede desplegarse en Vercel o como un servicio Node persistente. Configurá las variables de `.env.example` en el proveedor y registrá el webhook de Telegram.

SQLite en `/tmp` funciona como almacenamiento efímero en entornos serverless. Para conservar sesiones entre reinstancias se recomienda usar un volumen persistente o reemplazar el store por una base administrada.

## Seguridad

- Todos los archivos `.env*` están ignorados, excepto `.env.example`.
- Nunca publiques `TELEGRAM_BOT_TOKEN` ni `TELEGRAM_WEBHOOK_SECRET`.
- No copies valores reales dentro de `.env.example`.
- Si un token se filtra, revocalo inmediatamente desde BotFather y actualizalo en el proveedor de despliegue.

Consultá [SECURITY.md](SECURITY.md) para reportar vulnerabilidades.

## Botones

- `Cambiar datos`: vuelve a iniciar la captura.
- `Regenerar`: vuelve a crear la imagen con los mismos datos.
- `Editar manualmente`: abre la web original. En esta primera versión no se intenta prellenar `localStorage` entre dominios.

## Licencia

El código se publica bajo la [licencia MIT](LICENSE).

Las fuentes Geist se distribuyen bajo SIL Open Font License 1.1. El algoritmo de dither reconoce el trabajo de [Shpigford/dither](https://github.com/Shpigford/dither), publicado bajo MIT. Consultá [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) y la carpeta [LICENSES](LICENSES).

Los nombres, marcas y logotipos de SLA no quedan licenciados bajo MIT salvo autorización expresa de sus titulares.
