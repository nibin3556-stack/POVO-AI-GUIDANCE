import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithTheme } from '../../test/testUtils';
import AiSparkle from './AiSparkle';
import AppCard from './AppCard';
import Avatar from './Avatar';
import CheckMark from './CheckMark';
import DecileChip from './DecileChip';
import Eyebrow from './Eyebrow';
import FocusTag from './FocusTag';
import HcpsText from './HcpsText';
import Icon from './Icon';
import RoleChip from './RoleChip';
import SegmentTag from './SegmentTag';
import StatusChip from './StatusChip';
import TierTag from './TierTag';

describe('display components', () => {
  it('Icon renders a ligature and is decorative unless labelled', () => {
    const { container, rerender } = renderWithTheme(<Icon name="arrow_forward" />);
    expect(container.querySelector('.ms')).toHaveAttribute('aria-hidden', 'true');
    rerender(<Icon name="close" label="Close" />);
    expect(screen.getByRole('img', { name: 'Close' })).toHaveTextContent('close');
  });

  it('AiSparkle renders the SVG and can spin', () => {
    renderWithTheme(<AiSparkle spinning />);
    expect(screen.getByTestId('ai-sparkle')).toHaveClass('animate-ai-spin');
  });

  it('HcpsText keeps the lowercase s of HCPs', () => {
    const { container } = renderWithTheme(<HcpsText text="12 of 20 HCPs" />);
    expect(container).toHaveTextContent('12 of 20 HCPs');
    expect(container.querySelector('.normal-case')).toHaveTextContent('s');
  });

  it('Eyebrow renders uppercase text with the HCPs rule', () => {
    const { container } = renderWithTheme(<Eyebrow text="Super High HCPs" />);
    expect(container.firstChild).toHaveClass('uppercase');
    expect(container.querySelector('.normal-case')).not.toBeNull();
  });

  it('RoleChip, DecileChip, FocusTag, SegmentTag and TierTag show their labels', () => {
    renderWithTheme(
      <>
        <RoleChip role="PA" />
        <DecileChip decile={7} tier="SH" />
        <FocusTag label="Humira" color="#7C3AED" />
        <SegmentTag label="Immediate" color="#156CB4" />
        <TierTag tier="MED" label="Medium" range="D6–5" />
      </>,
    );
    expect(screen.getByText('PA')).toBeInTheDocument();
    expect(screen.getByText('D7')).toHaveAttribute('title', 'Super High');
    expect(screen.getByTitle('Humira')).toBeInTheDocument();
    expect(screen.getByText('Immediate')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('D6–5')).toBeInTheDocument();
  });

  it('StatusChip applies its variant', () => {
    renderWithTheme(<StatusChip variant="good">On Track</StatusChip>);
    expect(screen.getByText('On Track')).toHaveClass('text-green');
  });

  it('CheckMark shows a tick only when checked', () => {
    const { container, rerender } = renderWithTheme(<CheckMark checked={false} />);
    expect(container).not.toHaveTextContent('check');
    rerender(<CheckMark checked tone="green" />);
    expect(container).toHaveTextContent('check');
  });

  it('Avatar shows initials', () => {
    renderWithTheme(<Avatar initials="VT" />);
    expect(screen.getByText('VT')).toBeInTheDocument();
  });

  it('AppCard renders title, subtitle, actions and body', () => {
    renderWithTheme(
      <AppCard title="Must-Wins" subtitle="Portland, ME territory" actions={<button type="button">act</button>}>
        <p>body</p>
      </AppCard>,
    );
    expect(screen.getByRole('heading', { name: 'Must-Wins' })).toBeInTheDocument();
    expect(screen.getByText('Portland, ME territory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
