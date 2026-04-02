/**
 * Purpose: Provide object manipulation utilities
 */

/**
 * Creates an object composed of the own enumerable string keyed properties of object
 * that are not null or undefined.
 *
 * @param obj The source object
 * @returns The new object with non-null/undefined properties
 */
export function compactObject<T extends object>(obj: T): Partial<T> {
  const result: any = {};

  Object.keys(obj).forEach((key) => {
    const value = (obj as any)[key];
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  });

  return result;
}
