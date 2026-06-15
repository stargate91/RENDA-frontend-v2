import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../providers/LanguageContext';
import Button from './Button';
import './PaginationBar.css';

const SLASH_SEPARATOR = '/ ';
const SLASH_SPACED = ' / ';


function PaginationPageSizes({ pageSize, pageSizeOptions, onPageSizeChange, ariaLabel }) {
  return (
    <div className="ui-pagination__sizes" role="group" aria-label={ariaLabel}>
      {pageSizeOptions.map((option) => (
        <Button
          key={option}
          type="button"
          variant="secondary-neutral"
          size="sm"
          className={`ui-pagination__size ${pageSize === option ? 'is-active' : ''}`.trim()}
          onClick={() => onPageSizeChange?.(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

function PaginationPageEditor({ currentPage, totalPages, onPageChange }) {
  const [isEditing, setIsEditing] = useState(false);
  const [pageValue, setPageValue] = useState(String(currentPage));
  const [prevCurrentPage, setPrevCurrentPage] = useState(currentPage);
  const inputRef = useRef(null);

  if (currentPage !== prevCurrentPage) {
    setPrevCurrentPage(currentPage);
    setPageValue(String(currentPage));
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const submitPage = () => {
    const parsed = Number.parseInt(pageValue, 10);
    if (Number.isNaN(parsed)) {
      setPageValue(String(currentPage));
      setIsEditing(false);
      return;
    }

    onPageChange?.(Math.min(totalPages, Math.max(1, parsed)));
    setIsEditing(false);
  };

  return (
    <div className="ui-pagination__page ui-pagination__page--editable">
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            type="number"
            min="1"
            max={totalPages}
            value={pageValue}
            onChange={(event) => setPageValue(event.target.value)}
            onBlur={submitPage}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submitPage();
              }
              if (event.key === 'Escape') {
                setPageValue(String(currentPage));
                setIsEditing(false);
              }
            }}
          />
          <span>{SLASH_SEPARATOR}{totalPages}</span>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ui-pagination__page-display"
          onClick={() => setIsEditing(true)}
        >
          {currentPage}{SLASH_SPACED}{totalPages}
        </Button>
      )}
    </div>
  );
}

export default function PaginationBar({
  summaryText,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [],
  showPageSizes = false,
  onPageChange,
  onPageSizeChange,
  labels = {},
}) {
  const { t } = useTranslation();

  return (
    <div className="ui-pagination">
      <div className="ui-pagination__meta">
        <span>{summaryText}</span>
      </div>
      <div className="ui-pagination__controls">
        {showPageSizes ? (
          <PaginationPageSizes
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={onPageSizeChange}
            ariaLabel={labels.pageSizesAriaLabel ?? t('pagination.rowsPerPage')}
          />
        ) : null}
        <div className="ui-pagination__nav">
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            className="ui-pagination__button"
            onClick={() => onPageChange?.(1)}
            disabled={currentPage === 1}
          >
            {labels.first ?? 'First'}
          </Button>
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            className="ui-pagination__button"
            onClick={() => onPageChange?.(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            {labels.prev ?? 'Prev'}
          </Button>
          <PaginationPageEditor currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            className="ui-pagination__button"
            onClick={() => onPageChange?.(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            {labels.next ?? 'Next'}
          </Button>
          <Button
            type="button"
            variant="secondary-neutral"
            size="sm"
            className="ui-pagination__button"
            onClick={() => onPageChange?.(totalPages)}
            disabled={currentPage === totalPages}
          >
            {labels.last ?? 'Last'}
          </Button>
        </div>
      </div>
    </div>
  );
}
