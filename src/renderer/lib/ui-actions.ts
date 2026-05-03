export function fireAndForget(task: Promise<unknown>, label = "UI action"): void {
  // Surface async UI failures in the renderer console instead of silently abandoning them.
  void task.catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[${label}]`, error);
  });
}
