import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export class AiProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderUnavailableError';
  }
}

export interface AiInvocationResult {
  rawText: string;
  modelName: string;
  groundingSources: Array<{ title: string; uri: string }>;
  durationMs: number;
}

let cachedClient: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 10 && key !== 'MY_GEMINI_API_KEY');
}

export function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new AiProviderUnavailableError(
      'GEMINI_API_KEY is not configured. Configure a valid server-side GEMINI_API_KEY to execute live AI agents.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

export async function invokeStructuredModel(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema?: any;
  useGoogleSearch?: boolean;
  timeoutMs?: number;
}): Promise<AiInvocationResult> {
  const client = getGeminiClient();
  const modelName = 'gemini-4-hydrogen';
  const started = Date.now();
  const timeoutMs = params.timeoutMs ?? 45000;

  const config: Record<string, any> = {
    systemInstruction: params.systemInstruction,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };

  if (params.useGoogleSearch) {
    config.tools = [{ googleSearch: {} }];
  } else if (params.responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = params.responseSchema;
  } else {
    config.responseMimeType = 'application/json';
  }

  const callPromise = client.models.generateContent({
    model: modelName,
    contents: params.prompt,
    config,
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`AI execution timed out after ${timeoutMs}ms`)), timeoutMs)
  );

  const response = await Promise.race([callPromise, timeoutPromise]);
  const rawText = (response.text ?? '').trim();

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundingSources: Array<{ title: string; uri: string }> = [];
  for (const chunk of groundingChunks) {
    if (chunk?.web?.uri) {
      groundingSources.push({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      });
    }
  }

  return {
    rawText,
    modelName,
    groundingSources,
    durationMs: Date.now() - started,
  };
}
