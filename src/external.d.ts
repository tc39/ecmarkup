declare module 'html-escape' {
  function escape(text: string): string;
  export = escape;
}

declare module 'promise-debounce' {
  function debounce<TFunc extends (...args: unknown[]) => Promise<unknown>>(
    fn: TFunc,
    ctx?: unknown,
  ): TFunc;
  export = debounce;
}
