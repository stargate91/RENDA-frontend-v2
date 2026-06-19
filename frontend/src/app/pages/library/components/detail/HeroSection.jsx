export default function HeroSection({ backdropUrl, isFallback }) {
  return (
    <div className="media-detail-page__hero">
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt="Backdrop"
          className={`media-detail-page__hero-backdrop ${isFallback ? 'media-detail-page__hero-backdrop--blurred' : ''}`}
        />
      )}
      <div className="media-detail-page__hero-overlay" />
    </div>
  );
}
