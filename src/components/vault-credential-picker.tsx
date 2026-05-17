import { useEffect, useState } from 'react'
import { vault, type VaultItemMeta, type VaultItemType, type VaultMeta } from '@/lib/vault'

interface Props {
  types: VaultItemType[]
  onSelect: (secret: string, item: VaultItemMeta) => void
  className?: string
}

interface PickerItem {
  vaultId: string
  vaultName: string
  item: VaultItemMeta
}

export function VaultCredentialPicker({ types, onSelect, className }: Props) {
  const [entries, setEntries] = useState<PickerItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const vaults: VaultMeta[] = await vault.listVaults()
        const results: PickerItem[] = []
        await Promise.all(vaults.map(async (v) => {
          const unlocked = await vault.isUnlocked(v.id)
          if (!unlocked) return
          const items = await vault.listItems(v.id)
          items.filter((i) => types.includes(i.type)).forEach((item) => {
            results.push({ vaultId: v.id, vaultName: v.name, item })
          })
        }))
        if (!cancelled) setEntries(results)
      } catch { /* vault locked or no vaults */ }
    }
    load()
    return () => { cancelled = true }
  }, [types.join(',')])

  if (entries.length === 0) return null

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (!val) return
    const [vaultId, itemId] = val.split('::')
    const entry = entries.find((x) => x.vaultId === vaultId && x.item.id === itemId)
    if (!entry) return
    try {
      const secret = await vault.getSecret(vaultId, itemId)
      onSelect(secret, entry.item)
    } catch { /* vault locked mid-session */ }
    e.target.value = ''
  }

  // Group by vault for optgroup
  const byVault = entries.reduce<Record<string, PickerItem[]>>((acc, e) => {
    if (!acc[e.vaultId]) acc[e.vaultId] = []
    acc[e.vaultId].push(e)
    return acc
  }, {})

  return (
    <select
      onChange={handleChange}
      defaultValue=''
      className={`h-7 rounded border border-zinc-700 bg-zinc-800/80 px-2 text-[11px] text-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 ${className ?? ''}`}
    >
      <option value='' disabled>From vault…</option>
      {Object.entries(byVault).map(([vaultId, items]) => (
        <optgroup key={vaultId} label={items[0].vaultName}>
          {items.map(({ item }) => (
            <option key={item.id} value={`${vaultId}::${item.id}`}>
              {item.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
