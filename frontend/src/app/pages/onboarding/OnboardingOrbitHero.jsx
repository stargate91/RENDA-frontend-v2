import { useMemo } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function estimateChipRadius(label) {
  const estimatedWidth = 20 + (label.length * 7.2);
  const estimatedHeight = 28;
  return Math.hypot(estimatedWidth / 2, estimatedHeight / 2);
}

function isOutsideEllipse(candidate, chipRadius, centerX, centerY, radiusX, radiusY) {
  const expandedRadiusX = radiusX + chipRadius;
  const expandedRadiusY = radiusY + chipRadius;
  const normalized =
    ((candidate.x - centerX) ** 2) / (expandedRadiusX ** 2) +
    ((candidate.y - centerY) ** 2) / (expandedRadiusY ** 2);

  return normalized >= 1;
}

function createChipLayout(chips) {
  const placed = [];
  const minEdgeDistance = 18;
  const radiusX = 116;
  const radiusY = 70;
  const centerX = 160;
  const centerY = 84;
  const exclusionRadiusX = 86;
  const exclusionRadiusY = 58;

  const chipModels = chips.map((chip, index) => ({
    ...chip,
    index,
    radius: estimateChipRadius(chip.label),
  }));

  chipModels.forEach((chip, index) => {
    let bestCandidate = null;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distanceFactor = 0.48 + (Math.random() * 0.42);
      const candidate = {
        x: centerX + Math.cos(angle) * radiusX * distanceFactor,
        y: centerY + Math.sin(angle) * radiusY * distanceFactor,
      };

      candidate.x = clamp(candidate.x, 28, 292);
      candidate.y = clamp(candidate.y, 18, 150);

      const minFoundEdgeDistance = placed.length
        ? Math.min(...placed.map((item) => getDistance(item, candidate) - item.radius - chip.radius))
        : Number.POSITIVE_INFINITY;
      const outsideExclusionEllipse = isOutsideEllipse(
        candidate,
        chip.radius,
        centerX,
        centerY,
        exclusionRadiusX,
        exclusionRadiusY,
      );

      if (
        minFoundEdgeDistance >= minEdgeDistance &&
        outsideExclusionEllipse
      ) {
        bestCandidate = candidate;
        break;
      }

      const dx = Math.abs(candidate.x - centerX) / (exclusionRadiusX + chip.radius);
      const dy = Math.abs(candidate.y - centerY) / (exclusionRadiusY + chip.radius);
      const ellipseOverflowScore = (dx * dx) + (dy * dy) - 1;
      const score = Math.min(minFoundEdgeDistance, ellipseOverflowScore * 100);

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { ...candidate, score };
      }
    }

    placed.push({
      ...bestCandidate,
      key: `${chip.label}-${index}`,
      radius: chip.radius,
    });
  });

  return placed;
}

export default function OnboardingOrbitHero({
  icon: Icon,
  chips = [],
  className = '',
}) {
  const chipLayout = useMemo(() => createChipLayout(chips), [chips]);

  return (
    <div className={`welcome-hero-shell ${className}`.trim()}>
      <div className="welcome-hero-orbit welcome-hero-orbit-primary" />
      <div className="welcome-hero-orbit welcome-hero-orbit-secondary" />
      <div className="welcome-logo-badge">
        <div className="badge-glow" />
        {Icon ? <Icon size={40} className="badge-icon" /> : null}
      </div>

      {chips.map((chip, index) => (
        <div
          key={`${chip.label}-${index}`}
          className="welcome-hero-chip-orbit"
          style={{
            left: `${chipLayout[index]?.x ?? 160}px`,
            top: `${chipLayout[index]?.y ?? 84}px`,
            animationDuration: `${5.2 + (index * 0.45)}s`,
            animationDelay: `${index * -0.9}s`,
          }}
        >
          <div className="welcome-hero-chip">
            <span>{chip.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
