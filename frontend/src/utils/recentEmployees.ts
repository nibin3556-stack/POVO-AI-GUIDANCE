import type { Employee } from '../types/models';

/**
 * Recently viewed-as employees, per signed-in user, in this browser only.
 * A convenience list, never a source of truth: storage can be empty, blocked
 * or throw (private windows), and every pick is re-validated by the backend.
 */
export const RECENT_EMPLOYEES_MAX = 5;
const key = (ownerId: string) => `povo.impersonation.recent.${ownerId}`;

export const readRecentEmployees = (ownerId: string): Employee[] => {
  try {
    const raw = localStorage.getItem(key(ownerId));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Employee[]).filter((e) => e && typeof e.employee_id === 'string') : [];
  } catch {
    return [];
  }
};

export const rememberRecentEmployee = (ownerId: string, employee: Employee): void => {
  try {
    const rest = readRecentEmployees(ownerId).filter((e) => e.employee_id !== employee.employee_id);
    localStorage.setItem(key(ownerId), JSON.stringify([employee, ...rest].slice(0, RECENT_EMPLOYEES_MAX)));
  } catch {
    /* Storage unavailable: the list simply stays empty. */
  }
};
