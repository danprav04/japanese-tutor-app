// polyfills.ts - MUST be imported first in the app entry point
// These polyfills enable LangGraph/LangChain to work with React Native's Hermes engine

import 'react-native-get-random-values';
import { decode, encode } from 'base-64';

// 1. Polyfill Global Crypto & Base64
if (!global.btoa) {
  global.btoa = encode;
}
if (!global.atob) {
  global.atob = decode;
}

// 2. Polyfill TextEncoder (Critical for LangChain internals)
import { TextEncoder, TextDecoder } from 'text-encoding';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// 3. Polyfill Web Streams (Critical for LangGraph streaming)
import { ReadableStream, WritableStream, TransformStream } from 'web-streams-polyfill';
global.ReadableStream = ReadableStream as any;
global.WritableStream = WritableStream;
global.TransformStream = TransformStream;

console.log('✅ Standard Web APIs polyfilled for Hermes engine.');
