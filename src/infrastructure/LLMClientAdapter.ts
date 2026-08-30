/**
 * LLMClientAdapter — concrete implementation of the LLMClient interface.
 *
 * Wraps the IBM Watsonx / Granite REST API to provide the
 * `complete(systemPrompt, userMessage) → string` contract expected
 * by all specialist agents.
 *
 * Configuration is read from the centralized config module; this adapter
 * never accesses process.env directly.
 *
 * (ARCHITECTURE.md §15.2, AGENTS.md §13)
 */

import type { LLMClient } from '../agents/Orchestrator.js';
import type { Config } from './config.js';

// ---------------------------------------------------------------------------
// Request / response shapes for Watsonx text-generation endpoint
// ---------------------------------------------------------------------------

interface WatsonxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface WatsonxRequest {
  model_id: string;
  messages: WatsonxMessage[];
  parameters?: {
    max_new_tokens?: number;
    temperature?: number;
  };
}

interface WatsonxChoice {
  message: {
    content: string;
  };
}

interface WatsonxResponse {
  choices: WatsonxChoice[];
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class LLMClientAdapter implements LLMClient {
  private readonly config: Config;
  private readonly baseUrl: string;

  constructor(config: Config) {
    this.config = config;
    // Watsonx.ai inference endpoint — overridable via WATSONX_BASE_URL env var
    this.baseUrl =
      process.env['WATSONX_BASE_URL'] ??
      'https://us-south.ml.cloud.ibm.com/ml/v1/text/chat?version=2023-10-25';
  }

  /**
   * Sends a chat-completion request to the IBM Granite model via Watsonx.
   *
   * @param systemPrompt - Specialist agent instructions
   * @param userMessage  - Assembled code context + analysis task
   * @returns Raw response text (expected to be JSON from agent prompts)
   */
  async complete(systemPrompt: string, userMessage: string): Promise<string> {
    const body: WatsonxRequest = {
      model_id: this.config.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      parameters: {
        max_new_tokens: 4096,
        temperature: 0.1,
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.agentTimeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '(no body)');
      throw new Error(
        `LLM API error ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const json = (await response.json()) as WatsonxResponse;
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('LLM response contained no text content.');
    }

    return content;
  }
}
