export default function HeroSection({ backdropUrl }) {
  return (
    <div className="media-detail-page__hero">
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt="Backdrop"
          className="media-detail-page__hero-backdrop"
        />
      )}
      <div className="media-detail-page__hero-overlay" />
    </div>
  );
}
