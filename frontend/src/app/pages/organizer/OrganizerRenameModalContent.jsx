import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { compareOrganizerValues } from './organizerMappers';
import Input from '../../ui/Input';
import SortButton from '../../ui/SortButton';
import { useOrganizerSort } from './useOrganizerSort';
import '../../styles/RenameModal.css';

export default function OrganizerRenameModalContent({ items = [], t }) {
  const [searchQuery, setSearchQuery] = useState('');
  const { sortConfig, handleSortToggle } = useOrganizerSort('target', 'asc');

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter((item) => {
      const original = (item.source || '').toLowerCase();
      const proposed = (item.target || '').toLowerCase();
      const typeStr = (item.type || '').toLowerCase();
      return original.includes(query) || proposed.includes(query) || typeStr.includes(query);
    });
  }, [items, searchQuery]);

  const sortedItems = useMemo(() => {
    const result = [...filteredItems];
    if (sortConfig.key) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key] || '';
        const valB = b[sortConfig.key] || '';
        const comp = compareOrganizerValues(valA, valB);
        return sortConfig.direction === 'asc' ? comp : -comp;
      });
    }
    return result;
  }, [filteredItems, sortConfig]);

  return (
    <div className="organizer-rename-modal">
      <div className="organizer-rename-modal__search">
        <Input
          type="text"
          placeholder={t('organizer.searchPlaceholder') || 'Search files...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={Search}
        />
      </div>

      <div className="organizer-rename-modal__summary">
        <span>
          Showing {sortedItems.length} of {items.length} items to rename
        </span>
      </div>

      <div className="organizer-rename-modal__list-container">
        <table className="organizer-rename-modal__table">
          <thead>
            <tr className="organizer-rename-modal__header-row">
              <th className="organizer-rename-modal__header-col organizer-rename-modal__header-col--source">
                <SortButton
                  isActive={sortConfig.key === 'source'}
                  label={t('organizer.table.originalFilename') || 'Current Filename'}
                  onToggle={() => handleSortToggle('source')}
                  sortDirection={sortConfig.direction}
                />
              </th>
              <th className="organizer-rename-modal__header-col organizer-rename-modal__header-col--target">
                <SortButton
                  isActive={sortConfig.key === 'target'}
                  label={t('organizer.table.proposedFilename') || 'New Filename'}
                  onToggle={() => handleSortToggle('target')}
                  sortDirection={sortConfig.direction}
                />
              </th>
              <th className="organizer-rename-modal__header-col organizer-rename-modal__header-col--type">
                <SortButton
                  isActive={sortConfig.key === 'type'}
                  label={t('organizer.table.type') || 'Type'}
                  onToggle={() => handleSortToggle('type')}
                  sortDirection={sortConfig.direction}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => (
              <tr key={item.id} className="organizer-rename-modal__row">
                <td className="organizer-rename-modal__col organizer-rename-modal__col--source" title={item.sourcePath}>
                  {item.source}
                </td>
                <td className="organizer-rename-modal__col organizer-rename-modal__col--target" title={item.targetPath}>
                  {item.target}
                </td>
                <td className="organizer-rename-modal__col organizer-rename-modal__col--type">
                  {item.type}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sortedItems.length === 0 && (
          <div className="organizer-rename-modal__empty">
            No matching items found
          </div>
        )}
      </div>
    </div>
  );
}
