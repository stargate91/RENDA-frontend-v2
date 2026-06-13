import './PosterGrid.css';

export default function PosterGrid({ children, className = '' }) {
  return (
    <div className={`ui-poster-grid ${className}`.trim()}>
      {children}
    </div>
  );
}
