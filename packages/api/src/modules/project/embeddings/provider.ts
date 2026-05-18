import { createHash } from "node:crypto";

export interface EmbeddingProvider {
  model: string;
  dimensions: number;
  embedTexts(texts: string[]): Promise<number[][]>;
}

export function embeddingsEnabled() {
  return process.env.ENABLE_CODE_EMBEDDINGS === "true";
}

export function semanticSearchEnabled() {
  return process.env.ENABLE_SEMANTIC_SEARCH === "true";
}

export function getEmbeddingConfig() {
  return {
    provider: process.env.EMBEDDINGS_PROVIDER ?? "fake",
    model: process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small",
    dimensions: Number(process.env.EMBEDDINGS_DIMENSIONS ?? "1536"),
    batchSize: Number(process.env.EMBEDDINGS_BATCH_SIZE ?? "64"),
    tokenBudget: Number(process.env.EMBEDDINGS_TOKEN_BUDGET ?? "50000"),
  };
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  constructor(
    public model = "fake-embedding-model",
    public dimensions = 1536,
  ) {}

  async embedTexts(texts: string[]) {
    return texts.map((text) => deterministicVector(text, this.dimensions));
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    public model: string,
    public dimensions: number,
    private apiKey: string,
  ) {}

  async embedTexts(texts: string[]) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: this.model, dimensions: this.dimensions }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI embeddings request failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return json.data.map((item) => item.embedding);
  }
}

class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;

  constructor(
    public model: string,
    public dimensions: number,
  ) {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  }

  async embedTexts(texts: string[]) {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embeddings request failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as { embeddings: number[][] };
    return json.embeddings;
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const config = getEmbeddingConfig();

  if (config.provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for EMBEDDINGS_PROVIDER=openai");
    return new OpenAIEmbeddingProvider(config.model, config.dimensions, apiKey);
  }

  if (config.provider === "ollama") {
    return new OllamaEmbeddingProvider(config.model, config.dimensions);
  }

  return new FakeEmbeddingProvider(config.model, config.dimensions);
}

function deterministicVector(input: string, dimensions: number) {
  const vector = Array.from({ length: dimensions }, (_, index) => {
    const hash = createHash("sha256").update(`${input}:${index}`).digest();
    return (hash.readUInt32BE(0) / 0xffffffff) * 2 - 1;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
