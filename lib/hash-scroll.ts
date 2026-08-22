export function safeHashId(hash: string): string | null {
  const id = hash.replace(/^#/, "");
  return /^[A-Za-z][\w:-]*$/.test(id) ? id : null;
}
