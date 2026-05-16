import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { type Connection } from '@/lib/db'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentRow: Connection | null
  onDelete: (id: string) => Promise<void>
}

export function ConnectionDeleteDialog({ open, onOpenChange, currentRow, onDelete }: Props) {
  async function handleDelete() {
    if (!currentRow) return
    await onDelete(currentRow.id)
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete connection?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{currentRow?.name}</strong> will be permanently removed. Any saved credentials in the vault linked to this connection will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant='outline' size='sm' onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant='destructive' size='sm' onClick={handleDelete}>Delete</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
