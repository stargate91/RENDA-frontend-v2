export const scrollOrganizerToTop = () => {
  const shellContent = document.querySelector('.shell__content');
  if (shellContent) {
    shellContent.scrollTo({ top: 0, behavior: 'auto' });
    return;
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
};
