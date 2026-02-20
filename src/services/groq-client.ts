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
const AI_PROXY_URL = 'https://ai-proxy.promy.workers.dev';

export class GroqClient {
  private model: string;
  private apiKeys: string[];
  private currentKeyIndex = 0;
  private temperature = 0.7;

  constructor(model: string = 'qwen/qwen3-32b', apiKeys: string[] = []) {
    this.model = model;
    this.apiKeys = apiKeys;
    console.log(`🔑 Groq Proxy Client initialized. Model: ${model}. BYOK active: ${apiKeys.length > 0}`);
  }

  /**
   * Get the next API key in the rotation.
   */
  private getNextApiKey(): string | null {
    if (this.apiKeys.length === 0) return null;
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
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

    const apiKey = this.getNextApiKey();
    const endpoint = apiKey ? 'https://api.groq.com/openai/v1/chat/completions' : AI_PROXY_URL;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    let attempt = 0;
    const maxRetries = 3;

    while (attempt <= maxRetries) {
      try {
        console.log(`🚀 Sending request to ${apiKey ? 'Groq Direct (BYOK)' : 'Groq via proxy: ' + endpoint}`);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          signal: signal,
          body: JSON.stringify({
            model: this.model,
            messages: messages,
            temperature: this.temperature
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 429 && attempt < maxRetries) {
            attempt++;
            let waitMs = 5000;
            // Extract the suggested wait time from the Groq error if present
            const msMatch = errText.match(/try again in ([0-9]+)ms/);
            const sMatch = errText.match(/try again in ([0-9.]+)s/);
            
            if (msMatch) {
              waitMs = parseInt(msMatch[1], 10) + 1000; // Add 1s buffer
            } else if (sMatch) {
              waitMs = parseFloat(sMatch[1]) * 1000 + 1000;
            } else {
              waitMs = attempt * 5000; // Fallback: 5s, 10s...
            }
            
            console.warn(`⚠️ Rate limit hit. Retrying in ${Math.round(waitMs)}ms (Attempt ${attempt}/${maxRetries})`);
            
            // Wait for the duration, aborting if the user cancels
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(resolve, waitMs);
              if (signal) {
                signal.addEventListener('abort', () => {
                  clearTimeout(timeout);
                  reject(new Error('Process cancelled by user.'));
                }, { once: true });
              }
            });
            continue;
          }
          throw new Error(`Proxy error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        const text = data.choices[0]?.message?.content || "";
        console.log(`✅ Received response from Groq. Length: ${text.length} chars`);
        return text;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).message === 'Process cancelled by user.') {
          throw e;
        }
        if (attempt < maxRetries && !(e instanceof Error && e.message.includes('Proxy error'))) {
          attempt++;
          const waitMs = attempt * 3000;
          console.warn(`⚠️ Network error. Retrying in ${waitMs}ms...`, e);
          await new Promise<void>((resolve, reject) => {
             const timeout = setTimeout(resolve, waitMs);
             if (signal) {
               signal.addEventListener('abort', () => {
                 clearTimeout(timeout);
                 reject(new Error('Process cancelled by user.'));
               }, { once: true });
             }
          });
          continue;
        }
        console.error("Groq Generate Error:", e);
        throw e;
      }
    }
    throw new Error("Max retries exceeded");
  }

  // Simplified generateStream that returns an async generator just like GeminiClient
  async *generateStream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const apiKey = this.getNextApiKey();
    const endpoint = apiKey ? 'https://api.groq.com/openai/v1/chat/completions' : AI_PROXY_URL;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
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

export function initGroqClient(model?: string, apiKeys: string[] = []): GroqClient {
  clientInstance = new GroqClient(model, apiKeys);
  return clientInstance;
}

export function getGroqClient(): GroqClient {
  if (!clientInstance) {
    throw new Error('Groq client not initialized. Call initGroqClient() first.');
  }
  return clientInstance;
}
