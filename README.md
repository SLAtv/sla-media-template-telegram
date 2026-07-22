# SLA Media Agent

Agente independiente para generar las placas de invitados de SLA desde Telegram.
No modifica ni depende del runtime de la web original.

## Flujo

1. El usuario envía una foto al bot.
2. El bot pregunta los datos faltantes, uno por vez.
3. Cuando el formulario está completo, genera una placa PNG en 1600×1600.
4. El bot devuelve la imagen y ofrece regenerar, cambiar datos o editar manualmente.

El render server-side reproduce el template y el preset SLA del proyecto original. El MVP usa un flujo conversacional estructurado, sin depender de una API key de IA: es más predecible para completar datos de producción y deja la interpretación libre como una mejora posterior.

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run build
npm test
npm run dev
```

Para conectar Telegram en desarrollo se necesita una URL HTTPS pública (por ejemplo un túnel) y ejecutar:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url":"https://TU_URL/webhook/telegram","secret_token":"TU_SECRET"}'
```

## Producción

Desplegar como servicio Node persistente o serverless con almacenamiento SQLite persistente. Configurar las variables de `.env.example` y registrar el webhook de Telegram. `TELEGRAM_WEBHOOK_SECRET` protege el endpoint; nunca se debe commitear el token del bot ni la API key.

## Botones

- `Cambiar datos`: vuelve a iniciar la captura.
- `Regenerar`: vuelve a crear la imagen con los mismos datos.
- `Editar manualmente`: abre la web original. En esta primera versión no se intenta prellenar `localStorage` entre dominios.
