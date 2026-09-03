import { fireEvent, render, screen } from '@testing-library/react-native';
import { GAME_ACCENTS } from '@finesse/ui';
import { CustomEloPicker } from '@/game/CustomEloPicker';

const accent = GAME_ACCENTS.chess.base;
const tint = GAME_ACCENTS.chess.tintBg;

function renderPicker(value: number, { min = 400, max = 2800 } = {}) {
  const onChange = jest.fn();
  render(
    <CustomEloPicker
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      accent={accent}
      tint={tint}
    />,
  );
  return onChange;
}

/** The readout doubles as the exact-entry field. */
const field = () => screen.getByLabelText(/^Bot rating, /);

describe('CustomEloPicker', () => {
  it('nudges the rating by the stepper amounts', () => {
    const onChange = renderPicker(1500);
    fireEvent.press(screen.getByRole('button', { name: 'Increase rating by 25' }));
    expect(onChange).toHaveBeenCalledWith(1525);

    fireEvent.press(screen.getByRole('button', { name: 'Decrease rating by 100' }));
    expect(onChange).toHaveBeenLastCalledWith(1400);
  });

  it('clamps steppers to the range instead of overshooting', () => {
    const onChange = renderPicker(2750);
    fireEvent.press(screen.getByRole('button', { name: 'Increase rating by 100' }));
    expect(onChange).toHaveBeenCalledWith(2800);
  });

  it('disables a stepper that would not move the value', () => {
    renderPicker(2800);
    expect(screen.getByRole('button', { name: 'Increase rating by 25' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease rating by 25' })).toBeEnabled();
  });

  it('accepts an exact rating typed into the readout', () => {
    const onChange = renderPicker(1200);
    fireEvent(field(), 'focus');
    fireEvent.changeText(field(), '1637');
    // Nothing is committed mid-edit — "1", "16", "163" would each clamp.
    expect(onChange).not.toHaveBeenCalled();

    fireEvent(field(), 'blur');
    expect(onChange).toHaveBeenCalledWith(1637);
  });

  it('clamps a typed rating that is out of range', () => {
    const onChange = renderPicker(1200);
    fireEvent(field(), 'focus');
    fireEvent.changeText(field(), '9999');
    fireEvent(field(), 'blur');
    expect(onChange).toHaveBeenCalledWith(2800);
  });

  it('honours a lowered ceiling (build without the native engine)', () => {
    const onChange = renderPicker(1350, { max: 1399 });
    fireEvent.press(screen.getByRole('button', { name: 'Increase rating by 100' }));
    expect(onChange).toHaveBeenCalledWith(1399);
    expect(screen.getByText('1399')).toBeOnTheScreen();
  });

  it('describes what the chosen rating plays like', () => {
    renderPicker(650);
    expect(screen.getByText(/Beginner/)).toBeOnTheScreen();

    screen.unmount();
    renderPicker(2600);
    expect(screen.getByText(/Master/)).toBeOnTheScreen();
  });
});
