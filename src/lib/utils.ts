import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const NULL_CHARACTER = String.fromCharCode(0);
const WHITESPACE_PATTERN = /\s+/g;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function removeNullCharacters(value: string): string {
  return value.split(NULL_CHARACTER).join(' ');
}

export function normalizeWhitespace(value: string): string {
  return value.replace(WHITESPACE_PATTERN, ' ').trim();
}

export function normalizeTextInput(value: unknown): string {
  if (value == null) {
    return '';
  }

  return normalizeWhitespace(removeNullCharacters(String(value)));
}

export function normalizeOptionalTextInput(value: unknown): string | null {
  const normalizedValue = normalizeTextInput(value);
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function hasText(value: unknown): boolean {
  return normalizeTextInput(value).length > 0;
}

export function limitText(value: unknown, maxLength: number): string {
  const normalizedValue = normalizeTextInput(value);

  if (!Number.isFinite(maxLength) || maxLength <= 0) {
    return '';
  }

  return normalizedValue.length > maxLength
    ? normalizedValue.slice(0, maxLength).trim()
    : normalizedValue;
}

