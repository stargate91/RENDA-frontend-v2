export default function EntityDetailStatusSection({ title, message }) {
  return (
    <section className="entity-detail-page__content-section entity-detail-page__content-section--status">
      <div className="entity-detail-page__status-card">
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}
