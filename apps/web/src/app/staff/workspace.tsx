import { createContext, useCallback, useContext } from 'react';
import { ROUTES } from '../routes';

/**
 * Staff views are shared by the responder workspace and the admin console.
 * A view links to a section ("incidents", "help", …) through this context, so
 * the link stays inside the current workspace when that workspace has the
 * section, and otherwise opens it in the responder workspace.
 */
export interface StaffWorkspace {
  base: string;
  sections: readonly string[];
}

const StaffWorkspaceContext = createContext<StaffWorkspace>({
  base: ROUTES.responder.root,
  sections: [],
});

export const StaffWorkspaceProvider = StaffWorkspaceContext.Provider;

export function useStaffLink(): (section: string, ...rest: string[]) => string {
  const { base, sections } = useContext(StaffWorkspaceContext);
  return useCallback(
    (section: string, ...rest: string[]) =>
      [sections.includes(section) ? base : ROUTES.responder.root, section, ...rest].join('/'),
    [base, sections],
  );
}
