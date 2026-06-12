import React from 'react';
import './RatingPill.css';

export default function RatingPill({ children, type = 'imdb', className = '', ...props }) {
  return (
    <span className={`ui-rating-pill ui-rating-pill--${type} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}
