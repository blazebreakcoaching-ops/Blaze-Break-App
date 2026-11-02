import { buildNovaMobileChatBody, NOVA_MOBILE_MAX_MESSAGE_LENGTH, NOVA_MOBILE_HISTORY_LIMIT, type NovaMobileMessage } from './nova-chat-contract';

const user = (text: string): NovaMobileMessage => ({ role: 'user', parts: [{ text }] });
const model = (text: string): NovaMobileMessage => ({ role: 'model', parts: [{ text }] });

describe('native Nova chat request', () => {
  it('submits only the current message and a bounded recent role/parts history', () => {
    const history = Array.from({ length: 45 }, (_, n) => n % 2 ? model('Nova ' + n) : user('User ' + n));
    const body = buildNovaMobileChatBody('  Help with my workload  ', history);
    expect(body.message).toBe('Help with my workload');
    expect(body.history).toHaveLength(NOVA_MOBILE_HISTORY_LIMIT);
    expect(body.history[0].parts[0].text).toBe('Nova 25');
    expect(body.history[19].parts[0].text).toBe('User 44');
    expect(Object.keys(body).sort()).toEqual(['history', 'message']);
  });

  it('refuses empty and oversized messages before network requests', () => {
    expect(() => buildNovaMobileChatBody('   ', [])).toThrow();
    expect(() => buildNovaMobileChatBody('x'.repeat(NOVA_MOBILE_MAX_MESSAGE_LENGTH + 1), [])).toThrow();
    expect(buildNovaMobileChatBody('x'.repeat(NOVA_MOBILE_MAX_MESSAGE_LENGTH), []).message).toHaveLength(NOVA_MOBILE_MAX_MESSAGE_LENGTH);
  });

  it('does not mutate the displayed messages while bounding history', () => {
    const long = user('x'.repeat(2400));
    const msgs = [long];
    const result = buildNovaMobileChatBody('hello', msgs);
    expect(result.history[0].parts[0].text).toHaveLength(NOVA_MOBILE_MAX_MESSAGE_LENGTH);
    expect(msgs[0].parts[0].text).toHaveLength(2400);
  });
});
