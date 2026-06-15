import { EDITION_LABELS, SOURCE_LABELS, AUDIO_TYPE_LABELS, formatTime } from '../../../utils/detailUtils';
import { useMediaDetailContext } from '../MediaDetailContext';
import './PanelsCommon.css';


export default function TechnicalPanel() {
  const { state, t } = useMediaDetailContext();
  const {
    item,
    isMovie
  } = state;

  const audioCodecText = item?.technical?.audio_codec
    ? `${item.technical.audio_codec.toUpperCase()} (${item.technical.audio_channels}ch)`
    : '';
  const bitDepthText = item?.technical?.bit_depth
    ? `${item.technical.bit_depth}-bit`
    : '';
  const framerateText = item?.technical?.framerate
    ? `${parseFloat(item.technical.framerate).toFixed(3)} fps`
    : '';
  const bytesToSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
    if (i === 0) return `${bytes} ${sizes[i]}`;
    return `${(bytes / (1024 ** i)).toFixed(2)} ${sizes[i]}`;
  };
  const hasEditionSource = isMovie && (
    (item.technical?.edition && item.technical.edition !== 'none')
    || (item.technical?.source && item.technical.source !== 'none')
    || (item.technical?.audio_type && item.technical.audio_type !== 'none')
  );
  const hasSpecs = !!item?.technical;

  return (
    <div className="details-panel details-panel--custom">
      {hasEditionSource && (
        <div className="details-panel__section">
          <h4 className="details-panel__section-title">
            {t('library.details.editionAndSource') || 'Edition & Source'}
          </h4>
          <div className="specs-grid">
            {item.technical?.edition && item.technical.edition !== 'none' && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.edition') || 'Edition'}</span>
                <span className="specs-card__value" title={EDITION_LABELS[item.technical.edition] || item.technical.edition}>
                  {EDITION_LABELS[item.technical.edition] || item.technical.edition}
                </span>
              </div>
            )}
            {item.technical?.source && item.technical.source !== 'none' && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.source') || 'Source'}</span>
                <span className="specs-card__value" title={SOURCE_LABELS[item.technical.source] || item.technical.source}>
                  {SOURCE_LABELS[item.technical.source] || item.technical.source}
                </span>
              </div>
            )}
            {item.technical?.audio_type && item.technical.audio_type !== 'none' && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.audioStyle') || 'Audio Style'}</span>
                <span className="specs-card__value" title={AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}>
                  {AUDIO_TYPE_LABELS[item.technical.audio_type] || item.technical.audio_type}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {hasSpecs ? (
        <div className="details-panel__section">
          <h4 className="details-panel__section-title">
            {t('library.details.technicalInfo') || 'Technical Info'}
          </h4>
          <div className="specs-grid">
            {item.technical.resolution && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.resolution') || 'Resolution'}</span>
                <span className="specs-card__value" title={item.technical.resolution}>{item.technical.resolution}</span>
              </div>
            )}
            {item.technical.video_codec && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.videoCodec') || 'Video Codec'}</span>
                <span className="specs-card__value" title={item.technical.video_codec.toUpperCase()}>{item.technical.video_codec.toUpperCase()}</span>
              </div>
            )}
            {item.technical.audio_codec && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.audioCodec') || 'Audio Codec'}</span>
                <span className="specs-card__value" title={audioCodecText}>{audioCodecText}</span>
              </div>
            )}
            {item.technical.duration && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.duration') || 'Duration'}</span>
                <span className="specs-card__value" title={formatTime(item.technical.duration)}>{formatTime(item.technical.duration)}</span>
              </div>
            )}
            {item.technical.size_bytes && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.fileSize') || 'File Size'}</span>
                <span className="specs-card__value" title={bytesToSize(item.technical.size_bytes)}>{bytesToSize(item.technical.size_bytes)}</span>
              </div>
            )}
            {item.technical.hdr_type && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.hdr') || 'HDR'}</span>
                <span className="specs-card__value" title={item.technical.hdr_type}>{item.technical.hdr_type}</span>
              </div>
            )}
            {item.technical.bit_depth && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.bitDepth') || 'Bit Depth'}</span>
                <span className="specs-card__value" title={bitDepthText}>{bitDepthText}</span>
              </div>
            )}
            {item.technical.framerate && (
              <div className="specs-card">
                <span className="specs-card__label">{t('library.details.framerate') || 'Framerate'}</span>
                <span className="specs-card__value" title={framerateText}>{framerateText}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="details-panel__no-ratings">
          {t('library.details.noTechnicalInfo') || 'No technical info available.'}
        </div>
      )}
    </div>
  );
}
