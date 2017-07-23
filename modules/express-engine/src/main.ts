import * as fs from 'fs';
import { Request, Response } from 'express';

import { NgModuleFactory, Type, CompilerFactory, Compiler, StaticProvider } from '@angular/core';
import { ResourceLoader } from '@angular/compiler';
import { INITIAL_CONFIG, renderModuleFactory, platformDynamicServer } from '@angular/platform-server';

import { FileLoader } from './file-loader';
import { REQUEST, RESPONSE } from './tokens';

/**
 * These are the allowed options for the engine
 */
export interface NgSetupOptions {
  cacheKey?: string | Symbol;
  bootstrap: Type<{}> | NgModuleFactory<{}>;
  compilerProviders?: StaticProvider[];
  providers?: StaticProvider[];
}

/**
 * These are the allowed options for the render
 */
export interface RenderOptions extends NgSetupOptions {
  req: Request;
  res?: Response;
}

/**
 * This holds a cached version of each index used.
 */
const templateCache: { [key: string]: string } = {};

type CacheKey = string | Symbol | Type<{}>;

/**
 * Map of Module Factories
 */
const factoryCacheMap = new Map<CacheKey, NgModuleFactory<{}>>();

/**
 * This is an express engine for handling Angular Applications
 */
export function ngExpressEngine(setupOptions: NgSetupOptions) {

  const compilerFactory: CompilerFactory = platformDynamicServer().injector.get(CompilerFactory);

  let setupCompilerProviders: StaticProvider[] = [
    { provide: ResourceLoader, useClass: FileLoader, deps: [] },
  ];

  if (setupOptions.compilerProviders) {
    setupCompilerProviders.push(...setupOptions.compilerProviders);
  }

  // Compiler using the providers from `setupOptions`
  const setupCompiler: Compiler = compilerFactory.createCompiler([
    {
      providers: setupCompilerProviders
    }
  ]);

  return function (filePath: string, options: RenderOptions, callback: (err?: Error | null, html?: string) => void) {

    options.providers = options.providers || [];

    try {
      const moduleOrFactory = options.bootstrap || setupOptions.bootstrap;

      if (!moduleOrFactory) {
        throw new Error('You must pass in a NgModule or NgModuleFactory to be bootstrapped');
      }

      setupOptions.providers = setupOptions.providers || [];

      const extraProviders = setupOptions.providers.concat(
        options.providers,
        getReqResProviders(options.req, options.res),
        [
          {
            provide: INITIAL_CONFIG,
            useValue: {
              document: getDocument(filePath),
              url: options.req.originalUrl
            }
          }
        ]);

      // Compile the module only once per distinct cacheKey value
      const cacheKey: CacheKey = options.cacheKey || setupOptions.cacheKey || moduleOrFactory;

      // If the options define some extra compiler providers, create (lazily) a new compiler using them
      let compilerProvider: () => Compiler;
      if (options.compilerProviders) {
        compilerProvider = () => compilerFactory.createCompiler([{
          providers: setupCompilerProviders.concat(options.compilerProviders)
        }]);
      } else {
        compilerProvider = () => setupCompiler;
      }

      getFactory(moduleOrFactory, compilerProvider, cacheKey)
        .then(factory => {
          return renderModuleFactory(factory, {
            extraProviders: extraProviders
          });
        })
        .then((html: string) => {
          callback(null, html);
        }, (err) => {
          callback(err);
        });
    } catch (err) {
      callback(err);
    }
  };
}

/**
 * Get a factory from a bootstrapped module/ module factory
 *
 * @param moduleOrFactory The module to compile (or already compiled factory)
 * @param compilerProvider A function returning the compiler to use if the cache is invalid
 * @param cacheKey The cache key, at most one module will be compiled for each distinct value of `cacheKey`
 * @return The compiled factory
 */
function getFactory(
  moduleOrFactory: Type<{}> | NgModuleFactory<{}>,
  compilerProvider: () => Compiler,
  cacheKey: CacheKey,
): Promise<NgModuleFactory<{}>> {
  return new Promise<NgModuleFactory<{}>>((resolve, reject) => {
    // If module has been compiled AoT
    if (moduleOrFactory instanceof NgModuleFactory) {
      resolve(moduleOrFactory);
      return;
    } else {
      let moduleFactory = factoryCacheMap.get(cacheKey);

      // If module factory is cached
      if (moduleFactory) {
        resolve(moduleFactory);
        return;
      }

      // Compile the module and cache it
      compilerProvider().compileModuleAsync(moduleOrFactory)
        .then((factory) => {
          factoryCacheMap.set(cacheKey, factory);
          resolve(factory);
        }, (err => {
          reject(err);
        }));
    }
  });
}

/**
 * Get providers of the request and response
 */
function getReqResProviders(req: Request, res?: Response): StaticProvider[] {
  const providers: StaticProvider[] = [
    {
      provide: REQUEST,
      useValue: req
    }
  ];
  if (res) {
    providers.push({
      provide: RESPONSE,
      useValue: res
    });
  }
  return providers;
}

/**
 * Get the document at the file path
 */
function getDocument(filePath: string): string {
  return templateCache[filePath] = templateCache[filePath] || fs.readFileSync(filePath).toString();
}
