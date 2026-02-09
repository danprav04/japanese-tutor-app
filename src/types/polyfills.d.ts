// Type declarations for modules without types

declare module 'text-encoding' {
  export class TextEncoder {
    encode(input?: string): Uint8Array;
  }
  export class TextDecoder {
    decode(input?: BufferSource): string;
  }
}

declare module 'web-streams-polyfill' {
  export const ReadableStream: typeof globalThis.ReadableStream;
  export const WritableStream: typeof globalThis.WritableStream;
  export const TransformStream: typeof globalThis.TransformStream;
}

// Extend global for polyfills
declare global {
  var TextEncoder: typeof import('text-encoding').TextEncoder;
  var TextDecoder: typeof import('text-encoding').TextDecoder;
  var ReadableStream: typeof globalThis.ReadableStream;
  var WritableStream: typeof globalThis.WritableStream; 
  var TransformStream: typeof globalThis.TransformStream;
  var btoa: (data: string) => string;
  var atob: (data: string) => string;
}

export {};
