import PersonCreditsGridSection from './PersonCreditsGridSection';

export default function PersonCreditsSections({ id, item, navigate, t }) {
  return (
    <>
      {Number(item?.total_movie_credits) > 0 && (
        <PersonCreditsGridSection
          key={`${id}-movies`}
          title={t('library.details.moviesTitle') || 'Movies'}
          personId={id}
          mediaType="movies"
          totalCount={item?.total_movie_credits}
          initialPageData={item?.initial_movie_credits_page}
          navigate={navigate}
          t={t}
        />
      )}

      {Number(item?.total_series_credits) > 0 && (
        <PersonCreditsGridSection
          key={`${id}-series`}
          title={t('library.details.tvShowsTitle') || 'TV Shows'}
          personId={id}
          mediaType="series"
          totalCount={item?.total_series_credits}
          initialPageData={item?.initial_series_credits_page}
          navigate={navigate}
          t={t}
        />
      )}
    </>
  );
}
