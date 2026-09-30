/**
 * Puerto del proveedor de IA. El dominio no conoce OpenAI, Anthropic, etc.
 * La interfaz expone "respondToChat" que recibe contexto y herramientas
 * disponibles, y devuelve una respuesta finalizada (texto) más metadata.
 *
 * Las herramientas son funciones que el proveedor puede invocar durante la
 * generación (function calling). El módulo AI orquesta el loop tool→respuesta
 * antes de devolver el resultado final.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AITool {
  name: string;
  description: string;
  /** JSON Schema de los parámetros que recibe la tool */
  parameters: Record<string, unknown>;
  /** Handler que ejecuta la tool y devuelve un string (serializable). */
  execute(args: Record<string, unknown>): Promise<string>;
}

export interface ChatTurnInput {
  systemPrompt: string;
  messages: ChatMessage[];
  tools: AITool[];
  /** Máximo de pasos de tool calling antes de cortar el loop. */
  maxToolSteps?: number;
}

export interface ChatTurnOutput {
  /** Texto final que se enviará al cliente. */
  text: string;
  /** Cantidad de tools que ejecutó. */
  toolCallsUsed: number;
  /** Tokens aproximados consumidos, útil para métricas. */
  tokensIn: number;
  tokensOut: number;
  /** Modelo concreto que generó la respuesta (para costear el uso). */
  model: string;
}

export type AIProviderKind = "openai" | "gemini";

export interface AIProvider {
  readonly kind: AIProviderKind;
  chat(input: ChatTurnInput): Promise<ChatTurnOutput>;
}
