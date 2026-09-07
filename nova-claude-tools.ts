// Translates Nova's existing tool declarations (written for Gemini's
// functionDeclarations shape) into Anthropic's tool-use shape, so the
// same three tools (search_nova_memories, propose_recovery_action,
// remember_about_user) work identically regardless of which provider is
// handling a given chat turn. Kept pure and dependency-free so it's
// testable without an Anthropic client or network access - matching the
// pattern already established for nova-tools.ts.

export interface GeminiStyleToolDeclaration {
  name: string;
  description: string;
  parameters: {
    type: unknown; // Type.OBJECT from @google/genai in practice
    properties: Record<string, { type: unknown; description: string }>;
    required: string[];
  };
}

export interface ClaudeToolDeclaration {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// Gemini's Type enum values (Type.STRING, Type.OBJECT, etc.) are numeric
// at runtime, not the JSON Schema strings Claude's input_schema expects.
// Rather than depend on @google/genai's Type enum from this file (which
// would couple a provider-agnostic module to one specific provider's
// SDK), this maps by the declared TypeScript type string each tool
// parameter already uses in its description - every parameter in Nova's
// current tool set is a plain string, which covers the real case today
// without guessing at enum values this module has no reason to import.
const toJsonSchemaType = (): string => 'string';

export const toClaudeTool = (tool: GeminiStyleToolDeclaration): ClaudeToolDeclaration => {
  const properties: Record<string, { type: string; description: string }> = {};
  for (const [key, value] of Object.entries(tool.parameters.properties)) {
    properties[key] = { type: toJsonSchemaType(), description: value.description };
  }
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties,
      required: tool.parameters.required,
    },
  };
};

export const toClaudeTools = (tools: GeminiStyleToolDeclaration[]): ClaudeToolDeclaration[] =>
  tools.map(toClaudeTool);
