import { buildStructurePreviewModel } from '../settingsPreviewModel.js';

function PreviewLine({ children, tone = 'default', topSpacing = false, strike = false }) {
  const className = [
    'structure-preview-line',
    tone !== 'default' ? `structure-preview-line--${tone}` : '',
    topSpacing ? 'structure-preview-line--top' : '',
    strike ? 'structure-preview-line--strike' : '',
  ].filter(Boolean).join(' ');

  return <div className={className}>{children}</div>;
}

function PreviewBranch({ children, topSpacing = false }) {
  return (
    <div className={`structure-preview-branch${topSpacing ? ' structure-preview-branch--top' : ''}`}>
      {children}
    </div>
  );
}

function PreviewArrow({ arrow }) {
  return <span className="structure-preview-arrow">{arrow}</span>;
}

function renderTreeNode(node, icons) {
  const line = (
    <PreviewLine tone={node.tone} topSpacing={node.topSpacing} strike={node.strike}>
      {node.kind === 'folder' ? icons.folder : icons.file} {node.label}{node.kind === 'folder' ? '/' : ''}
    </PreviewLine>
  );

  if (!node.children?.length) {
    return line;
  }

  return (
    <>
      {line}
      <PreviewBranch>
        {node.children.map((child, index) => (
          <div key={`${node.label}-${child.label}-${index}`}>
            {renderTreeNode(child, icons)}
          </div>
        ))}
      </PreviewBranch>
    </>
  );
}

export default function StructurePreviewPanel({ form, t }) {
  const model = buildStructurePreviewModel(form, t);

  return (
    <div className="structure-preview-container">
      <div>
        <div className="structure-preview-root">
          {model.rootIcon} {model.rootLabel}
        </div>
        <div className="structure-preview-indent">
          {model.mode === 'tree' ? (
            model.nodes.map((node, index) => (
              <div key={`${node.label}-${index}`}>
                {renderTreeNode(node, {
                  folder: model.folderIcon,
                  file: model.fileIcon,
                })}
              </div>
            ))
          ) : (
            <div className="structure-preview-rename-list">
              {model.items.map((item, index) => (
                <div key={`${item.before}-${index}`} className={index === 0 ? '' : 'structure-preview-rename-item'}>
                  <span className="structure-preview-line structure-preview-line--muted structure-preview-line--strike">
                    {model.fileIcon} {item.before}
                  </span>
                  <PreviewArrow arrow={model.arrow} />
                  <span className={`structure-preview-line structure-preview-line--${item.afterTone}${item.strike ? ' structure-preview-line--strike' : ''}`}>
                    {model.fileIcon} {item.after}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
