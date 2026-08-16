import type { GameSession } from '@/multiplayer/session';

/**
 * A complete, inert `useGameSession` value for view tests.
 *
 * Deliberately typed as `GameSession` rather than cast: the hook's shape is the
 * contract between `packages/client` and every native multiplayer screen, so a
 * field appearing or disappearing there should break this file — which is a
 * compile error naming the field — rather than surfacing as a runtime undefined
 * inside a component test.
 */
export function fakeSession(overrides: Partial<GameSession> = {}): GameSession {
  const base: GameSession = {
    // identity / connection
    user: null,
    loading: false,
    connected: true,
    connectionError: null,
    emit: jest.fn(),
    socket: null,
    username: 'Player',
    // store state
    status: 'idle',
    gameId: null,
    myColor: null,
    gameState: null,
    opponent: null,
    drawOffered: false,
    aborted: false,
    opponentGone: false,
    opponentGraceMs: 0,
    // matchmaking form
    timeControl: 'blitz',
    setTimeControl: jest.fn(),
    rated: true,
    setRated: jest.fn(),
    // invite flow
    inviteUrl: null,
    inviteError: null,
    creating: false,
    createInvite: jest.fn(),
    acceptInvite: jest.fn(),
    accepting: false,
    // actions
    joinQueue: jest.fn(),
    cancelQueue: jest.fn(),
    sendMove: jest.fn(),
    resign: jest.fn(),
    abort: jest.fn(),
    offerDraw: jest.fn(),
    acceptDraw: jest.fn(),
    declineDraw: jest.fn(),
    playAgain: jest.fn(),
    // chat
    chatLog: [],
    chatText: '',
    setChatText: jest.fn(),
    sendChat: jest.fn(),
    // derived
    isWhite: true,
    myClockMs: 0,
    oppClockMs: 0,
    activeColor: undefined,
    endData: null,
    myResult: null,
  };
  return { ...base, ...overrides };
}
