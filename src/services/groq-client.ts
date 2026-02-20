/**
 * Groq API Client via Cloudflare Serverless Proxy
 * This provides the exact same interface as the Gemini Client.
 */

export type ModelType = 
  | 'qwen/qwen3-32b' 
  | 'llama-3.3-70b-versatile' 
  | 'llama-3.1-8b-instant' 
  | 'moonshotai/kimi-k2-instruct';

export const MODEL_RATES: Record<ModelType, { rpm: number; tpm: number; rpd: number; maxChunkSize: number }> = {
  'qwen/qwen3-32b': { rpm: 60, tpm: 6_000, rpd: 1_000, maxChunkSize: 4_000 },
  'llama-3.3-70b-versatile': { rpm: 30, tpm: 12_000, rpd: 1_000, maxChunkSize: 8_000 },
  'llama-3.1-8b-instant': { rpm: 30, tpm: 6_000, rpd: 14_400, maxChunkSize: 4_000 },
  'moonshotai/kimi-k2-instruct': { rpm: 60, tpm: 10_000, rpd: 1_000, maxChunkSize: 6_000 },
};

// TODO: Replace this with your actual Cloudflare Worker URL once deployed!
const AI_PROXY_URL = 'https://ai-proxy.danprav.workers.dev';

export class GroqClient {
  private model: string;
  private temperature = 0.7;

  constructor(model: string = 'qwen/qwen3-32b') {
    this.model = model;
    console.log(`🔑 Groq Proxy Client initialized. Model: ${model}`);
  }

  setModel(model: string): void {
    this.model = model;
    console.log(`🤖 Switched to model: ${model}`);
  }

  getModel(): string {
    return this.model;
  }

  setGenerationConfig(config: any): void {
    if (config.temperature !== undefined) {
      this.temperature = config.temperature;
    }
  }

  async generate(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<string> {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      console.log(`🚀 Sending request to Groq via proxy: ${AI_PROXY_URL}`);
      const response = await fetch(AI_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: signal,
        body: JSON.stringify({
          model: this.model,
          messages: messages,
          temperature: this.temperature
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Proxy error (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content || "";
      console.log(`✅ Received response from Groq. Length: ${text.length} chars`);
      return text;
    } catch (e) {
      console.error("Groq Generate Error:", e);
      throw e;
    }
  }

  // Simplified generateStream that returns an async generator just like GeminiClient
  async *generateStream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(AI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: this.temperature,
        stream: true
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Proxy streaming error (${response.status}): ${errText}`);
    }

    if (!response.body) {
      throw new Error('No response body from proxy');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(dataStr);
            const textChunk = data.choices[0]?.delta?.content;
            if (textChunk) {
              yield textChunk;
            }
          } catch (e) {
            // Ignore parse errors on incomplete JSON lines
          }
        }
      }
    }
  }

  async generateJSON<T>(prompt: string, schema: string, signal?: AbortSignal): Promise<T> {
    const jsonPrompt = `${prompt}

Respond with ONLY valid JSON matching this schema:
${schema}

Do not include any other text, markdown, or explanation. Only output the JSON object.`;

    const responseText = await this.generate(jsonPrompt, undefined, signal);
    const cleanedResponse = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(cleanedResponse) as T;
    } catch (e) {
      console.warn('JSON parse failed in GroqClient, attempting basic match...', e);
      const jsonMatch = responseText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('Failed to extract JSON from Groq response');
    }
  }
}

// Singleton pattern to mimic gemini-client.ts
let clientInstance: GroqClient | null = null;

export function initGroqClient(model?: string): GroqClient {
  clientInstance = new GroqClient(model);
  return clientInstance;
}

export function getGroqClient(): GroqClient {
  if (!clientInstance) {
    throw new Error('Groq client not initialized. Call initGroqClient() first.');
  }
  return clientInstance;
}
