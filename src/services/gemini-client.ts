/**
 * Gemini API Client with Multi-Key Rotation
 * Supports BYOK (Bring Your Own Key) with automatic failover
 */

import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';

export type ModelType = 
  | 'gemini-3-flash' 
  | 'gemini-3-pro' 
  | 'gemini-2.5-flash' 
  | 'gemma-3-27b-it';

export const MODEL_RATES: Record<ModelType, { rpm: number; tpm: number; rpd: number }> = {
  'gemini-3-flash': { rpm: 30, tpm: 1_000_000, rpd: 1_500 },
  'gemini-3-pro': { rpm: 5, tpm: 250_000, rpd: 50 },
  'gemini-2.5-flash': { rpm: 15, tpm: 1_000_000, rpd: 1_500 },
  'gemma-3-27b-it': { rpm: 30, tpm: 15_000, rpd: 14_400 },
};

interface RateLimitError extends Error {
  status?: number;
}

function isRateLimitError(error: unknown): error is RateLimitError {
  if (error instanceof Error) {
    const rateLimitIndicators = ['429', 'rate limit', 'quota exceeded', 'resource exhausted'];
    const errorStr = error.message.toLowerCase();
    return rateLimitIndicators.some(indicator => errorStr.includes(indicator));
  }
  return false;
}

export class GeminiClient {
  private keys: string[];
  private currentKeyIndex = 0;
  private model: ModelType;
  private generationConfig: GenerationConfig;

  constructor(keys: string[], model: ModelType = 'gemini-3-flash') {
    this.keys = keys.filter(k => k.trim().length > 0);
    this.model = model;
    this.generationConfig = {
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
    };

    if (this.keys.length === 0) {
      console.warn('⚠️ GeminiClient initialized with no API keys');
    }
  }

  /**
   * Rotate to the next API key
   */
  private rotateKey(): void {
    if (this.keys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      console.log(`🔄 Rotated to API key ${this.currentKeyIndex + 1}/${this.keys.length}`);
    }
  }

  /**
   * Get the current API key
   */
  private getCurrentKey(): string {
    if (this.keys.length === 0) {
      throw new Error('No API keys configured. Add a key in Settings.');
    }
    return this.keys[this.currentKeyIndex];
  }

  /**
   * Create a GenerativeModel instance with current key
   */
  private getGenerativeModel(configOverride?: Partial<GenerationConfig>): GenerativeModel {
    const genAI = new GoogleGenerativeAI(this.getCurrentKey());
    return genAI.getGenerativeModel({
      model: this.model,
      generationConfig: { ...this.generationConfig, ...configOverride },
    });
  }

  /**
   * Generate text response with retry on rate limit
   */
  /**
   * Helper to wait for a specified duration
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract retry delay from error message or default to exponential backoff
   */
  private getRetryDelay(error: unknown, attempt: number): number {
    const defaultDelay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s...
    
    if (error instanceof Error) {
      // Look for "Please retry in X s." or similar in the error message
      const match = error.message.match(/retry in (\d+(\.\d+)?)s/i);
      if (match && match[1]) {
        return Math.ceil(parseFloat(match[1]) * 1000) + 500; // Add 500ms buffer
      }
    }
    
    return defaultDelay;
  }

