import { X } from 'lucide-react';
import { useTranslation } from '../providers/LanguageContext';
import IconButton from './IconButton';
import Tooltip from './Tooltip';
import './Modal.css';

export default function Modal({ open, title, description, children, footer, onClose, variant, icon: Icon, className }) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className="ui-modal-backdrop" onClick={onClose}>
        <div
          className={`ui-modal ${variant ? `ui-modal--${variant}` : ''} ${className || ''}`.trim()}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
        <header className="ui-modal__header">
          <div>
            {title ? (
              <h3 className="ui-modal__title">
                {Icon ? <Icon className="ui-modal__title-icon" size={20} /> : null}
                <span>{title}</span>
              </h3>
            ) : null}
            {description ? <p className="ui-modal__description">{description}</p> : null}
          </div>
          <Tooltip content={t('common.close')} side="top">
            <IconButton type="button" className="ui-modal__close" onClick={onClose} label={t('common.close')} title={null} size="sm">
              <X size={16} />
            </IconButton>
          </Tooltip>
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
      </div>
    </div>
    </>
  );
}
