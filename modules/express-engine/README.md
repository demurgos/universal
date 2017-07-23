# Angular Express Engine

This is an Express Engine for running Angular Apps on the server for server side rendering.

## Usage

`npm install @nguniversal/express-engine --save`

To use it, set the engine and then route requests to it

```ts
import * as express from 'express';
import { ngExpressEngine } from '@nguniversal/express-engine';

// Set the engine
app.engine('html', ngExpressEngine({
  bootstrap: ServerAppModule // Give it a module to bootstrap
}));

app.set('view engine', 'html');

app.get('/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {
    req,
    res
  });
});
```

## Extra Providers

Extra Providers can be provided either on engine setup

```ts
app.engine('html', ngExpressEngine({
  bootstrap: ServerAppModule,
  providers: [
    ServerService
  ]
}));
```

To use providers for the compiler (for example for i18n), use the `compilerProviders` options.
Make sure to check the section below on cache control if you need different sets of compiler
providers using the same module.

## Advanced Usage

### Request based Bootstrap

The Bootstrap module as well as more providers can be passed on request

```ts
app.get('/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {
    req,
    res,
    bootstrap: OtherServerAppModule,
    providers: [
      OtherServerService
    ]
  });
});
```

### Using the Request and Response

The Request and Response objects are injected into the app via injection tokens.
You can access them by @Inject

```ts
import { Request } from 'express';
import { REQUEST } from '@nguniversal/express-engine/tokens';

@Injectable()
export class RequestService {
  constructor(@Inject(REQUEST) private request: Request) {}
}
```

If your app runs on the client side too, you will have to provide your own versions of these in the client app.

### Using a Custom Callback

You can also use a custom callback to better handle your errors

```ts
app.get('/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {
    req,
    res
  });
}, (err: Error, html: string) => {
  res.status(html ? 200 : 500).send(html || err.message);
});
```

### Cache control

You can use a `string` or `symbol` for the `cacheKey` option to control how the compiled modules are cached.
Using the same `cacheKey` will reuse the same compiled module.

To render the pages, the bootstrap module must be compiled first. In order to reduce overhead, the engine
caches the compiled results and reuses them for subsequent requests.
The default cache-control strategy is to use the object reference of the bootstrap module as the cache key.
For simple uses, this is usually what you want: each module is compiled only once.

The limit of this strategy is if you actually want to have the same bootstrap module compiled multiple
times, with different compiler providers. In order to force them to be cached separately, simply provide
different values for the `cacheKey` option. Each unique value of the `cacheKey` will create a unique
compiled bootstrap module.

Here is an example using `cacheKey` to compile the same application with either the default locale (`en-US`),
the French locale (`fr-FR`) or the Spanish locale (`es-SP`). Note that this is just an example
and you most likely need other providers.

```ts
// English version: there is no `cacheKey` so the reference for `ServerAppModule` will be used
app.get('/en/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {req, res,
    bootstrap: ServerAppModule,
    compilerProvider: [
      {provide: LOCALE_ID, useValue: "en-US"},
    ],
  });
});

// French version: `cacheKey` is `"fr"` so all the pages in `/fr/**/*` will share the same cached result.
app.get('/fr/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {req, res,
    cacheKey: "fr",
    bootstrap: ServerAppModule,
    compilerProvider: [
      {provide: LOCALE_ID, useValue: "fr-FR"},
    ],
  });
});

// Spanish version: `cacheKey` is `"es"` so it will use a compiled version distinct from the one one
// cached with `ServerAppModule` or `"fr"`.
app.get('/es/**/*', (req: Request, res: Response) => {
  res.render('../dist/index', {req, res,
    cacheKey: "es",
    bootstrap: ServerAppModule,
    compilerProvider: [
      {provide: LOCALE_ID, useValue: "es-SP"},
    ],
  });
});
```
