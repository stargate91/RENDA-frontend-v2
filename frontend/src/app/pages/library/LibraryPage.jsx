import Page from '@/ui/Page';
import PaginationBar from '@/ui/PaginationBar';
import Button from '@/ui/Button';
import { useLibraryState } from './hooks/useLibraryState';
import LibraryHeader from './components/LibraryHeader';
import LibraryFilters from './components/LibraryFilters';
import LibraryGrid from './components/LibraryGrid';
import AddPeopleModalContent from './components/AddPeopleModalContent';
import CreateTagModalContent from './components/CreateTagModalContent';
import { useDeleteTagMutation } from '@/queries';
import { useUi } from '@/providers/UiProvider';
import { Pencil, Tag, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import './LibraryPage.css';

export default function LibraryPage() {
  const state = useLibraryState();
  const { openModal, closeModal, toast } = useUi();
  const [focusedTagName, setFocusedTagName] = useState(null);
  const deleteTagMutation = useDeleteTagMutation();

  useEffect(() => {
    if (!state.isTags) {
      setFocusedTagName(null);
    }
  }, [state.isTags]);

  const focusedTag = useMemo(() => {
    if (!state.isTags || !focusedTagName) return null;
    return state.sortedItems.find((item) => item.name === focusedTagName) || null;
  }, [focusedTagName, state.isTags, state.sortedItems]);

  const isTagFocusMode = state.isTags && !!focusedTag;

  const handleOpenAddPeopleModal = () => {
    const isAdult = state.resolvedTab === 'adult_people';
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
        />
      ),
      footer: (
        <Button variant="secondary-neutral" onClick={closeModal}>
          {state.t('common.close') || 'Close'}
        </Button>
      ),
    });
  };

  const handleOpenCreateTagModal = () => {
    openModal({
      title: state.t('library.tags.modalTitle') || 'Create Tag',
      description: state.t('library.tags.modalDescription') || 'Create a new custom tag for organizing your media.',
      icon: Tag,
      content: (
        <CreateTagModalContent
          onClose={closeModal}
          t={state.t}
        />
      ),
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
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

  const handleOpenEditTagModal = (tag) => {
    openModal({
      title: state.t('library.tags.editModalTitle') || 'Edit Tag',
      description: state.t('library.tags.editModalDescription') || 'Rename the tag or adjust its color.',
      icon: Pencil,
      content: (
        <CreateTagModalContent
          mode="edit"
          initialTag={tag}
          onClose={closeModal}
          onSuccess={({ name }) => {
            if (focusedTagName === tag.name) {
              setFocusedTagName(name);
            }
          }}
          t={state.t}
        />
      ),
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
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

  const handleOpenDeleteTagModal = (tag) => {
    openModal({
      title: state.t('library.tags.deleteModalTitle') || 'Delete Tag',
      description: state.t('library.tags.deleteModalDescription') || 'Remove this tag from every tagged item.',
      icon: Trash2,
      content: (
        <div style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          {(state.t('library.tags.deleteConfirm') || 'Delete "{name}" and remove it from all tagged items?').replace('{name}', tag.name)}
        </div>
      ),
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', width: '100%' }}>
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

  if (state.isLoading) {
    return (
      <Page className="library-page">
        <div className="library-loading">
          <div className="library-spinner" />
        </div>
      </Page>
    );
  }

  return (
    <Page className="library-page">
      <div className="library-main">
        <div className="organizer-panel">
          <LibraryHeader
            t={state.t}
            tabs={state.tabs}
            resolvedTab={state.resolvedTab}
            setActiveTab={state.setActiveTab}
            searchPlaceholder={state.searchPlaceholder}
            setSearchQuery={state.setSearchQuery}
            onAddPeople={handleOpenAddPeopleModal}
            onCreateTag={handleOpenCreateTagModal}
          />

          <LibraryFilters
            t={state.t}
            settings={state.settings}
            resolvedTab={state.resolvedTab}
            isCollections={state.isCollections}
            isPeople={state.isPeople}
            sortKey={state.sortKey}
            setSortKey={state.setSortKey}
            sortDirection={state.sortDirection}
            setSortDirection={state.setSortDirection}
            setCurrentPage={state.setCurrentPage}
            collectionStatusFilter={state.collectionStatusFilter}
            setCollectionStatusFilter={state.setCollectionStatusFilter}
            peopleRoleFilter={state.peopleRoleFilter}
            setPeopleRoleFilter={state.setPeopleRoleFilter}
            genderFilter={state.genderFilter}
            setGenderFilter={state.setGenderFilter}
            ownershipFilter={state.ownershipFilter}
            setOwnershipFilter={state.setOwnershipFilter}
            watchedFilter={state.watchedFilter}
            setWatchedFilter={state.setWatchedFilter}
            genreFilter={state.genreFilter}
            setGenreFilter={state.setGenreFilter}
            decadeFilter={state.decadeFilter}
            setDecadeFilter={state.setDecadeFilter}
            yearFilter={state.yearFilter}
            setYearFilter={state.setYearFilter}
            timeFilterMode={state.timeFilterMode}
            setTimeFilterMode={state.setTimeFilterMode}
            favoriteFilter={state.favoriteFilter}
            setFavoriteFilter={state.setFavoriteFilter}
            filterData={state.filterData}
          />
        </div>

        {/* Top Pagination Bar */}
        {state.shouldShowPagination && !isTagFocusMode ? (
          <PaginationBar
            summaryText={state.summaryText}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            pageSize={state.pageSize}
            pageSizeOptions={[20, 40, 80, 160]}
            showPageSizes
            onPageChange={state.setCurrentPage}
            onPageSizeChange={state.setPageSize}
            labels={state.t('organizer.pagination')}
          />
        ) : null}

        {/* Content Area */}
        <LibraryGrid
          t={state.t}
          isDataLoading={state.isDataLoading}
          paginatedItems={state.paginatedItems}
          isTags={state.isTags}
          isCollections={state.isCollections}
          resolvedTab={state.resolvedTab}
          emptyTitle={state.emptyTitle}
          emptyDescription={state.emptyDescription}
          emptyStateVariant={state.emptyStateVariant}
          emptyIcon={state.emptyIcon}
          hasActiveFilters={state.hasActiveFilters}
          onAddPeople={handleOpenAddPeopleModal}
          onCreateTag={handleOpenCreateTagModal}
          onEditTag={handleOpenEditTagModal}
          onDeleteTag={handleOpenDeleteTagModal}
          focusedTag={focusedTag}
          onFocusTag={setFocusedTagName}
          onExitTagFocus={() => setFocusedTagName(null)}
        />

        {/* Bottom Pagination Bar */}
        {state.shouldShowPagination && !isTagFocusMode && state.paginatedItems.length > 0 ? (
          <PaginationBar
            summaryText={state.summaryText}
            currentPage={state.currentPage}
            totalPages={state.totalPages}
            pageSize={state.pageSize}
            onPageChange={state.setCurrentPage}
            labels={state.t('organizer.pagination')}
          />
        ) : null}

        {state.shouldShowPagination && !isTagFocusMode && state.paginatedItems.length > 0 ? (
          <div className="library-bottom-spacer" aria-hidden="true" />
        ) : null}
      </div>
    </Page>
  );
}
