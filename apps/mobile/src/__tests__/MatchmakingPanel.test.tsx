import { Share } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MatchmakingPanel, type TimeControlOption } from '@/multiplayer/MatchmakingPanel';
import { fakeSession } from './helpers/fakeSession';

const TIME_CONTROLS: TimeControlOption[] = [
  { id: 'bullet', label: 'Bullet', desc: '1 min' },
  { id: 'blitz', label: 'Blitz', desc: '3 min +2s' },
];

function renderPanel(session = fakeSession()) {
  return render(
    <MatchmakingPanel
      session={session}
      accent="chess"
      timeControls={TIME_CONTROLS}
      onExit={() => {}}
    />,
  );
}

describe('MatchmakingPanel — the form', () => {
  it('marks the session’s time control as the selected tile', () => {
    renderPanel(fakeSession({ timeControl: 'blitz' }));
    expect(screen.getByRole('button', { name: /Blitz/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /Bullet/ })).not.toBeSelected();
  });

  it('reports a time-control change rather than holding its own copy', () => {
    const setTimeControl = jest.fn();
    renderPanel(fakeSession({ setTimeControl }));
    fireEvent.press(screen.getByRole('button', { name: /Bullet/ }));
    expect(setTimeControl).toHaveBeenCalledWith('bullet');
  });

  it('carries the rated switch, which is the same control bot games use', () => {
    const setRated = jest.fn();
    renderPanel(fakeSession({ rated: true, setRated }));
    const toggle = screen.getByRole('switch', { name: 'Rated' });
    expect(toggle).toBeChecked();
    fireEvent.press(toggle);
    expect(setRated).toHaveBeenCalledWith(false);
  });

  it('queues on Find Game', () => {
    const joinQueue = jest.fn();
    renderPanel(fakeSession({ joinQueue }));
    fireEvent.press(screen.getByRole('button', { name: 'Find Game' }));
    expect(joinQueue).toHaveBeenCalled();
  });
});

describe('MatchmakingPanel — connection state', () => {
  /**
   * Queueing over a socket that isn't up drops the request on the floor with no
   * feedback, so the button has to state the connection rather than lie about
   * being ready.
   */
  it('will not queue before the socket is up, and says why', () => {
    renderPanel(fakeSession({ connected: false }));
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
  });

  it('surfaces a handshake failure instead of sitting on “Connecting…” forever', () => {
    renderPanel(fakeSession({ connected: false, connectionError: 'Invalid token' }));
    expect(screen.getByRole('button', { name: 'Connection failed' })).toBeDisabled();
    expect(screen.getByText('Invalid token')).toBeVisible();
  });
});

describe('MatchmakingPanel — invite a friend', () => {
  it('asks for a link, then hands the link to the OS share sheet', () => {
    const createInvite = jest.fn();
    const { rerender } = renderPanel(fakeSession({ createInvite }));

    fireEvent.press(screen.getByRole('button', { name: 'Play a Friend' }));
    expect(createInvite).toHaveBeenCalled();

    // The server answers asynchronously via `invite_link_created`; the panel is
    // a pure view of whatever the session then holds.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    rerender(
      <MatchmakingPanel
        session={fakeSession({ inviteUrl: 'https://example.test/chess/play?invite=abc' })}
        accent="chess"
        timeControls={TIME_CONTROLS}
        onExit={() => {}}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Share link' }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'https://example.test/chess/play?invite=abc' }),
    );
    share.mockRestore();
  });

  /**
   * The share sheet is not guaranteed — some managed devices disable it — so the
   * link itself stays on screen and selectable rather than living only behind
   * that button.
   */
  it('shows the link as text as well as offering to share it', () => {
    renderPanel(fakeSession({ inviteUrl: 'https://example.test/chess/play?invite=abc' }));
    expect(screen.getByText('https://example.test/chess/play?invite=abc')).toBeVisible();
  });

  it('reports an expired or invalid link', () => {
    renderPanel(fakeSession({ inviteError: 'This invite has expired' }));
    expect(screen.getByText('This invite has expired')).toBeVisible();
  });
});

describe('MatchmakingPanel — queued', () => {
  it('replaces the form with the search, and offers a way out', () => {
    const cancelQueue = jest.fn();
    renderPanel(fakeSession({ status: 'queued', cancelQueue }));

    expect(screen.getByText('Finding opponent…')).toBeVisible();
    // The form is gone: a time control chosen mid-queue would not apply to the
    // game being searched for.
    expect(screen.queryByRole('button', { name: /Blitz/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find Game' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancelQueue).toHaveBeenCalled();
  });
});
