export default function MetaRow({ items = [], className = '' }) {
  const filteredItems = items.filter((item) => item !== null && item !== undefined && item !== '');

  return (
    <div className={`ui-meta-row ${className}`.trim()}>
      {filteredItems.map((item, index) => (
        <span key={`${String(item)}-${index}`} className="ui-meta-row__item">
          {item}
        </span>
      ))}
    </div>
  );
}
