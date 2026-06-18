import { CollectionItemsSection } from './EntityDetailSections';

export default function CollectionDetailSections({ item, navigate, t }) {
  if (!item?.movies?.length) {
    return null;
  }

  return <CollectionItemsSection items={item.movies} navigate={navigate} t={t} />;
}
