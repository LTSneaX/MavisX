import { useEffect, useState } from 'react'
import { useVaultStore } from '@/stores/vault-store'
import { vault, type VaultItemMeta, type VaultItemType } from '@/lib/vault'

interface Props {
  /** Vault item types to show in the picker */
  types: VaultItemType[]
  /** Called with the decrypted secret and item metadata */
  onSelect: (secret: string, item: VaultItemMeta) => void
  className?: string
}

export function VaultCredentialPicker({ types, onSelect, className }: Props) {
  const { isUnlocked } = useVaultStore()
  const [items, setItems] = useState<VaultItemMeta[]>([])

  useEffect(() => {
    if (!isUnlocked) { setItems([]); return }
    vault.listItems().then((all) => setItems(all.filter((i) => types.includes(i.type))))
  }, [isUnlocked, types.join(',')])

  if (!isUnlocked || items.length === 0) return null

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) return
    try {
      const secret = await vault.getSecret(id)
      const item = items.find((i) => i.id === id)!
      onSelect(secret, item)
    } catch {
      // vault locked mid-session — ignore
    }
    // Reset select back to placeholder so it can be re-triggered
    e.target.value = ''
  }

  return (
    <select
      onChange={handleChange}
      defaultValue=''
      className={`h-7 rounded border border-zinc-700 bg-zinc-800/80 px-2 text-[11px] text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 ${className ?? ''}`}
    >
      <option value='' disabled>
        From vault…
      </option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  )
}
