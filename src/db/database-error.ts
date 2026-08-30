export function throwDatabaseError(context: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

export function requireDatabaseData<T>(context: string, data: T | null): T {
  if (data === null) {
    throw new Error(`${context}: no row returned.`);
  }

  return data;
}
