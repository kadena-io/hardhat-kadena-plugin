import { match } from 'path-to-regexp';

export interface RouteNext<T> {
  success: (msg: string, mimeType: string) => void;
  failure: (msg: string, code: number) => void;
  proxy: (handler: T) => void;
}

type PromiseOrValue<T> = T | Promise<T>;

interface SuccessResult {
  type: 'success';
  result: {
    msg: string;
    mimeType: string;
  };
}

interface FailureResult {
  type: 'failure';
  error: {
    msg: string;
    code: number;
  };
}

interface ProxyResult<T> {
  type: 'proxy';
  handler: T;
}

export interface RouteReturn<T> {
  success: (msg: string, mimeType: string) => SuccessResult;
  failure: (msg: string, code: number) => FailureResult;
  proxy: (handler: T) => ProxyResult<T>;
}

type HandlerType<CTX, PROXY_ARG> = (
  params: Record<string, string>,
  next: RouteReturn<PROXY_ARG>,
  context: CTX,
) => PromiseOrValue<SuccessResult | FailureResult | ProxyResult<PROXY_ARG>>;

export class Router<CTX, PROXY_ARG> {
  private routes: Map<
    string,
    {
      handler: HandlerType<CTX, PROXY_ARG>;
      validate(params: Record<string, undefined | string | string[]>): boolean;
    }
  > = new Map();

  public route(
    route: string,
    handler: HandlerType<CTX, PROXY_ARG>,
    validate: (
      params: Record<string, undefined | string | string[]>,
    ) => boolean = (params) => {
      return Object.values(params).every((v) => typeof v === 'string');
    },
  ) {
    this.routes.set(route, { handler, validate });
  }

  async execute(
    url: string | undefined,
    next: RouteNext<PROXY_ARG>,
    context: CTX,
    tag: string,
  ) {
    if (url === undefined) {
      next.failure('No route found', 404);
      return;
    }
    for (const [route, { handler, validate }] of this.routes.entries()) {
      const matchRoute = match(route);
      const matched = matchRoute(url);
      if (matched && validate(matched.params)) {
        console.log(`[${tag}]`, matched.path);
        try {
          const result = await handler(
            matched.params as Record<string, string>,
            {
              success: (msg, mimeType) => ({
                type: 'success',
                result: { msg, mimeType },
              }),
              failure: (msg, code) => ({
                type: 'failure',
                error: { msg, code },
              }),
              proxy: (handler) => ({
                type: 'proxy',
                handler,
              }),
            },
            context,
          );

          switch (result?.type) {
            case 'success':
              return next.success(result.result.msg, result.result.mimeType);

            case 'failure':
              return next.failure(result.error.msg, result.error.code);

            case 'proxy':
              return next.proxy(result.handler);
            default:
              console.error(
                'the handler must return a valid result ("success" | "failure" | "proxy")',
              );
              return next.failure('Invalid handler result', 500);
          }
        } catch (e) {
          console.error(e);
          return next.failure('Internal server error', 500);
        }
      }
    }

    next.failure(`NOT FOUND: ${url}`, 404);
  }
}
