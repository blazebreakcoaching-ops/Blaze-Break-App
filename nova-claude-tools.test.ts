import { describe, it, expect } from 'vitest';
import { toClaudeTool, toClaudeTools, GeminiStyleToolDeclaration } from './nova-claude-tools';

const sampleTool: GeminiStyleToolDeclaration = {
  name: 'search_nova_memories',
  description: "Search the user's own saved Nova memories by keyword.",
  parameters: {
    type: 'OBJECT', // stand-in for Type.OBJECT - this module never inspects the value
    properties: {
      query: { type: 'STRING', description: 'A keyword or short phrase to search for.' },
    },
    required: ['query'],
  },
};

describe('toClaudeTool: single-tool translation', () => {
  it('preserves the tool name exactly', () => {
    expect(toClaudeTool(sampleTool).name).toBe('search_nova_memories');
  });

  it('preserves the tool description exactly', () => {
    expect(toClaudeTool(sampleTool).description).toBe(sampleTool.description);
  });

  it('wraps parameters in input_schema with type "object"', () => {
    const result = toClaudeTool(sampleTool);
    expect(result.input_schema.type).toBe('object');
  });

  it('preserves each property key and its description', () => {
    const result = toClaudeTool(sampleTool);
    expect(result.input_schema.properties.query.description).toBe('A keyword or short phrase to search for.');
  });

  it('gives every property a JSON Schema type string, not the source Gemini enum value', () => {
    const result = toClaudeTool(sampleTool);
    expect(result.input_schema.properties.query.type).toBe('string');
  });

  it('preserves the required array exactly', () => {
    const result = toClaudeTool(sampleTool);
    expect(result.input_schema.required).toEqual(['query']);
  });

  it('handles a tool with multiple parameters', () => {
    const multiParamTool: GeminiStyleToolDeclaration = {
      name: 'remember_about_user',
      description: 'Save a memory.',
      parameters: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', description: 'The memory type.' },
          content: { type: 'STRING', description: 'The memory content.' },
          confidence: { type: 'STRING', description: 'The confidence level.' },
        },
        required: ['type', 'content', 'confidence'],
      },
    };
    const result = toClaudeTool(multiParamTool);
    expect(Object.keys(result.input_schema.properties)).toEqual(['type', 'content', 'confidence']);
    expect(result.input_schema.required).toEqual(['type', 'content', 'confidence']);
  });

  it('handles a tool with no required parameters', () => {
    const noRequiredTool: GeminiStyleToolDeclaration = {
      name: 'optional_tool',
      description: 'A tool with only optional params.',
      parameters: { type: 'OBJECT', properties: {}, required: [] },
    };
    const result = toClaudeTool(noRequiredTool);
    expect(result.input_schema.required).toEqual([]);
    expect(result.input_schema.properties).toEqual({});
  });
});

describe('toClaudeTools: the full array Nova actually passes to a provider', () => {
  it('translates an empty array to an empty array', () => {
    expect(toClaudeTools([])).toEqual([]);
  });

  it('preserves order and count across multiple tools', () => {
    const secondTool: GeminiStyleToolDeclaration = {
      name: 'propose_recovery_action',
      description: 'Propose a recovery duration.',
      parameters: {
        type: 'OBJECT',
        properties: { duration: { type: 'STRING', description: 'The duration.' } },
        required: ['duration'],
      },
    };
    const result = toClaudeTools([sampleTool, secondTool]);
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('search_nova_memories');
    expect(result[1].name).toBe('propose_recovery_action');
  });
});
