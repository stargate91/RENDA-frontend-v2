import { Mars, User, Venus, VenusAndMars } from 'lucide-react';
import { Briefcase, Calendar, CalendarX2, Check, Layers, MapPin, X } from 'lucide-react';
import { isTvLikeMediaType } from '@/lib/mediaTypes';

export function getGenderLabel(gender, t) {
  if (gender === 1 || gender === '1') {
    return t('library.details.female') || 'Female';
  }
  if (gender === 2 || gender === '2') {
    return t('library.details.male') || 'Male';
  }
  if (gender === 3 || gender === '3') {
    return t('library.details.nonBinary') || 'Non-binary';
  }
  return null;
}

export function getGenderIcon(gender) {
  if (gender === 1 || gender === '1') {
    return Venus;
  }
  if (gender === 2 || gender === '2') {
    return Mars;
  }
  if (gender === 3 || gender === '3') {
    return VenusAndMars;
  }
  return User;
}

export function normalizeCreditType(item) {
  return isTvLikeMediaType(item?.media_type || item?.type) ? 'tv' : 'movie';
}

export function normalizeCreditTitle(item) {
  return String(item?.title || item?.name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getCreditIdentityCandidates(item) {
  return [
    item?.tmdb_id,
    item?.series_tmdb_id,
    item?.library_series_tmdb_id,
    item?.library_item_id,
    item?.id,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
}

export function isKnownForMatch(entry, knownForEntry) {
  if (normalizeCreditType(entry) !== normalizeCreditType(knownForEntry)) {
    return false;
  }

  const entryIds = getCreditIdentityCandidates(entry);
  const knownForIds = getCreditIdentityCandidates(knownForEntry);
  if (entryIds.some((id) => knownForIds.includes(id))) {
    return true;
  }

  const entryTitle = normalizeCreditTitle(entry);
  const knownForTitle = normalizeCreditTitle(knownForEntry);
  const entryYear = String(entry?.year || '');
  const knownForYear = String(knownForEntry?.year || '');

  if (!entryTitle || !knownForTitle) {
    return false;
  }

  if (entryTitle === knownForTitle && entryYear === knownForYear) {
    return true;
  }

  return entryTitle === knownForTitle;
}

export function prioritizePersonCredits(items, knownForItems) {
  if (!items?.length) {
    return [];
  }

  const knownForRank = new Map(
    (knownForItems || []).map((entry, index) => {
      const ids = getCreditIdentityCandidates(entry);
      const key = ids[0] || `${normalizeCreditType(entry)}:${normalizeCreditTitle(entry)}:${entry?.year || ''}`;
      return [key, index];
    })
  );

  return [...items]
    .map((entry) => {
      const matchedKnownFor = (knownForItems || []).find((knownForEntry) => isKnownForMatch(entry, knownForEntry));
      const matchIds = matchedKnownFor ? getCreditIdentityCandidates(matchedKnownFor) : [];
      const fallbackKey = `${normalizeCreditType(entry)}:${normalizeCreditTitle(entry)}:${entry?.year || ''}`;
      const rankKey = matchIds[0] || fallbackKey;
      return {
        ...entry,
        is_known_for: Boolean(matchedKnownFor),
        known_for_rank: matchedKnownFor ? (knownForRank.get(rankKey) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => {
      if (Boolean(a?.is_known_for) !== Boolean(b?.is_known_for)) {
        return a?.is_known_for ? -1 : 1;
      }

      if (a?.is_known_for && b?.is_known_for) {
        return (a?.known_for_rank ?? Number.MAX_SAFE_INTEGER) - (b?.known_for_rank ?? Number.MAX_SAFE_INTEGER);
      }

      if (Boolean(a?.in_library) !== Boolean(b?.in_library)) {
        return a?.in_library ? -1 : 1;
      }

      const yearDiff = (Number(b?.year) || 0) - (Number(a?.year) || 0);
      if (yearDiff !== 0) {
        return yearDiff;
      }

      return String(a?.title || '').localeCompare(String(b?.title || ''));
    });
}

export function getTmdbBackdropScore(item) {
  const rating = Number(item?.rating_tmdb ?? item?.rating ?? 0);
  const voteCount = Number(item?.vote_count ?? 0);
  return (rating * 100) + (Math.log10(Math.max(voteCount, 1)) * 24);
}

export function sortBackdropCredits(items) {
  return [...(items || [])].sort((a, b) => {
    const scoreDiff = getTmdbBackdropScore(b) - getTmdbBackdropScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    const yearDiff = (Number(b?.year) || 0) - (Number(a?.year) || 0);
    if (yearDiff !== 0) {
      return yearDiff;
    }
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

export function normalizeBackdropKey(path) {
  if (!path) {
    return '';
  }
  const normalized = String(path).trim();
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

export function mergeBackdropCreditPages(pages) {
  const seen = new Set();
  const merged = [];
  (pages || []).forEach((page) => {
    (page?.items || []).forEach((entry) => {
      const key = String(entry?.tmdb_id || entry?.id || `${entry?.title || entry?.name || ''}-${entry?.year || ''}`);
      if (!key || seen.has(key)) {
        return;
      }
      seen.add(key);
      merged.push(entry);
    });
  });
  return merged;
}

export function buildPersonExternalLinks(item, t) {
  if (!item?.id) {
    return [];
  }

  const externalIds = item.external_ids || {};
  const links = [
    {
      key: 'tmdb',
      label: t('library.details.tmdb') || 'TMDb',
      href: `https://www.themoviedb.org/person/${item.id}`,
      iconSrc: '/links/tmdb.svg',
      brandColor: 'var(--color-brand-tmdb)',
    },
    item.homepage
      ? {
          key: 'website',
          label: t('library.details.website') || 'Website',
          href: item.homepage,
          iconSrc: '/links/website.svg',
          brandColor: 'var(--color-text-primary)',
        }
      : null,
    externalIds.imdb_id
      ? {
          key: 'imdb',
          label: t('library.details.imdb') || 'IMDb',
          href: `https://www.imdb.com/name/${externalIds.imdb_id}`,
          iconSrc: '/links/imdb.svg',
          brandColor: 'var(--color-brand-imdb)',
        }
      : null,
    externalIds.instagram_id
      ? {
          key: 'instagram',
          label: 'Instagram',
          href: `https://www.instagram.com/${externalIds.instagram_id}`,
          iconSrc: '/links/instagram.svg',
          brandColor: '#f77737',
        }
      : null,
    externalIds.facebook_id
      ? {
          key: 'facebook',
          label: 'Facebook',
          href: `https://www.facebook.com/${externalIds.facebook_id}`,
          iconSrc: '/links/facebook.svg',
          brandColor: '#1877f2',
        }
      : null,
    externalIds.twitter_id
      ? {
          key: 'x',
          label: 'X',
          href: `https://x.com/${externalIds.twitter_id}`,
          iconSrc: '/links/x.svg',
          brandColor: '#ffffff',
        }
      : null,
    externalIds.youtube_id
      ? {
          key: 'youtube',
          label: 'YouTube',
          href: `https://www.youtube.com/${externalIds.youtube_id.startsWith('@') ? externalIds.youtube_id : `@${externalIds.youtube_id}`}`,
          iconSrc: '/links/youtube.svg',
          brandColor: '#ff0033',
        }
      : null,
    externalIds.tiktok_id
      ? {
          key: 'tiktok',
          label: 'TikTok',
          href: `https://www.tiktok.com/@${externalIds.tiktok_id.replace(/^@/, '')}`,
          iconSrc: '/links/tiktok.svg',
          brandColor: '#25f4ee',
        }
      : null,
  ];

  return links.filter(Boolean);
}

export function buildEntityMetaPills({ isPeople, item, t }) {
  return isPeople
    ? [
        (() => {
          const GenderIcon = getGenderIcon(item?.gender);
          const genderLabel = getGenderLabel(item?.gender, t);
          if (!genderLabel) {
            return null;
          }

          return {
            key: 'gender',
            content: (
              <span className="entity-detail-page__meta-pill-content">
                <GenderIcon size={14} />
                <span>{genderLabel}</span>
              </span>
            ),
          };
        })(),
        item?.known_for_department ? {
          key: 'department',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <Briefcase size={14} />
              <span>{item.known_for_department}</span>
            </span>
          ),
        } : null,
        item?.birthday ? {
          key: 'birthday',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <Calendar size={14} />
              <span>{item.birthday}</span>
            </span>
          ),
        } : null,
        item?.deathday ? {
          key: 'deathday',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <CalendarX2 size={14} />
              <span>{item.deathday}</span>
            </span>
          ),
        } : null,
        item?.place_of_birth ? {
          key: 'place-of-birth',
          content: (
            <span className="entity-detail-page__meta-pill-content">
              <MapPin size={14} />
              <span>{item.place_of_birth}</span>
            </span>
          ),
        } : null,
      ].filter(Boolean)
    : [
        item?.total_count !== undefined
          ? {
              key: 'total-count',
              content: (
                <span className="entity-detail-page__meta-pill-content">
                  <Layers size={14} />
                  <span>
                    {t('library.details.totalCount', {
                      count: item.total_count,
                      defaultValue: `${item.total_count} total`,
                    })}
                  </span>
                </span>
              ),
            }
          : null,
        item?.owned_count !== undefined
          ? {
              key: 'owned-count',
              content: (
                <span className="entity-detail-page__meta-pill-content">
                  {Number(item.owned_count) === 0 ? <X size={14} /> : <Check size={14} />}
                  <span>
                    {t('library.details.inLibraryCount', {
                      count: item.owned_count,
                      defaultValue: `${item.owned_count} in library`,
                    })}
                  </span>
                </span>
              ),
            }
          : null,
      ].filter(Boolean);
}

export function enrichKnownForItems(knownForItems, movies, series) {
  if (!knownForItems?.length) {
    return [];
  }

  const movieRatings = new Map(
    (movies || [])
      .filter((entry) => entry?.id != null)
      .map((entry) => [String(entry.id), entry.rating_imdb])
  );

  const seriesRatings = new Map();
  for (const entry of series || []) {
    const rating = entry?.rating_imdb;
    const keys = [entry?.series_tmdb_id, entry?.tmdb_id, entry?.id];
    for (const key of keys) {
      if (key != null && !seriesRatings.has(String(key)) && rating != null) {
        seriesRatings.set(String(key), rating);
      }
    }
  }

  return knownForItems.map((entry) => {
    const isTv = isTvLikeMediaType(entry.media_type || entry.type);
    const lookupKeys = isTv
      ? [entry.series_tmdb_id, entry.library_series_tmdb_id, entry.tmdb_id, entry.id]
      : [entry.library_item_id, entry.tmdb_id, entry.id];

    const sourceMap = isTv ? seriesRatings : movieRatings;
    const fallbackImdb = lookupKeys
      .map((key) => (key != null ? sourceMap.get(String(key)) : null))
      .find((value) => value != null);

    return {
      ...entry,
      rating_imdb: entry.rating_imdb ?? fallbackImdb ?? null,
    };
  });
}
