// Utility functions for working with Document type
import type { Document } from "./document-types";

/**
 * Type-safe assignment for Document fields using string keys.
 * Only allows assignment if key is a valid key of Document.
 */
export function setDocumentField<T extends Document, K extends keyof T>(
  doc: T,
  key: K,
  value: T[K]
): T {
  return { ...doc, [key]: value };
}

/**
 * Type-safe Object.entries for Document, preserving key types.
 */
export function documentEntries<T extends Document>(doc: T): [keyof T, T[keyof T]][] {
  return Object.entries(doc) as [keyof T, T[keyof T]][];
}
