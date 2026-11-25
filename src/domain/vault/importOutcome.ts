/** The message for a batch import into the Knowledge Vault: never reports a failed save as imported. */
export function vaultImportOutcome(saved: number, total: number): { message: string; variant: "success" | "warning" | "error" } {
  if (total > 0 && saved === total) {
    return { message: `Imported ${saved} verified reference${saved === 1 ? "" : "s"} into Knowledge Vault.`, variant: "success" };
  }
  if (saved > 0) {
    return { message: `Imported ${saved} of ${total} references. The rest could not be saved to your Vault; try again.`, variant: "warning" };
  }
  return { message: "No references could be saved to your Knowledge Vault. Unlock the Vault or check your connection, then try again.", variant: "error" };
}