  /**
   * Generate text response with retry on rate limit
   */
  async generate(prompt: string, systemPrompt?: string, configOverride?: Partial<GenerationConfig>): Promise<string> {
    // If we have multiple keys, we try rotation. If single key (or all exhausted), we wait.
    // Total max duration to wait: ~60 seconds
    const maxRetries = 5; 
    let lastError: Error | null = null;
    let currentKeyAttempt = 0;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const model = this.getGenerativeModel(configOverride);

        const fullPrompt = systemPrompt 
          ? `System: ${systemPrompt}\n\nUser: ${prompt}`
          : prompt;

        const result = await model.generateContent(fullPrompt);
        const response = result.response;
        return response.text();
      } catch (error) {
        lastError = error as Error;
        
        if (isRateLimitError(error)) {
          // If we have multiple keys and haven't tried them all yet for this request, rotate
          if (this.keys.length > 1 && currentKeyAttempt < this.keys.length) {
            console.warn(`⚠️ Rate limit hit on key ${this.currentKeyIndex + 1}, rotating...`);
            this.rotateKey();
            currentKeyAttempt++;
            continue; // Retry immediately with new key
          }
          
          // Otherwise, wait and retry
          const delayMs = this.getRetryDelay(error, attempt);
          console.warn(`⏳ Rate limit hit. Waiting ${Math.round(delayMs/1000)}s before retry ${attempt + 1}/${maxRetries}...`);
          await this.delay(delayMs);
        } else {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Failed to generate response after retries');
  }

  /**
   * Generate text with streaming (for real-time updates)
   */
  /**
   * Generate text with streaming (for real-time updates)
   */
  async *generateStream(prompt: string, systemPrompt?: string): AsyncGenerator<string> {
    const maxRetries = 5;
    let currentKeyAttempt = 0;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const model = this.getGenerativeModel();
        const fullPrompt = systemPrompt 
          ? `System: ${systemPrompt}\n\nUser: ${prompt}`
          : prompt;

        const result = await model.generateContentStream(fullPrompt);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            yield text;
          }
        }
        return; // Success, exit generator
      } catch (error) {
        if (isRateLimitError(error)) {
           // If we have multiple keys and haven't tried them all yet for this request, rotate
           if (this.keys.length > 1 && currentKeyAttempt < this.keys.length) {
            console.warn(`⚠️ Rate limit hit on key ${this.currentKeyIndex + 1} (stream), rotating...`);
            this.rotateKey();
            currentKeyAttempt++;
            continue; // Retry immediately
          }
          
          // Otherwise, wait and retry
          const delayMs = this.getRetryDelay(error, attempt);
          console.warn(`⏳ Rate limit hit (stream). Waiting ${Math.round(delayMs/1000)}s before retry ${attempt + 1}/${maxRetries}...`);
          await this.delay(delayMs);
        } else {
          throw error;
        }
      }
    }
    
    throw new Error('Failed to generate stream response after retries');
  }

  /**
   * Generate JSON response (structured output)
   */
  async generateJSON<T>(prompt: string, schema: string): Promise<T> {
    const jsonPrompt = `${prompt}

Respond with ONLY valid JSON matching this schema:
${schema}

Do not include any other text, markdown, or explanation. Only output the JSON object.`;

    const response = await this.generate(jsonPrompt, undefined, { responseMimeType: 'application/json' });
    
    // Clean up response (although JSON mode usually handles this well)
    // Sometimes models wrap in markdown even in JSON mode
    const cleanedResponse = response.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

    try {
      return JSON.parse(cleanedResponse) as T;
    } catch (e) {
      console.warn('JSON parse failed, attempting repair...');
      try {
         const repaired = tryRepairJson(cleanedResponse);
         console.warn('Repaired JSON:', repaired);
         return JSON.parse(repaired) as T;
      } catch (repairError) {
         // Fallback to regex extraction if simple parse fails
         const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
         if (!jsonMatch) {
           console.error('Failed to extract JSON. Raw response:', response);
           throw new Error('Failed to extract JSON from response');
         }
         try {
           return JSON.parse(jsonMatch[0]) as T;
         } catch (innerError) {
           // Try repairing the regex match too
           try {
             const repairedMatch = tryRepairJson(jsonMatch[0]);
             return JSON.parse(repairedMatch) as T;
           } catch (finalError) {
             console.error('Failed to parse extracted JSON. Match:', jsonMatch[0]);
             throw new Error('Failed to parse JSON from response');
           }
         }
      }
    }
  }

  /**
   * Generate embeddings for text (for RAG)
   */
  async embed(text: string): Promise<number[]> {
    const genAI = new GoogleGenerativeAI(this.getCurrentKey());
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  }


  /**
   * Add a new API key
   */
  addKey(key: string): void {
    const trimmedKey = key.trim();
    if (trimmedKey && !this.keys.includes(trimmedKey)) {
      this.keys.push(trimmedKey);
      console.log(`✅ API key added (total: ${this.keys.length})`);
    }
  }

  /**
   * Remove an API key by index
   */
  removeKey(index: number): void {
    if (index >= 0 && index < this.keys.length) {
      this.keys.splice(index, 1);
      if (this.currentKeyIndex >= this.keys.length) {
        this.currentKeyIndex = 0;
      }
    }
  }

  /**
   * Get the number of configured keys
   */
  getKeyCount(): number {
    return this.keys.length;
  }

  /**
   * Switch to a different model
   */
  setModel(model: ModelType): void {
    this.model = model;
    console.log(`🤖 Switched to model: ${model}`);
  }

  /**
   * Get current model
   */
  getModel(): ModelType {
    return this.model;
  }

  /**
   * Update generation config
   */
  setGenerationConfig(config: Partial<GenerationConfig>): void {
    this.generationConfig = { ...this.generationConfig, ...config };
  }
}

/**
 * Attempt to repair truncated/invalid JSON string
 */
function tryRepairJson(jsonStr: string): string {
  let repaired = jsonStr.trim();
  
  // Check if it ends with a comma (common in truncated arrays)
  if (repaired.endsWith(',')) {
    repaired = repaired.slice(0, -1);
  }
  
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    
    if (char === '\\' && inString) {
      escape = !escape;
      continue;
    }
    
    if (char === '"' && !escape) {
      inString = !inString;
    }
    
    if (!inString) {
      if (char === '{') stack.push('}');
      else if (char === '[') stack.push(']');
      else if (char === '}' || char === ']') {
        const expected = stack.length > 0 ? stack[stack.length - 1] : null;
        if (expected === char) {
            stack.pop();
        } 
        // If mismatch, we ignore or it's a structural error we can't easily fix without backtracking
      }
    }
    
    if (escape) escape = false;
  }

  if (inString) {
    repaired += '"'; // Close the open string
  }
  
  // Close remaining containers in reverse order
  while (stack.length > 0) {
    repaired += stack.pop();
  }
  
  return repaired;
}

// Singleton instance
let clientInstance: GeminiClient | null = null;

/**
 * Initialize the Gemini client with keys from secure storage
 */
export function initGeminiClient(keys: string[], model?: ModelType): GeminiClient {
  clientInstance = new GeminiClient(keys, model);
  return clientInstance;
}

/**
 * Get the Gemini client instance
 */
export function getGeminiClient(): GeminiClient {
  if (!clientInstance) {
    throw new Error('Gemini client not initialized. Call initGeminiClient() first.');
  }
  return clientInstance;
}
