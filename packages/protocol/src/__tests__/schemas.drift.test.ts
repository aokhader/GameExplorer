// TEMPORARY: delete with apps/api (edge migration Phase 10).
//
// While Render still serves traffic, its schemas and this package's must
// accept and refuse exactly the same payloads. The only difference allowed is
// the new `claim_flag` event. Each schema is compared twice: as JSON Schema,
// which catches a changed bound or pattern, and by parsing the same corpus,
// which catches what JSON Schema cannot say (coercion, refinements).
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as api from '../../../../apps/api/src/schemas';
import * as protocol from '../schemas';

const asJson = (schema: z.ZodType) => z.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' });

const UUID = '3f2c9a4e-8b1d-4c7a-9e02-5d6f7a8b9c0d';

/** Payloads that probe every field kind the schemas use. */
const CORPUS: unknown[] = [
  undefined, null, 'x', 7, [], {},
  { gameId: UUID }, { gameId: UUID.toUpperCase() }, { gameId: UUID.replace(/-/g, '') }, { gameId: 'junk' },
  { gameType: 'chess', timeControl: 'blitz', rated: true }, { gameType: 'go', timeControl: 'blitz', rated: true },
  { gameType: 'reversi', timeControl: 'movetime' }, { gameType: 'checkers', timeControl: 'hyperbullet' },
  { gameId: UUID, move: { type: 'chess', from: 'e2', to: 'e4' } },
  { gameId: UUID, move: { type: 'chess', from: 'e7', to: 'e8', promotion: 'queen' } },
  { gameId: UUID, move: { type: 'chess', from: 'e7', to: 'e8', promotion: 'king' } },
  { gameId: UUID, move: { type: 'checkers', from: 'c3', to: 'd4' } },
  { gameId: UUID, move: { type: 'reversi', position: 'd3' } },
  { gameId: UUID, move: { type: 'reversi', position: 'i9' } },
  { gameId: UUID, move: { type: 'pass' } },
  { gameId: UUID, text: 'hello' }, { gameId: UUID, text: '' }, { gameId: UUID, text: 'x'.repeat(1001) },
  { gameId: UUID, emote: '👍' }, { gameId: UUID, emote: '💩' },
  { inviteId: UUID }, { inviteId: 'abcdef12' },
  { token: 'abc' }, { token: '' }, { token: 'x'.repeat(8193) },
  { targetUserId: UUID }, { targetUserId: UUID, targetUsername: null }, { targetUserId: UUID, targetUsername: 'x'.repeat(65) },
  { id: '42' }, { id: 42 }, { id: '0' }, { id: '-3' }, { id: '2147483648' }, { id: '1.5' },
  { action: 'accept' }, { action: 'maybe' },
  { targetUserId: UUID, reason: 'spam', context: null, gameId: null },
  { targetUserId: UUID, reason: 'spam', context: 'x'.repeat(4001) },
  { targetUserId: UUID, reason: 'rude' },
];

function sameOnCorpus(a: z.ZodType, b: z.ZodType) {
  for (const payload of CORPUS) {
    const ra = a.safeParse(payload);
    const rb = b.safeParse(payload);
    expect(rb.success, JSON.stringify(payload)?.slice(0, 80)).toBe(ra.success);
    if (ra.success && rb.success) expect(rb.data).toEqual(ra.data);
  }
}

describe('protocol schemas vs apps/api/src/schemas.ts (temporary drift check)', () => {
  it('compares real JSON Schemas, not empty ones', () => {
    const move = JSON.stringify(asJson(protocol.MoveSchema));
    expect(move).toContain('[a-h][1-8]');
    expect(move).toContain('knight');
    expect(JSON.stringify(asJson(protocol.SocketSchemas.send_chat))).toContain('1000');
    expect(JSON.stringify(asJson(protocol.RestSchemas.friendIdParams))).toContain('2147483647');
  });

  it('the enums are the same', () => {
    expect(protocol.ONLINE_GAME_TYPES).toEqual(api.ONLINE_GAME_TYPES);
    expect(protocol.TIME_CONTROLS).toEqual(api.TIME_CONTROLS);
    expect(protocol.REPORT_REASONS).toEqual(api.REPORT_REASONS);
  });

  it('the socket events are the API’s, plus claim_flag and nothing else', () => {
    const apiEvents = Object.keys(api.SocketSchemas).sort();
    expect(Object.keys(protocol.SocketSchemas).sort()).toEqual([...apiEvents, 'claim_flag'].sort());
  });

  it.each(Object.keys(api.SocketSchemas) as Array<keyof typeof api.SocketSchemas>)('socket event %s', (event) => {
    expect(asJson(protocol.SocketSchemas[event])).toEqual(asJson(api.SocketSchemas[event]));
    sameOnCorpus(api.SocketSchemas[event], protocol.SocketSchemas[event]);
  });

  it('claim_flag takes exactly what the other game-id events take', () => {
    expect(asJson(protocol.SocketSchemas.claim_flag)).toEqual(asJson(api.SocketSchemas.resign));
    sameOnCorpus(api.SocketSchemas.resign, protocol.SocketSchemas.claim_flag);
  });

  it('the move schema', () => {
    expect(asJson(protocol.MoveSchema)).toEqual(asJson(api.MoveSchema));
    for (const payload of CORPUS) {
      const move = (payload as { move?: unknown } | null)?.move;
      if (move !== undefined) expect(protocol.MoveSchema.safeParse(move).success).toBe(api.MoveSchema.safeParse(move).success);
    }
  });

  it.each(Object.keys(api.RestSchemas) as Array<keyof typeof api.RestSchemas>)('REST schema %s', (name) => {
    expect(asJson(protocol.RestSchemas[name])).toEqual(asJson(api.RestSchemas[name]));
    sameOnCorpus(api.RestSchemas[name], protocol.RestSchemas[name]);
  });

  it('and the REST schemas are the same set', () => {
    expect(Object.keys(protocol.RestSchemas).sort()).toEqual(Object.keys(api.RestSchemas).sort());
  });
});
