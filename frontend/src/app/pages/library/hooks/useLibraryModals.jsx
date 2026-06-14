import { useUi } from '@/providers/UiProvider';
import Button from '@/ui/Button';
import AddPeopleModalContent from '../modals/AddPeopleModalContent';
import BulkImportResolveModalContent from '../modals/BulkImportResolveModalContent';
import CreateTagModalContent from '../modals/CreateTagModalContent';
import { Pencil, Tag, Trash2, Users, AlertCircle } from 'lucide-react';

export function useLibraryModals({ state, focusedTagName, setFocusedTagName, deleteTagMutation }) {
  const { openModal, closeModal, toast } = useUi();

  const openAddPeopleModal = () => {
    const isAdult = state.activeSessionMode === 'nsfw';
    openModal({
      title: isAdult
        ? (state.t('library.addPeople.adultModalTitle') || 'Add Adult People')
        : (state.t('library.addPeople.modalTitle') || 'Add People'),
      description: isAdult
        ? (state.t('library.addPeople.adultModalDescription') || 'Activate or search for adult people to add to the library.')
        : (state.t('library.addPeople.modalDescription') || 'Activate or search for people to add to the library.'),
      icon: Users,
      className: 'ui-modal--wide',
      content: (
        <AddPeopleModalContent
          isAdult={isAdult}
          t={state.t}
          onClose={closeModal}
        />
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {state.t('common.close') || 'Close'}
        </Button>
      ),
    });
  };

  const openCreateTagModal = () => {
    const isAdult = state.activeSessionMode === 'nsfw';
    openModal({
      title: state.t('library.tags.modalTitle') || 'Create Tag',
      description: state.t('library.tags.modalDescription') || 'Create a new custom tag for organizing your media.',
      icon: Tag,
      content: (
        <CreateTagModalContent
          onClose={closeModal}
          t={state.t}
          defaultColor="#3b82f6"
          isAdult={isAdult}
        />
      ),
      footer: (
        <div className="library-modal-footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {state.t('common.close') || 'Close'}
          </Button>
          <Button variant="primary" type="submit" form="create-tag-form">
            {state.t('common.create') || 'Create'}
          </Button>
        </div>
      ),
    });
  };

  const openEditTagModal = (tag) => {
    const isAdult = state.activeSessionMode === 'nsfw';
    openModal({
      title: state.t('library.tags.editModalTitle') || 'Edit Tag',
      description: state.t('library.tags.editModalDescription') || 'Rename the tag or adjust its color.',
      icon: Pencil,
      content: (
        <CreateTagModalContent
          mode="edit"
          initialTag={tag}
          onClose={closeModal}
          isAdult={isAdult}
          onSuccess={({ name }) => {
            if (focusedTagName === tag.name) {
              setFocusedTagName(name);
            }
          }}
          t={state.t}
        />
      ),
      footer: (
        <div className="library-modal-footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {state.t('common.close') || 'Close'}
          </Button>
          <Button variant="primary" type="submit" form="edit-tag-form">
            {state.t('common.save') || 'Save'}
          </Button>
        </div>
      ),
    });
  };

  const openDeleteTagModal = (tag) => {
    openModal({
      title: state.t('library.tags.deleteModalTitle') || 'Delete Tag',
      description: state.t('library.tags.deleteModalDescription') || 'Remove this tag from every tagged item.',
      icon: Trash2,
      variant: 'danger',
      content: (
        <div className="library-modal-confirm-text">
          {(state.t('library.tags.deleteConfirm') || 'Delete "{name}" and remove it from all tagged items?').replace('{name}', tag.name)}
        </div>
      ),
      footer: (
        <div className="library-modal-footer">
          <Button variant="secondary-neutral" onClick={closeModal}>
            {state.t('common.cancel') || 'Cancel'}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await deleteTagMutation.mutateAsync(tag.id);
                if (focusedTagName === tag.name) {
                  setFocusedTagName(null);
                }
                closeModal();
              } catch (error) {
                toast(error?.message || 'Failed to delete tag', 'error');
              }
            }}
          >
            {state.t('library.tags.deleteBtn') || 'Delete Tag'}
          </Button>
        </div>
      ),
    });
  };

  const openBulkImportResolveModal = () => {
    const isAdult = state.activeSessionMode === 'nsfw';
    openModal({
      title: state.t(isAdult ? 'library.addPeople.adultResolveModalTitle' : 'library.addPeople.resolveModalTitle'),
      description: state.t(isAdult ? 'library.addPeople.adultResolveModalDescription' : 'library.addPeople.resolveModalDescription'),
      icon: AlertCircle,
      className: 'ui-modal--extra-wide',
      content: (
        <BulkImportResolveModalContent
          onClose={closeModal}
          t={state.t}
          isAdult={isAdult}
        />
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {state.t('common.close') || 'Close'}
        </Button>
      ),
    });
  };

  return {
    openAddPeopleModal,
    openCreateTagModal,
    openEditTagModal,
    openDeleteTagModal,
    openBulkImportResolveModal,
  };
}
