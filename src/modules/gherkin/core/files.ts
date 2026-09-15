/** Naming and template of new .feature files (no VS Code dependency). */
import { slugify } from '../../../shared/naming';

export const FEATURE_EXTENSION = '.feature';

export function featureFileName(featureName: string): string {
  const slug = slugify(featureName);
  return slug ? slug + FEATURE_EXTENSION : '';
}

export function featureTemplate(name: string): string {
  return `Feature: ${name.trim()}

  Scenario: First scenario
    Given a precondition
    When an action happens
    Then an outcome is expected
`;
}
