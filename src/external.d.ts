declare module "ecmarkdown" {
  export function document(contents: string): string;
  export function fragment(contents: string): string;
}

declare module "html-escape" {
  function escape(text: string): string;
  export = escape;
}

declare module "promise-debounce" {
  function debounce<TFunc extends (...args: any[]) => Promise<any>>(fn: TFunc, ctx?: any): TFunc;
  export = debounce;
}