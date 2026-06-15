import { useState } from 'react';
import './ReviewModalContent.css';


export default function ReviewModalContent({ initialComment, onSave, t }) {
  const [comment, setComment] = useState(initialComment || '');
  const maxChars = 2000;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(comment);
  };

  const charCountLabel = `${comment.length} / ${maxChars}`;

  return (
    <form id="review-modal-form" onSubmit={handleSubmit} className="review-modal-form">
      <div className="review-modal-wrapper">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, maxChars))}
          placeholder={t('library.details.reviewPlaceholder') || 'Write your review here...'}
          className="review-modal-textarea"
        />
        <div className="review-modal-char-count">
          {charCountLabel}
        </div>
      </div>
    </form>
  );
}
