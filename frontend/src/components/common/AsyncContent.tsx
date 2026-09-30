import type { ReactNode } from 'react';
import type { ApiError } from '../../types/api';
import EmptyState from './EmptyState';
import ErrorState from './ErrorState';
import Loader from './Loader';

interface AsyncContentProps {
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyMessage?: string;
  loadingLabel?: string;
  children: ReactNode;
}

const messageOf = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'message' in error ? (error as ApiError).message : undefined;

/** Loading → error → empty → content, the same way everywhere. */
const AsyncContent = ({ isLoading, error, onRetry, isEmpty = false, emptyMessage, loadingLabel, children }: AsyncContentProps) => {
  if (isLoading) return <Loader label={loadingLabel} fill />;
  if (error) return <ErrorState message={messageOf(error)} onRetry={onRetry} className="m-3" />;
  if (isEmpty) return <EmptyState message={emptyMessage} />;
  return <>{children}</>;
};

export default AsyncContent;
