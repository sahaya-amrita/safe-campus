// TEMPORARY BOOTSTRAP SCAFFOLD — integration-owned. See SCAFFOLD.md.
// Generic test setup only; feature-specific setup belongs in each feature's tests.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
