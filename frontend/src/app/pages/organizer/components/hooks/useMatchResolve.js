import { useState } from 'react';
import { useResolveMetadataMutation, useBulkResolveMetadataMutation } from '@/queries';

const normalizeCandidateType = (value) => {
  const normalized = String(value || '').toLowerCase();
  return normalized === 'tv' || normalized === 'series' || normalized === 'season' || normalized === 'episode'
    ? 'tv'
    : 'movie';
};

const toOptionalNumber = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildResolvePayload = (row, candidate, selectedMode, seasonValue, episodeValue) => {
  const episodeList = Array.isArray(candidate?.episodes) ? candidate.episodes : [];
  const mediaType = normalizeCandidateType(candidate?.type || candidate?.media_type || selectedMode);
  const season = toOptionalNumber(seasonValue);
  const episode = toOptionalNumber(episodeValue);

  const target = {
    tmdb_id: candidate.tmdb_id || candidate.id,
    item_type: mediaType,
  };

  const isMatchedEpisode = row.rawType === 'episode' && (row.rawStatus === 'matched' || row.rawStatus === 'renamed' || row.rawStatus === 'organized');

  if (mediaType === 'tv') {
    if (season != null) {
      target.season = season;
    } else if (isMatchedEpisode) {
      target.season = null;
    }

    if (episode != null) {
      target.episode = episode;
    } else if (isMatchedEpisode) {
      target.episode = null;
    }

    if (episodeList.length > 0) {
      target.episodes = episodeList;
    }
  }

  return {
    item_id: row.itemId,
    targets: [target],
  };
};

const getDefaultSeason = (row) => {
  const payload = row?.rawPayload || {};
  return payload.season ?? payload.fn_season ?? payload.fd_season ?? payload.it_season ?? '';
};

const getDefaultEpisode = (row) => {
  const payload = row?.rawPayload || {};
  return payload.episode ?? payload.fn_episode ?? payload.fd_episode ?? payload.it_episode ?? '';
};

export function useMatchResolve({ rows = [], t, toast, onResolved, mode, season, episode }) {
  const [confirmState, setConfirmState] = useState(null);
  const [isResolvingId, setIsResolvingId] = useState(null);
  const resolveMutation = useResolveMetadataMutation();
  const bulkResolveMutation = useBulkResolveMetadataMutation();

  const requestConfirm = (type, skipKey, onConfirm) => {
    if (localStorage.getItem(skipKey) === 'true') {
      onConfirm();
      return;
    }

    let hasExisting = false;
    let existingDetails = '';

    for (const r of rows) {
      const isMatchedEpisode = r.rawType === 'episode' && (r.rawStatus === 'matched' || r.rawStatus === 'renamed' || r.rawStatus === 'organized');
      if (!isMatchedEpisode) {
        continue;
      }
      const defaultSeasonVal = getDefaultSeason(r);
      const defaultEpisodeVal = getDefaultEpisode(r);
      if (type === 'series') {
        if (defaultSeasonVal != null || defaultEpisodeVal != null) {
          hasExisting = true;
          const parts = [];
          if (defaultSeasonVal != null) parts.push(`S${defaultSeasonVal}`);
          if (defaultEpisodeVal != null) parts.push(`E${defaultEpisodeVal}`);
          existingDetails = parts.join(' ');
          break;
        }
      } else if (type === 'season') {
        if (defaultEpisodeVal != null) {
          hasExisting = true;
          existingDetails = `E${defaultEpisodeVal}`;
          break;
        }
      }
    }

    setConfirmState({
      type,
      skipKey,
      hasExisting,
      existingDetails,
      onConfirm: () => {
        onConfirm();
        setConfirmState(null);
      },
    });
  };

  const handleResolve = async (candidate, overrides = {}) => {
    const candidateId = candidate.tmdb_id || candidate.id;
    const effectiveSeason = overrides.season !== undefined ? overrides.season : season;
    const effectiveEpisode = overrides.episode !== undefined ? overrides.episode : episode;

    const isMatchedEpisode = rows.some(r => r.rawType === 'episode' && (r.rawStatus === 'matched' || r.rawStatus === 'renamed' || r.rawStatus === 'organized'));

    const performResolve = async () => {
      setIsResolvingId(candidateId);
      try {
        await onResolved(async () => {
          if (rows.length > 1) {
            const episodeList = Array.isArray(candidate?.episodes) ? candidate.episodes : [];
            const mediaType = normalizeCandidateType(candidate?.type || candidate?.media_type || mode);
            const seasonVal = toOptionalNumber(effectiveSeason);
            const episodeVal = toOptionalNumber(effectiveEpisode);

            const target = {
              tmdb_id: candidate.tmdb_id || candidate.id,
              item_type: mediaType,
            };

            if (mediaType === 'tv') {
              if (seasonVal != null) {
                target.season = seasonVal;
              } else if (isMatchedEpisode) {
                target.season = null;
              }

              if (episodeVal != null) {
                target.episode = episodeVal;
              } else if (isMatchedEpisode) {
                target.episode = null;
              }

              if (episodeList.length > 0) {
                target.episodes = episodeList;
              }
            }

            await bulkResolveMutation.mutateAsync({
              item_ids: rows.map((r) => r.itemId),
              targets: [target],
            });
          } else {
            await resolveMutation.mutateAsync(
              buildResolvePayload(rows[0], candidate, mode, effectiveSeason, effectiveEpisode)
            );
          }
        });
        toast(t('organizer.toasts.matchResolveSuccess'), 'success');
      } catch (error) {
        toast(error.message || t('organizer.toasts.matchResolveFailed'), 'danger');
      } finally {
        setIsResolvingId(null);
      }
    };

    const isBucket = mode === 'tv' && effectiveSeason !== null && effectiveEpisode === null && Array.isArray(candidate?.episodes) && candidate.episodes.length > 0;

    if (isBucket) {
      requestConfirm('bucket', 'renda_skip_confirm_bucket', performResolve);
      return;
    }

    if (isMatchedEpisode) {
      if (mode === 'tv' && effectiveSeason === null && effectiveEpisode === null) {
        requestConfirm('series', 'renda_skip_confirm_series', performResolve);
        return;
      }
      if (mode === 'tv' && effectiveSeason !== null && effectiveEpisode === null) {
        requestConfirm('season', 'renda_skip_confirm_season', performResolve);
        return;
      }
    }

    await performResolve();
  };

  return {
    confirmState,
    setConfirmState,
    isResolvingId,
    handleResolve,
  };
}
