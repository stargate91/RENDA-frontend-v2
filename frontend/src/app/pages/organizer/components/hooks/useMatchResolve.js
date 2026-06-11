import { useState } from 'react';
import { useResolveMetadataMutation } from '@/queries';

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

  if (mediaType === 'tv' && season != null) {
    target.season = season;
  }

  if (mediaType === 'tv' && episode != null) {
    target.episode = episode;
  }

  if (mediaType === 'tv' && episodeList.length > 0) {
    target.episodes = episodeList;
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

export function useMatchResolve({ row, t, toast, onResolved, mode, season, episode }) {
  const [confirmState, setConfirmState] = useState(null);
  const [isResolvingId, setIsResolvingId] = useState(null);
  const resolveMutation = useResolveMetadataMutation();

  const requestConfirm = (type, skipKey, onConfirm) => {
    if (localStorage.getItem(skipKey) === 'true') {
      onConfirm();
      return;
    }

    const defaultSeasonVal = getDefaultSeason(row);
    const defaultEpisodeVal = getDefaultEpisode(row);
    let hasExisting = false;
    let existingDetails = '';

    if (type === 'series') {
      if (defaultSeasonVal != null || defaultEpisodeVal != null) {
        hasExisting = true;
        const parts = [];
        if (defaultSeasonVal != null) parts.push(`S${defaultSeasonVal}`);
        if (defaultEpisodeVal != null) parts.push(`E${defaultEpisodeVal}`);
        existingDetails = parts.join(' ');
      }
    } else if (type === 'season') {
      if (defaultEpisodeVal != null) {
        hasExisting = true;
        existingDetails = `E${defaultEpisodeVal}`;
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

    const performResolve = async () => {
      setIsResolvingId(candidateId);
      try {
        await resolveMutation.mutateAsync(buildResolvePayload(row, candidate, mode, effectiveSeason, effectiveEpisode));
        await onResolved();
        toast(t('organizer.toasts.matchResolveSuccess'), 'success');
      } catch (error) {
        toast(error.message || t('organizer.toasts.matchResolveFailed'), 'danger');
      } finally {
        setIsResolvingId(null);
      }
    };

    if (mode === 'tv' && effectiveSeason === null && effectiveEpisode === null) {
      requestConfirm('series', 'renda_skip_confirm_series', performResolve);
      return;
    }
    if (mode === 'tv' && effectiveSeason !== null && effectiveEpisode === null) {
      const isBucket = Array.isArray(candidate?.episodes) && candidate.episodes.length > 0;
      if (isBucket) {
        requestConfirm('bucket', 'renda_skip_confirm_bucket', performResolve);
      } else {
        requestConfirm('season', 'renda_skip_confirm_season', performResolve);
      }
      return;
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
