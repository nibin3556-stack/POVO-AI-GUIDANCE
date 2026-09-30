import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderInFormik } from '../../test/testUtils';
import FormCheckbox from './FormCheckbox';
import FormInput from './FormInput';
import FormTextArea from './FormTextArea';
import ReceptionSlider from './ReceptionSlider';

const values = () => JSON.parse(screen.getByTestId('values').textContent ?? '{}') as Record<string, unknown>;

describe('form components', () => {
  it('FormInput binds to Formik, enforces maxLength and handles Enter and blur', async () => {
    const onEnter = vi.fn();
    const onBlur = vi.fn();
    renderInFormik(<FormInput name="note" placeholder="Notes" maxLength={5} startIcon="edit_note" onEnter={onEnter} onBlur={onBlur} />, { note: '' });
    const input = screen.getByPlaceholderText('Notes');
    await userEvent.type(input, 'abcdefg{Enter}');
    expect(values().note).toBe('abcde');
    expect(onEnter).toHaveBeenCalledWith('abcde');
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledWith('abcde');
  });

  it('FormTextArea binds to Formik', async () => {
    renderInFormik(<FormTextArea name="extra" ariaLabel="Additional" placeholder="What else" />, { extra: '' });
    await userEvent.type(screen.getByLabelText('Additional'), 'Office asked');
    expect(values().extra).toBe('Office asked');
  });

  it('FormCheckbox toggles a boolean', async () => {
    const onToggle = vi.fn();
    renderInFormik(<FormCheckbox name="raised" label="Raised" onToggle={onToggle} />, { raised: false });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Raised' }));
    expect(values().raised).toBe(true);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('ReceptionSlider starts unset and moves by label click and arrow keys', async () => {
    renderInFormik(<ReceptionSlider name="reception" />, { reception: null });
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', 'Not rated');
    await userEvent.click(screen.getByRole('button', { name: 'Well Received' }));
    expect(values().reception).toBe(2);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(values().reception).toBe(1);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(values().reception).toBe(0);
    expect(slider).toHaveAttribute('aria-valuetext', 'Not Well Received');
  });

  it('ReceptionSlider follows the pointer on the track', () => {
    renderInFormik(<ReceptionSlider name="reception" />, { reception: null });
    const track = screen.getByTestId('reception-track');
    track.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 8, right: 100, bottom: 8, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(track, { clientX: 98 });
    expect(values().reception).toBe(2);
    fireEvent.pointerMove(track, { clientX: 2 });
    expect(values().reception).toBe(0);
  });
});
