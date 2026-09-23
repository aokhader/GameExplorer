import { fireEvent, render, screen } from '@testing-library/react-native';
import { NoticesList } from '@/legal/NoticesList';
import { NOTICES, NOTICE_TEXTS } from '@/legal/notices.generated';

/**
 * The in-app open-source notices.
 *
 * The screen exists because the binary owes these notices and a link to the
 * repository does not deliver them. What is worth pinning is that the things
 * a source map cannot see — the vendored engine, the fonts, the CC0 content —
 * are present, and that every row opens onto real licence text.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('./helpers/reanimatedMock').mockReanimated());

describe('generated notices', () => {
  it('points every row at a licence text that exists', () => {
    expect(NOTICES.length).toBeGreaterThan(0);
    for (const n of NOTICES) {
      expect(NOTICE_TEXTS[n.textIndex]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('carries the notices a JavaScript source map cannot see', () => {
    const names = NOTICES.map((n) => n.name).join('\n');
    expect(names).toMatch(/Arasan/);
    expect(names).toMatch(/Fathom/);
    expect(names).toMatch(/react-native-arasan/);
    expect(names).toMatch(/Phosphor/);
    expect(names).toMatch(/DM Sans/);
    expect(names).toMatch(/Lichess/);
    expect(names).toMatch(/Merida/);
  });

  it('includes the font licence and no GPL text', () => {
    const all = NOTICE_TEXTS.join('\n');
    expect(all).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(all).not.toMatch(/GNU GENERAL PUBLIC LICENSE/);
  });
});

describe('NoticesList', () => {
  it('lists the engine and opens its licence on tap', () => {
    render(<NoticesList />);
    expect(screen.queryByTestId('notice-text')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: /^Arasan chess engine/ }));
    expect(screen.getByTestId('notice-text')).toHaveTextContent(/Copyright 1994-2026 by Jon Dart/);
  });
});
