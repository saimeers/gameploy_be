# gameploy-cdn

Cloudflare Worker que sirve los juegos y las imágenes de Gameploy desde un bucket **R2 privado**, solo
a quien llega con un enlace firmado por la API.

```
API (autoriza y firma) ──► https://cdn-gameploy.saimers.dev/t/<vence>.<firma>/builds/<id>/index.html
Navegador ──► Worker: firma y vencimiento ──► caché de Cloudflare ──► R2 (gameploy-files)
```

- `src/token.js` separa el token de la ruta y verifica la firma con WebCrypto: HMAC-SHA256 de
  `<prefijo>|<vence>` con `CDN_SIGNING_SECRET`, el mismo secreto con el que firma la API
  (`src/utils/cdnToken.js`). El prefijo (`builds/<id>/` o `media/<id>/`) limita el enlace a un juego
  o una imagen.
- `src/index.js` responde 403 si la firma no vale o venció, 404 si no existe, y guarda en la caché de
  Cloudflare con la clave del objeto **sin el token**, para que todos los jugadores compartan la misma
  copia. Sin secreto configurado no sirve nada.
- Sin dependencias. Las pruebas (`npm test`, `node --test`) simulan R2 y la caché, y firman con el
  código real de la API para asegurar que ambos lados coinciden.

## Despliegue

Requisitos: el dominio `saimers.dev` en la misma cuenta de Cloudflare, el bucket R2 `gameploy-files`
creado (privado, sin acceso público) y un secreto aleatorio generado con

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Desde esta carpeta:

```bash
npx wrangler login                          # abre el navegador para autorizar la cuenta
npx wrangler deploy                         # crea el Worker, lo enlaza al bucket y crea el dominio
npx wrangler secret put CDN_SIGNING_SECRET  # pega el secreto cuando lo pida (no queda en el historial)
```

Hasta que el secreto esté puesto, el Worker no sirve ningún archivo (responde 403). La API debe tener el **mismo** valor
en su variable `CDN_SIGNING_SECRET`, y `CDN_URL=https://cdn-gameploy.saimers.dev`.

`wrangler deploy` crea el registro DNS de `cdn-gameploy.saimers.dev`; si ya existía un registro con
ese nombre, hay que borrarlo antes en el panel de DNS.

Comprobación: un enlace inventado debe dar 403. En los enlaces válidos, la cabecera `x-cache` dice si
el archivo salió de la caché del borde (`HIT`) o de R2 (`MISS`).

```bash
curl -I https://cdn-gameploy.saimers.dev/t/1.aaaaaaaaaaaaaaaaaaaaaaaa/builds/x/index.html
```

Para cambiar el secreto: generar uno nuevo, `npx wrangler secret put CDN_SIGNING_SECRET` y el mismo
valor en Railway. Los enlaces ya entregados dejan de valer al instante.

## Costos

R2 da 10 GB gratis al mes y no cobra la descarga. El plan gratis de Workers permite 100 000
peticiones al día (arrancar un juego son unas 10); Workers Paid cuesta 5 USD al mes por 10 millones.
