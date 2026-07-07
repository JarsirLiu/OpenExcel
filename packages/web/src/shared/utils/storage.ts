const SESSION_KEYS = [
  "openexcel:activeWorkspaceId",
  "openexcel:workbookIdx",
  "openexcel:sheetIdx",
  "openexcel:sessionId",
];

export function clearSessionStorage() {
  try {
    for (const key of SESSION_KEYS) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}