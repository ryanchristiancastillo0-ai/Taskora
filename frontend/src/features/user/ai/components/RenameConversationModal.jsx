import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

export default function RenameConversationModal({
  open,
  onClose,
  name,
  onNameChange,
  error,
  onSave,
  saving,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Rename conversation">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          onSave()
        }}
        noValidate
      >
        {error && (
          <p className="rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-error">
            {error}
          </p>
        )}
        <Input
          label="Name"
          required
          placeholder="e.g. Weekly planning"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          autoFocus
        />
        <div className="mt-1 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={saving}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
