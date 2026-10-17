import { describe, it, expect } from 'vitest';
import { buildExtractionPrompt, NHEI_EXTRACTION_RESPONSE_SCHEMA } from './nhei-extraction-schema';

describe('NHEI_EXTRACTION_RESPONSE_SCHEMA', () => {
  it('has no field capable of holding raw text - only structural classification fields', () => {
    const itemProps = Object.keys((NHEI_EXTRACTION_RESPONSE_SCHEMA.properties.candidates.items as any).properties);
    expect(itemProps.sort()).toEqual([
      'abstain', 'candidateId', 'dimensions', 'evidenceQuality', 'relatedCandidateIds',
      'relativeOrder', 'selfSystems', 'sourceType', 'timeUncertainty',
    ]);
    expect(itemProps).not.toContain('text');
    expect(itemProps).not.toContain('quote');
    expect(itemProps).not.toContain('content');
  });

  it('constrains sourceType to an enum excluding every privileged/trusted value', () => {
    const sourceTypeEnum = (NHEI_EXTRACTION_RESPONSE_SCHEMA.properties.candidates.items as any).properties.sourceType.enum;
    expect(sourceTypeEnum).not.toContain('EXTERNALLY_VERIFIED_EVENT');
    expect(sourceTypeEnum).not.toContain('SYSTEM_HYPOTHESIS');
    expect(sourceTypeEnum).not.toContain('USER_CONFIRMED_INTERPRETATION');
    expect(sourceTypeEnum).not.toContain('SYSTEM_OBSERVATION');
  });

  it('requires every candidate field except the optional relatedCandidateIds', () => {
    const required = (NHEI_EXTRACTION_RESPONSE_SCHEMA.properties.candidates.items as any).required;
    expect(required).toContain('abstain');
    expect(required).toContain('sourceType');
    expect(required).not.toContain('relatedCandidateIds');
  });
});

describe('buildExtractionPrompt', () => {
  it('includes every conversation turn, numbered in order', () => {
    const prompt = buildExtractionPrompt({ turns: ['first thing said', 'second thing said'] });
    expect(prompt).toContain('0. first thing said');
    expect(prompt).toContain('1. second thing said');
  });

  it('explicitly instructs against asserting causation and against claiming third-party unreported thoughts', () => {
    const prompt = buildExtractionPrompt({ turns: ['anything'] });
    expect(prompt.toLowerCase()).toContain('never assert that one event caused another');
    expect(prompt.toLowerCase()).toContain('never claim to know what a third party');
  });

  it('instructs abstention rather than guessing', () => {
    const prompt = buildExtractionPrompt({ turns: ['anything'] });
    expect(prompt.toLowerCase()).toContain('abstain: true');
  });

  it('handles an empty turn list without error', () => {
    expect(() => buildExtractionPrompt({ turns: [] })).not.toThrow();
  });
});
