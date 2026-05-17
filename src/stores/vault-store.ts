// Vault store is intentionally minimal — per-vault lock state is managed
// locally in VaultPage. This stub exists only for legacy compatibility.
export const useVaultStore = () => ({ isUnlocked: false })
