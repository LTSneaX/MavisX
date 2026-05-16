import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { type MonitorWithStatus } from '@/lib/db'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: MonitorWithStatus | null
  onDelete: (id: string) => Promise<void>
}

export function MonitorDeleteDialog({ open, onOpenChange, currentRow, onDelete }: Props) {
  async function handleDelete() {
    if (!currentRow) return
    try {
      await onDelete(currentRow.id)
      onOpenChange(false)
      toast.success(`"${currentRow.name}" deleted`)
    } catch {
      toast.error('Failed to delete monitor')
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete monitor?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{currentRow?.name}</strong> and all its check history will be permanently deleted.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
