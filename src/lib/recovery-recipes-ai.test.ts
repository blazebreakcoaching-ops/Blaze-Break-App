import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./secure-api', () => ({ secureApiFetch: vi.fn() }));

import { secureApiFetch } from './secure-api';
import { getRecipeEnhancement } from './recovery-recipes-ai';

const jsonResponse = (body: any) => ({ json: async () => body } as any);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRecipeEnhancement', () => {
  it('returns the enhancement on a valid response', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: 'A grounded reason.', preferredStepOrder: ['release'] }));
    const result = await getRecipeEnhancement({ situationKey: 'hard_meeting' });
    expect(result).toEqual({ reason: 'A grounded reason.', preferredStepOrder: ['release'] });
  });

  it('never sends raw free text - only the labelled fields given', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: 'ok' }));
    await getRecipeEnhancement({ situationKey: 'hard_meeting', capacity: 'a_little', optionalStepTypes: ['release'] });
    const call = (secureApiFetch as any).mock.calls[0];
    expect(call[0]).toBe('/api/recovery-recipes/enhance');
    expect(call[1].data).toEqual({ situationKey: 'hard_meeting', capacity: 'a_little', optionalStepTypes: ['release'] });
  });

  it('returns null rather than throwing on a network error (AI must remain optional)', async () => {
    (secureApiFetch as any).mockRejectedValue(new Error('network down'));
    const result = await getRecipeEnhancement({ situationKey: 'hard_meeting' });
    expect(result).toBeNull();
  });

  it('returns null when the response has no usable reason', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: '' }));
    expect(await getRecipeEnhancement({ situationKey: 'hard_meeting' })).toBeNull();
    (secureApiFetch as any).mockResolvedValue(jsonResponse({}));
    expect(await getRecipeEnhancement({ situationKey: 'hard_meeting' })).toBeNull();
  });

  it('drops a preferredStepOrder entry that is not a recognised step type, keeping the valid ones', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: 'ok', preferredStepOrder: ['release', 'not_a_real_type'] }));
    const result = await getRecipeEnhancement({ situationKey: 'hard_meeting' });
    expect(result?.preferredStepOrder).toEqual(['release']);
  });

  it('omits preferredStepOrder entirely when every entry is invalid', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: 'ok', preferredStepOrder: ['not_a_real_type'] }));
    const result = await getRecipeEnhancement({ situationKey: 'hard_meeting' });
    expect(result?.preferredStepOrder).toBeUndefined();
  });

  it('omits reflectionQuestion when it is blank or missing', async () => {
    (secureApiFetch as any).mockResolvedValue(jsonResponse({ reason: 'ok', reflectionQuestion: '   ' }));
    const result = await getRecipeEnhancement({ situationKey: 'hard_meeting' });
    expect(result?.reflectionQuestion).toBeUndefined();
  });
});
