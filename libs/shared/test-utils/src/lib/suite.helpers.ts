/**
 * Purpose: Provide test suite naming utilities for hierarchical test organization.
 * Exports: suiteName (converts file paths to test suite identifiers).
 * Core Flow: Transform absolute file path to relative path with separators replaced by '#'.
 */

import * as path from 'path';

/**
 * Generate a hierarchical test suite name from a file path
 * @param file - Absolute path to the test file
 * @returns Suite name with path separators replaced by '#'
 * @example suiteName(__filename) => 'libs#dal#test#infra#db.spec.ts'
 */
export const suiteName = (file: string) =>
  path.relative(`${__dirname}/../..`, file).split(path.sep).join('#');
