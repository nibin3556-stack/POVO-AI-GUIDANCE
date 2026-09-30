import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/testUtils';
import AiActivityBox from './AiActivityBox';
import AiStatusChip from './AiStatusChip';
import AiStepper from './AiStepper';
import AsyncContent from './AsyncContent';
import CtaButton from './CtaButton';
import EmptyState from './EmptyState';
import ErrorBoundary from './ErrorBoundary';
import ErrorState from './ErrorState';
import Loader from './Loader';
import ProgressBar from './ProgressBar';

const Boom = () => {
  throw new Error('kaboom');
};

describe('feedback components', () => {
  it('Loader, EmptyState and ErrorState render their messages', async () => {
    const retry = vi.fn();
    renderWithTheme(
      <>
        <Loader label="Looking up…" />
        <EmptyState message="Nothing here" variant="hint" />
        <ErrorState message="Failed" onRetry={retry} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Looking up…');
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('AsyncContent shows loading, error, empty then content', () => {
    const { rerender } = renderWithTheme(<AsyncContent isLoading>x</AsyncContent>);
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<AsyncContent isLoading={false} error={{ status: 500, message: 'Server down', data: null, requestId: null }}>x</AsyncContent>);
    expect(screen.getByRole('alert')).toHaveTextContent('Server down');
    rerender(<AsyncContent isLoading={false} isEmpty emptyMessage="Empty">x</AsyncContent>);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    rerender(<AsyncContent isLoading={false}>content</AsyncContent>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('ErrorBoundary catches render errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderWithTheme(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('kaboom');
    spy.mockRestore();
  });

  it('ProgressBar exposes its value', () => {
    renderWithTheme(<ProgressBar value={53} tone="good" label="53% of goal achieved" />);
    expect(screen.getByRole('progressbar', { name: '53% of goal achieved' })).toHaveAttribute('aria-valuenow', '53');
  });

  it('AiStepper shows running and done steps; horizontal shows all', () => {
    const steps = [
      { label: 'One', state: 'done' as const },
      { label: 'Two', state: 'run' as const },
      { label: 'Three', state: 'pending' as const },
    ];
    const { rerender } = renderWithTheme(<AiStepper steps={steps} />);
    expect(screen.queryByText('Three')).toBeNull();
    expect(screen.getByText('Two').closest('li')).toHaveAttribute('data-state', 'run');
    rerender(<AiStepper steps={steps} orientation="horizontal" />);
    expect(screen.getByText('Three')).toBeInTheDocument();
  });

  it('AiStatusChip switches between generating and generated', () => {
    const { rerender } = renderWithTheme(<AiStatusChip generating />);
    expect(screen.getByRole('status')).toHaveTextContent('AI generating');
    rerender(<AiStatusChip generating={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('AI generated');
  });

  it('AiActivityBox shows the title and steps', () => {
    renderWithTheme(<AiActivityBox title="AI is preparing Suggested Messaging" steps={[{ label: 'Step A', state: 'run' }]} />);
    expect(screen.getByText('AI is preparing Suggested Messaging')).toBeInTheDocument();
    expect(screen.getByText('Step A')).toBeInTheDocument();
  });

  it('CtaButton pulses only when enabled', async () => {
    const onClick = vi.fn();
    const { rerender } = renderWithTheme(
      <CtaButton onClick={onClick} pulse>
        Go
      </CtaButton>,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toHaveClass('animate-cta-pulse');
    await act(() => userEvent.click(screen.getByRole('button', { name: 'Go' })));
    expect(onClick).toHaveBeenCalled();
    rerender(
      <CtaButton onClick={onClick} pulse disabled>
        Go
      </CtaButton>,
    );
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go' })).not.toHaveClass('animate-cta-pulse');
  });
});
